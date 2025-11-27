const logger = require('./logger');

/**
 * Analytics module for calculating statistics and patterns from aviator game data
 * Provides comprehensive analytical capabilities including:
 * - Multiplier distribution analysis
 * - Pattern identification
 * - Win rate analysis by multiplier
 * - Volatility calculations
 * - Time-series trend analysis
 * - ROI and strategy performance evaluation
 */
class Analytics {
    constructor() {
        this.logger = logger;
    }

    /**
     * Calculate multiplier distribution across game rounds
     * Groups multipliers into ranges and calculates frequency, percentage, and statistics
     *
     * @param {Array} gameData - Array of game rounds with multiplier values
     * @param {Object} options - Configuration options
     * @param {Array} options.ranges - Custom ranges for grouping (optional)
     * @returns {Object} - Distribution statistics with ranges, frequencies, and percentages
     */
    calculateMultiplierDistribution(gameData, options = {}) {
        try {
            if (!gameData || gameData.length === 0) {
                logger.warn('No game data provided for multiplier distribution');
                return { ranges: [], total: 0, statistics: null };
            }

            // Default multiplier ranges
            const defaultRanges = [
                { min: 0, max: 1.5, label: '1.0-1.5x' },
                { min: 1.5, max: 2.0, label: '1.5-2.0x' },
                { min: 2.0, max: 3.0, label: '2.0-3.0x' },
                { min: 3.0, max: 5.0, label: '3.0-5.0x' },
                { min: 5.0, max: 10.0, label: '5.0-10.0x' },
                { min: 10.0, max: Infinity, label: '10.0x+' }
            ];

            const ranges = options.ranges || defaultRanges;
            const total = gameData.length;

            // Initialize range counters
            const distribution = ranges.map(range => ({
                range: range.label,
                min: range.min,
                max: range.max,
                count: 0,
                percentage: 0,
                multipliers: []
            }));

            // Extract multipliers and categorize into ranges
            gameData.forEach(game => {
                const multiplier = game.multiplier || game.crashMultiplier || 0;

                for (let i = 0; i < distribution.length; i++) {
                    const range = distribution[i];
                    if (multiplier >= range.min && multiplier < range.max) {
                        range.count++;
                        range.multipliers.push(multiplier);
                        break;
                    }
                }
            });

            // Calculate percentages and statistics for each range
            distribution.forEach(range => {
                range.percentage = total > 0 ? ((range.count / total) * 100).toFixed(2) : 0;

                if (range.multipliers.length > 0) {
                    range.avgMultiplier = (range.multipliers.reduce((sum, m) => sum + m, 0) / range.multipliers.length).toFixed(2);
                    range.minMultiplier = Math.min(...range.multipliers).toFixed(2);
                    range.maxMultiplier = Math.max(...range.multipliers).toFixed(2);
                } else {
                    range.avgMultiplier = 0;
                    range.minMultiplier = 0;
                    range.maxMultiplier = 0;
                }

                // Remove raw multipliers array to keep response clean
                delete range.multipliers;
            });

            // Calculate overall statistics
            const allMultipliers = gameData.map(g => g.multiplier || g.crashMultiplier || 0);
            const statistics = this._calculateBasicStatistics(allMultipliers);

            logger.debug(`Calculated multiplier distribution for ${total} games`);

            return {
                ranges: distribution,
                total: total,
                statistics: statistics
            };
        } catch (error) {
            logger.error(`Failed to calculate multiplier distribution: ${error.message}`);
            throw error;
        }
    }

    /**
     * Identify patterns in game data
     * Detects consecutive sequences, hot/cold streaks, and recurring patterns
     *
     * @param {Array} gameData - Array of game rounds with multiplier values
     * @param {Object} options - Configuration options
     * @param {number} options.minSequenceLength - Minimum length for pattern detection (default: 3)
     * @param {number} options.threshold - Multiplier threshold for high/low classification (default: 2.0)
     * @returns {Object} - Identified patterns including streaks, sequences, and trends
     */
    identifyPatterns(gameData, options = {}) {
        try {
            if (!gameData || gameData.length === 0) {
                logger.warn('No game data provided for pattern identification');
                return { patterns: [], streaks: [], summary: null };
            }

            const minSequenceLength = options.minSequenceLength || 3;
            const threshold = options.threshold || 2.0;

            const patterns = {
                consecutiveHighs: [],
                consecutiveLows: [],
                alternatingPattern: [],
                streaks: {
                    currentStreak: null,
                    longestHighStreak: { count: 0, startIndex: 0, endIndex: 0 },
                    longestLowStreak: { count: 0, startIndex: 0, endIndex: 0 }
                },
                trends: {
                    increasing: 0,
                    decreasing: 0,
                    stable: 0
                }
            };

            let currentHighStreak = 0;
            let currentLowStreak = 0;
            let highStreakStart = 0;
            let lowStreakStart = 0;

            // Analyze each game round
            for (let i = 0; i < gameData.length; i++) {
                const multiplier = gameData[i].multiplier || gameData[i].crashMultiplier || 0;
                const isHigh = multiplier >= threshold;

                // Track streaks
                if (isHigh) {
                    if (currentHighStreak === 0) {
                        highStreakStart = i;
                    }
                    currentHighStreak++;
                    currentLowStreak = 0;

                    // Update longest high streak
                    if (currentHighStreak > patterns.streaks.longestHighStreak.count) {
                        patterns.streaks.longestHighStreak = {
                            count: currentHighStreak,
                            startIndex: highStreakStart,
                            endIndex: i,
                            avgMultiplier: this._calculateAverageForRange(gameData, highStreakStart, i)
                        };
                    }
                } else {
                    if (currentLowStreak === 0) {
                        lowStreakStart = i;
                    }
                    currentLowStreak++;
                    currentHighStreak = 0;

                    // Update longest low streak
                    if (currentLowStreak > patterns.streaks.longestLowStreak.count) {
                        patterns.streaks.longestLowStreak = {
                            count: currentLowStreak,
                            startIndex: lowStreakStart,
                            endIndex: i,
                            avgMultiplier: this._calculateAverageForRange(gameData, lowStreakStart, i)
                        };
                    }
                }

                // Detect trends (compare with previous values)
                if (i > 0) {
                    const prevMultiplier = gameData[i - 1].multiplier || gameData[i - 1].crashMultiplier || 0;
                    const diff = multiplier - prevMultiplier;
                    const changePct = Math.abs(diff / prevMultiplier);

                    if (changePct < 0.1) { // Less than 10% change
                        patterns.trends.stable++;
                    } else if (diff > 0) {
                        patterns.trends.increasing++;
                    } else {
                        patterns.trends.decreasing++;
                    }
                }
            }

            // Set current streak
            patterns.streaks.currentStreak = {
                type: currentHighStreak > 0 ? 'high' : (currentLowStreak > 0 ? 'low' : 'none'),
                count: Math.max(currentHighStreak, currentLowStreak)
            };

            // Detect alternating patterns
            patterns.alternatingPattern = this._detectAlternatingPattern(gameData, threshold, minSequenceLength);

            // Calculate pattern summary
            const summary = {
                totalGames: gameData.length,
                threshold: threshold,
                highGames: gameData.filter(g => (g.multiplier || g.crashMultiplier || 0) >= threshold).length,
                lowGames: gameData.filter(g => (g.multiplier || g.crashMultiplier || 0) < threshold).length,
                longestHighStreakCount: patterns.streaks.longestHighStreak.count,
                longestLowStreakCount: patterns.streaks.longestLowStreak.count,
                trendBreakdown: {
                    increasing: ((patterns.trends.increasing / (gameData.length - 1)) * 100).toFixed(2) + '%',
                    decreasing: ((patterns.trends.decreasing / (gameData.length - 1)) * 100).toFixed(2) + '%',
                    stable: ((patterns.trends.stable / (gameData.length - 1)) * 100).toFixed(2) + '%'
                }
            };

            logger.debug(`Identified patterns in ${gameData.length} games`);

            return {
                patterns: patterns,
                summary: summary
            };
        } catch (error) {
            logger.error(`Failed to identify patterns: ${error.message}`);
            throw error;
        }
    }

    /**
     * Calculate win rate segmented by target multiplier
     * Analyzes betting success rates for different multiplier targets
     *
     * @param {Array} betData - Array of bet history with target multipliers and outcomes
     * @param {Object} options - Configuration options
     * @param {number} options.granularity - Step size for grouping multipliers (default: 0.5)
     * @returns {Object} - Win rates by multiplier with detailed statistics
     */
    getWinRateByMultiplier(betData, options = {}) {
        try {
            if (!betData || betData.length === 0) {
                logger.warn('No bet data provided for win rate calculation');
                return { segments: [], overall: null };
            }

            const granularity = options.granularity || 0.5;

            // Group bets by target multiplier ranges
            const multiplierGroups = {};

            betData.forEach(bet => {
                if (!bet.targetMultiplier) return;

                // Round to nearest granularity
                const groupKey = Math.floor(bet.targetMultiplier / granularity) * granularity;

                if (!multiplierGroups[groupKey]) {
                    multiplierGroups[groupKey] = {
                        multiplier: groupKey,
                        totalBets: 0,
                        wins: 0,
                        losses: 0,
                        totalWagered: 0,
                        totalProfit: 0,
                        bets: []
                    };
                }

                const group = multiplierGroups[groupKey];
                group.totalBets++;
                group.totalWagered += bet.betAmount || 0;
                group.totalProfit += bet.profitLoss || bet.profit || 0;
                group.bets.push(bet);

                if (bet.won) {
                    group.wins++;
                } else {
                    group.losses++;
                }
            });

            // Calculate win rates and statistics for each group
            const segments = Object.values(multiplierGroups).map(group => {
                const winRate = group.totalBets > 0 ? ((group.wins / group.totalBets) * 100) : 0;
                const avgBetSize = group.totalBets > 0 ? (group.totalWagered / group.totalBets) : 0;
                const roi = group.totalWagered > 0 ? ((group.totalProfit / group.totalWagered) * 100) : 0;
                const avgProfit = group.totalBets > 0 ? (group.totalProfit / group.totalBets) : 0;

                return {
                    multiplierRange: `${group.multiplier.toFixed(1)}x - ${(group.multiplier + granularity).toFixed(1)}x`,
                    multiplier: group.multiplier,
                    totalBets: group.totalBets,
                    wins: group.wins,
                    losses: group.losses,
                    winRate: parseFloat(winRate.toFixed(2)),
                    totalWagered: parseFloat(group.totalWagered.toFixed(2)),
                    totalProfit: parseFloat(group.totalProfit.toFixed(2)),
                    avgBetSize: parseFloat(avgBetSize.toFixed(2)),
                    avgProfit: parseFloat(avgProfit.toFixed(2)),
                    roi: parseFloat(roi.toFixed(2))
                };
            }).sort((a, b) => a.multiplier - b.multiplier);

            // Calculate overall statistics
            const overall = {
                totalBets: betData.length,
                totalWins: betData.filter(b => b.won).length,
                totalLosses: betData.filter(b => !b.won).length,
                overallWinRate: parseFloat(((betData.filter(b => b.won).length / betData.length) * 100).toFixed(2)),
                totalWagered: parseFloat(betData.reduce((sum, b) => sum + (b.betAmount || 0), 0).toFixed(2)),
                totalProfit: parseFloat(betData.reduce((sum, b) => sum + (b.profitLoss || b.profit || 0), 0).toFixed(2)),
                overallROI: null
            };

            overall.overallROI = overall.totalWagered > 0 ?
                parseFloat(((overall.totalProfit / overall.totalWagered) * 100).toFixed(2)) : 0;

            logger.debug(`Calculated win rates for ${segments.length} multiplier segments`);

            return {
                segments: segments,
                overall: overall,
                granularity: granularity
            };
        } catch (error) {
            logger.error(`Failed to calculate win rate by multiplier: ${error.message}`);
            throw error;
        }
    }

    /**
     * Calculate volatility metrics for game multipliers
     * Measures variance, standard deviation, and risk metrics
     *
     * @param {Array} gameData - Array of game rounds with multiplier values
     * @param {Object} options - Configuration options
     * @param {number} options.windowSize - Rolling window size for volatility calculation (default: 20)
     * @returns {Object} - Volatility metrics including variance, std dev, and risk measures
     */
    calculateVolatility(gameData, options = {}) {
        try {
            if (!gameData || gameData.length === 0) {
                logger.warn('No game data provided for volatility calculation');
                return { volatility: null, rolling: [] };
            }

            const windowSize = options.windowSize || 20;
            const multipliers = gameData.map(g => g.multiplier || g.crashMultiplier || 0);

            // Calculate overall volatility
            const statistics = this._calculateBasicStatistics(multipliers);

            // Calculate additional volatility metrics
            const mean = statistics.mean;
            const variance = statistics.variance;
            const stdDev = statistics.stdDev;

            // Coefficient of variation (relative volatility)
            const coefficientOfVariation = mean > 0 ? (stdDev / mean) : 0;

            // Calculate rolling volatility
            const rollingVolatility = [];
            for (let i = windowSize - 1; i < multipliers.length; i++) {
                const window = multipliers.slice(i - windowSize + 1, i + 1);
                const windowStats = this._calculateBasicStatistics(window);

                rollingVolatility.push({
                    index: i,
                    timestamp: gameData[i].timestamp || null,
                    windowStdDev: parseFloat(windowStats.stdDev.toFixed(4)),
                    windowMean: parseFloat(windowStats.mean.toFixed(2)),
                    windowCoeffVar: windowStats.mean > 0 ?
                        parseFloat((windowStats.stdDev / windowStats.mean).toFixed(4)) : 0
                });
            }

            // Calculate risk metrics
            const sortedMultipliers = [...multipliers].sort((a, b) => a - b);
            const percentile5 = this._calculatePercentile(sortedMultipliers, 5);
            const percentile95 = this._calculatePercentile(sortedMultipliers, 95);
            const medianMultiplier = this._calculatePercentile(sortedMultipliers, 50);

            // Value at Risk (VaR) - simple historical method
            // Represents the 5th percentile (95% confidence that crash won't be below this)
            const valueAtRisk = percentile5;

            const volatilityMetrics = {
                overall: {
                    mean: parseFloat(mean.toFixed(2)),
                    median: parseFloat(medianMultiplier.toFixed(2)),
                    variance: parseFloat(variance.toFixed(4)),
                    stdDev: parseFloat(stdDev.toFixed(4)),
                    coefficientOfVariation: parseFloat(coefficientOfVariation.toFixed(4)),
                    min: parseFloat(statistics.min.toFixed(2)),
                    max: parseFloat(statistics.max.toFixed(2)),
                    range: parseFloat((statistics.max - statistics.min).toFixed(2))
                },
                risk: {
                    valueAtRisk5pct: parseFloat(valueAtRisk.toFixed(2)),
                    percentile5: parseFloat(percentile5.toFixed(2)),
                    percentile95: parseFloat(percentile95.toFixed(2)),
                    interquartileRange: parseFloat((percentile95 - percentile5).toFixed(2))
                },
                rolling: {
                    windowSize: windowSize,
                    data: rollingVolatility.slice(-50) // Return last 50 windows to avoid huge response
                }
            };

            logger.debug(`Calculated volatility metrics for ${gameData.length} games (window: ${windowSize})`);

            return volatilityMetrics;
        } catch (error) {
            logger.error(`Failed to calculate volatility: ${error.message}`);
            throw error;
        }
    }

    /**
     * Analyze time-series trends for multipliers over different time periods
     * Groups data by time intervals and calculates trending statistics
     *
     * @param {Array} gameData - Array of game rounds with timestamps and multipliers
     * @param {Object} options - Configuration options
     * @param {string} options.interval - Time interval: 'hour', 'day', 'week', 'month' (default: 'hour')
     * @param {number} options.limit - Maximum number of periods to return (default: 24)
     * @returns {Object} - Time-series analysis with trends and statistics per period
     */
    analyzeTimeSeries(gameData, options = {}) {
        try {
            if (!gameData || gameData.length === 0) {
                logger.warn('No game data provided for time-series analysis');
                return { series: [], trends: null };
            }

            const interval = options.interval || 'hour';
            const limit = options.limit || 24;

            // Sort by timestamp
            const sortedData = [...gameData].sort((a, b) => {
                const timeA = new Date(a.timestamp).getTime();
                const timeB = new Date(b.timestamp).getTime();
                return timeA - timeB;
            });

            // Group by time interval
            const timeBuckets = {};

            sortedData.forEach(game => {
                if (!game.timestamp) return;

                const date = new Date(game.timestamp);
                let bucketKey;

                switch (interval) {
                    case 'hour':
                        bucketKey = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).toISOString();
                        break;
                    case 'day':
                        bucketKey = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
                        break;
                    case 'week':
                        const weekStart = new Date(date);
                        weekStart.setDate(date.getDate() - date.getDay());
                        bucketKey = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()).toISOString();
                        break;
                    case 'month':
                        bucketKey = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
                        break;
                    default:
                        bucketKey = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).toISOString();
                }

                if (!timeBuckets[bucketKey]) {
                    timeBuckets[bucketKey] = {
                        timestamp: bucketKey,
                        games: []
                    };
                }

                timeBuckets[bucketKey].games.push(game);
            });

            // Calculate statistics for each time bucket
            const series = Object.values(timeBuckets).map(bucket => {
                const multipliers = bucket.games.map(g => g.multiplier || g.crashMultiplier || 0);
                const stats = this._calculateBasicStatistics(multipliers);

                return {
                    timestamp: bucket.timestamp,
                    gameCount: bucket.games.length,
                    avgMultiplier: parseFloat(stats.mean.toFixed(2)),
                    minMultiplier: parseFloat(stats.min.toFixed(2)),
                    maxMultiplier: parseFloat(stats.max.toFixed(2)),
                    stdDev: parseFloat(stats.stdDev.toFixed(4)),
                    medianMultiplier: parseFloat(this._calculatePercentile(multipliers.sort((a, b) => a - b), 50).toFixed(2))
                };
            }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            // Apply limit (most recent periods)
            const limitedSeries = series.slice(-limit);

            // Calculate trends
            const trends = this._calculateTrends(limitedSeries);

            logger.debug(`Analyzed time-series data: ${limitedSeries.length} ${interval} periods`);

            return {
                interval: interval,
                periodCount: limitedSeries.length,
                series: limitedSeries,
                trends: trends
            };
        } catch (error) {
            logger.error(`Failed to analyze time-series: ${error.message}`);
            throw error;
        }
    }

    /**
     * Calculate Return on Investment (ROI) for betting strategies
     * Evaluates profitability and efficiency of betting approaches
     *
     * @param {Array} betData - Array of bet history with amounts and outcomes
     * @param {Object} options - Configuration options
     * @param {string} options.groupBy - Group ROI by: 'strategy', 'multiplier', 'timeperiod' (default: 'overall')
     * @returns {Object} - ROI metrics including returns, efficiency, and profitability
     */
    calculateROI(betData, options = {}) {
        try {
            if (!betData || betData.length === 0) {
                logger.warn('No bet data provided for ROI calculation');
                return { roi: null, metrics: null };
            }

            const groupBy = options.groupBy || 'overall';

            // Calculate overall ROI
            const totalWagered = betData.reduce((sum, bet) => sum + (bet.betAmount || 0), 0);
            const totalProfit = betData.reduce((sum, bet) => sum + (bet.profitLoss || bet.profit || 0), 0);
            const totalWins = betData.filter(b => b.won).length;
            const totalLosses = betData.filter(b => !b.won).length;

            const roi = totalWagered > 0 ? ((totalProfit / totalWagered) * 100) : 0;
            const winRate = betData.length > 0 ? ((totalWins / betData.length) * 100) : 0;
            const avgBetSize = betData.length > 0 ? (totalWagered / betData.length) : 0;
            const avgProfit = betData.length > 0 ? (totalProfit / betData.length) : 0;

            // Calculate profit factor (gross profit / gross loss)
            const grossProfit = betData.filter(b => b.won).reduce((sum, bet) => sum + Math.abs(bet.profitLoss || bet.profit || 0), 0);
            const grossLoss = betData.filter(b => !b.won).reduce((sum, bet) => sum + Math.abs(bet.profitLoss || bet.profit || 0), 0);
            const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? Infinity : 0);

            // Calculate expected value per bet
            const expectedValue = betData.length > 0 ? (totalProfit / betData.length) : 0;

            // Calculate Sharpe Ratio (risk-adjusted return)
            const returns = betData.map(b => {
                const amount = b.betAmount || 1;
                return ((b.profitLoss || b.profit || 0) / amount) * 100;
            });
            const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
            const returnStdDev = this._calculateStdDev(returns);
            const sharpeRatio = returnStdDev > 0 ? (avgReturn / returnStdDev) : 0;

            const overallMetrics = {
                totalBets: betData.length,
                totalWagered: parseFloat(totalWagered.toFixed(2)),
                totalProfit: parseFloat(totalProfit.toFixed(2)),
                roi: parseFloat(roi.toFixed(2)),
                roiPercentage: parseFloat(roi.toFixed(2)) + '%',
                winRate: parseFloat(winRate.toFixed(2)),
                wins: totalWins,
                losses: totalLosses,
                avgBetSize: parseFloat(avgBetSize.toFixed(2)),
                avgProfit: parseFloat(avgProfit.toFixed(2)),
                profitFactor: parseFloat(profitFactor.toFixed(2)),
                expectedValue: parseFloat(expectedValue.toFixed(2)),
                sharpeRatio: parseFloat(sharpeRatio.toFixed(4)),
                grossProfit: parseFloat(grossProfit.toFixed(2)),
                grossLoss: parseFloat(grossLoss.toFixed(2))
            };

            logger.debug(`Calculated ROI metrics for ${betData.length} bets`);

            return {
                overall: overallMetrics,
                groupBy: groupBy
            };
        } catch (error) {
            logger.error(`Failed to calculate ROI: ${error.message}`);
            throw error;
        }
    }

    /**
     * Evaluate betting strategy performance
     * Comprehensive analysis of strategy effectiveness across multiple dimensions
     *
     * @param {Array} betData - Array of bet history with strategy information
     * @param {Object} gameData - Array of all game rounds for comparison
     * @param {Object} options - Configuration options
     * @returns {Object} - Strategy performance evaluation with recommendations
     */
    evaluateStrategyPerformance(betData, gameData, options = {}) {
        try {
            if (!betData || betData.length === 0) {
                logger.warn('No bet data provided for strategy evaluation');
                return { evaluation: null, recommendations: [] };
            }

            // Calculate comprehensive metrics
            const roiMetrics = this.calculateROI(betData, options);
            const winRateByMultiplier = this.getWinRateByMultiplier(betData, options);

            // Calculate efficiency metrics
            const totalGames = gameData ? gameData.length : 0;
            const betFrequency = totalGames > 0 ? ((betData.length / totalGames) * 100) : 0;

            // Analyze betting consistency
            const betAmounts = betData.map(b => b.betAmount || 0);
            const betConsistency = this._calculateBasicStatistics(betAmounts);

            // Identify best performing multiplier targets
            const bestMultipliers = winRateByMultiplier.segments
                .filter(s => s.totalBets >= 5) // Minimum sample size
                .sort((a, b) => b.roi - a.roi)
                .slice(0, 3);

            // Identify worst performing multiplier targets
            const worstMultipliers = winRateByMultiplier.segments
                .filter(s => s.totalBets >= 5)
                .sort((a, b) => a.roi - b.roi)
                .slice(0, 3);

            // Generate recommendations
            const recommendations = [];

            if (roiMetrics.overall.roi < 0) {
                recommendations.push({
                    type: 'warning',
                    priority: 'high',
                    message: 'Current strategy is unprofitable. Consider adjusting target multipliers or bet sizing.',
                    metric: 'roi',
                    value: roiMetrics.overall.roi
                });
            }

            if (roiMetrics.overall.winRate < 40) {
                recommendations.push({
                    type: 'warning',
                    priority: 'high',
                    message: 'Win rate is below 40%. Consider targeting lower multipliers for higher success rate.',
                    metric: 'winRate',
                    value: roiMetrics.overall.winRate
                });
            }

            if (betConsistency.stdDev / betConsistency.mean > 0.5) {
                recommendations.push({
                    type: 'info',
                    priority: 'medium',
                    message: 'Bet sizing is inconsistent. Consider implementing a fixed bet size strategy.',
                    metric: 'betConsistency',
                    value: betConsistency.coefficientOfVariation
                });
            }

            if (bestMultipliers.length > 0 && bestMultipliers[0].roi > 10) {
                recommendations.push({
                    type: 'success',
                    priority: 'medium',
                    message: `Best performing multiplier range: ${bestMultipliers[0].multiplierRange} (ROI: ${bestMultipliers[0].roi}%)`,
                    metric: 'bestMultiplier',
                    value: bestMultipliers[0]
                });
            }

            if (roiMetrics.overall.sharpeRatio > 1) {
                recommendations.push({
                    type: 'success',
                    priority: 'low',
                    message: 'Strategy shows good risk-adjusted returns (Sharpe Ratio > 1)',
                    metric: 'sharpeRatio',
                    value: roiMetrics.overall.sharpeRatio
                });
            }

            const evaluation = {
                summary: {
                    totalBets: betData.length,
                    totalGames: totalGames,
                    betFrequency: parseFloat(betFrequency.toFixed(2)),
                    overallRating: this._calculateOverallRating(roiMetrics.overall),
                    profitability: roiMetrics.overall.roi > 0 ? 'profitable' : 'unprofitable',
                    riskLevel: this._assessRiskLevel(roiMetrics.overall, betConsistency)
                },
                performance: {
                    roi: roiMetrics.overall,
                    winRateAnalysis: winRateByMultiplier,
                    betConsistency: {
                        avgBetSize: parseFloat(betConsistency.mean.toFixed(2)),
                        stdDev: parseFloat(betConsistency.stdDev.toFixed(2)),
                        minBet: parseFloat(betConsistency.min.toFixed(2)),
                        maxBet: parseFloat(betConsistency.max.toFixed(2)),
                        coefficientOfVariation: parseFloat((betConsistency.stdDev / betConsistency.mean).toFixed(4))
                    }
                },
                insights: {
                    bestPerformingMultipliers: bestMultipliers,
                    worstPerformingMultipliers: worstMultipliers,
                    recommendations: recommendations
                }
            };

            logger.debug(`Evaluated strategy performance for ${betData.length} bets`);

            return evaluation;
        } catch (error) {
            logger.error(`Failed to evaluate strategy performance: ${error.message}`);
            throw error;
        }
    }

    // ===== PRIVATE HELPER METHODS =====

    /**
     * Calculate basic statistical measures
     * @private
     */
    _calculateBasicStatistics(values) {
        if (!values || values.length === 0) {
            return { mean: 0, median: 0, variance: 0, stdDev: 0, min: 0, max: 0, count: 0 };
        }

        const count = values.length;
        const sum = values.reduce((acc, val) => acc + val, 0);
        const mean = sum / count;

        const sortedValues = [...values].sort((a, b) => a - b);
        const median = count % 2 === 0
            ? (sortedValues[count / 2 - 1] + sortedValues[count / 2]) / 2
            : sortedValues[Math.floor(count / 2)];

        const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
        const stdDev = Math.sqrt(variance);

        const min = Math.min(...values);
        const max = Math.max(...values);

        return { mean, median, variance, stdDev, min, max, count };
    }

    /**
     * Calculate standard deviation
     * @private
     */
    _calculateStdDev(values) {
        if (!values || values.length === 0) return 0;

        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;

        return Math.sqrt(variance);
    }

    /**
     * Calculate percentile value
     * @private
     */
    _calculatePercentile(sortedValues, percentile) {
        if (!sortedValues || sortedValues.length === 0) return 0;

        const index = (percentile / 100) * (sortedValues.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;

        return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
    }

    /**
     * Calculate average for a range of games
     * @private
     */
    _calculateAverageForRange(gameData, startIndex, endIndex) {
        const slice = gameData.slice(startIndex, endIndex + 1);
        const sum = slice.reduce((acc, game) => acc + (game.multiplier || game.crashMultiplier || 0), 0);
        return parseFloat((sum / slice.length).toFixed(2));
    }

    /**
     * Detect alternating high/low patterns
     * @private
     */
    _detectAlternatingPattern(gameData, threshold, minLength) {
        const patterns = [];
        let currentPattern = [];
        let expectedNext = null;

        for (let i = 0; i < gameData.length; i++) {
            const multiplier = gameData[i].multiplier || gameData[i].crashMultiplier || 0;
            const isHigh = multiplier >= threshold;

            if (expectedNext === null) {
                currentPattern = [{ index: i, multiplier, type: isHigh ? 'high' : 'low' }];
                expectedNext = !isHigh;
            } else if (isHigh !== expectedNext) {
                // Pattern broken
                if (currentPattern.length >= minLength) {
                    patterns.push({
                        startIndex: currentPattern[0].index,
                        endIndex: currentPattern[currentPattern.length - 1].index,
                        length: currentPattern.length,
                        pattern: currentPattern.map(p => p.type).join('-')
                    });
                }
                currentPattern = [{ index: i, multiplier, type: isHigh ? 'high' : 'low' }];
                expectedNext = !isHigh;
            } else {
                // Pattern continues
                currentPattern.push({ index: i, multiplier, type: isHigh ? 'high' : 'low' });
                expectedNext = !isHigh;
            }
        }

        // Check final pattern
        if (currentPattern.length >= minLength) {
            patterns.push({
                startIndex: currentPattern[0].index,
                endIndex: currentPattern[currentPattern.length - 1].index,
                length: currentPattern.length,
                pattern: currentPattern.map(p => p.type).join('-')
            });
        }

        return patterns;
    }

    /**
     * Calculate trends from time-series data
     * @private
     */
    _calculateTrends(series) {
        if (!series || series.length < 2) {
            return { direction: 'insufficient_data', strength: 0 };
        }

        // Simple linear regression to detect trend
        const xValues = series.map((_, i) => i);
        const yValues = series.map(s => s.avgMultiplier);

        const n = xValues.length;
        const sumX = xValues.reduce((a, b) => a + b, 0);
        const sumY = yValues.reduce((a, b) => a + b, 0);
        const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
        const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // Calculate R-squared for trend strength
        const yMean = sumY / n;
        const ssTotal = yValues.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
        const ssResidual = yValues.reduce((sum, y, i) => {
            const predicted = slope * i + intercept;
            return sum + Math.pow(y - predicted, 2);
        }, 0);
        const rSquared = 1 - (ssResidual / ssTotal);

        let direction;
        if (Math.abs(slope) < 0.01) {
            direction = 'stable';
        } else if (slope > 0) {
            direction = 'increasing';
        } else {
            direction = 'decreasing';
        }

        return {
            direction: direction,
            slope: parseFloat(slope.toFixed(4)),
            strength: parseFloat(rSquared.toFixed(4)),
            interpretation: this._interpretTrend(direction, rSquared)
        };
    }

    /**
     * Interpret trend direction and strength
     * @private
     */
    _interpretTrend(direction, rSquared) {
        const strength = rSquared > 0.7 ? 'strong' : (rSquared > 0.4 ? 'moderate' : 'weak');

        if (direction === 'increasing') {
            return `${strength} upward trend`;
        } else if (direction === 'decreasing') {
            return `${strength} downward trend`;
        } else {
            return 'no significant trend';
        }
    }

    /**
     * Calculate overall strategy rating (0-100)
     * @private
     */
    _calculateOverallRating(roiMetrics) {
        let score = 50; // Base score

        // ROI contribution (max +30, min -20)
        if (roiMetrics.roi > 0) {
            score += Math.min(roiMetrics.roi * 0.5, 30);
        } else {
            score += Math.max(roiMetrics.roi * 0.4, -20);
        }

        // Win rate contribution (max +20)
        score += Math.min((roiMetrics.winRate - 40) * 0.4, 20);

        // Sharpe ratio contribution (max +10)
        score += Math.min(roiMetrics.sharpeRatio * 5, 10);

        return Math.max(0, Math.min(100, Math.round(score)));
    }

    /**
     * Assess risk level based on metrics
     * @private
     */
    _assessRiskLevel(roiMetrics, betConsistency) {
        const coeffVar = betConsistency.stdDev / betConsistency.mean;
        const sharpeRatio = roiMetrics.sharpeRatio;

        if (coeffVar > 1.0 || sharpeRatio < 0) {
            return 'high';
        } else if (coeffVar > 0.5 || sharpeRatio < 0.5) {
            return 'medium';
        } else {
            return 'low';
        }
    }
}

module.exports = new Analytics();
