const dataExporter = require('../util/dataExporter');
const logger = require('../util/logger');

class StatsTracker {
    constructor() {
        this.reset();
    }

    reset() {
        this.trades = [];
        this.totalTrades = 0;
        this.winningTrades = 0;
        this.losingTrades = 0;
        this.totalProfit = 0;
        this.totalLoss = 0;
        this.largestWin = 0;
        this.largestLoss = 0;
        this.currentStreak = 0;
        this.longestWinStreak = 0;
        this.longestLossStreak = 0;
        this.gameHistory = []; // Store complete game history
    }

    addTrade(trade) {
        this.trades.push(trade);
        this.totalTrades++;

        if (trade.profit > 0) {
            this.winningTrades++;
            this.totalProfit += trade.profit;
            this.largestWin = Math.max(this.largestWin, trade.profit);
            this.currentStreak = this.currentStreak > 0 ? this.currentStreak + 1 : 1;
            this.longestWinStreak = Math.max(this.longestWinStreak, this.currentStreak);
        } else {
            this.losingTrades++;
            this.totalLoss += trade.loss;
            this.largestLoss = Math.min(this.largestLoss, trade.loss);
            this.currentStreak = this.currentStreak < 0 ? this.currentStreak - 1 : -1;
            this.longestLossStreak = Math.min(this.longestLossStreak, this.currentStreak);
        }
    }

    getStats() {
        return {
            totalTrades: this.totalTrades,
            winRate: (this.winningTrades / this.totalTrades) * 100 || 0,
            totalProfit: this.totalProfit,
            totalLoss: this.totalLoss,
            netProfit: this.totalProfit + this.totalLoss,
            largestWin: this.largestWin,
            largestLoss: this.largestLoss,
            averageWin: this.totalProfit / this.winningTrades || 0,
            averageLoss: this.totalLoss / this.losingTrades || 0,
            longestWinStreak: this.longestWinStreak,
            longestLossStreak: Math.abs(this.longestLossStreak)
        };
    }

    /**
     * Adds a complete game round to history
     * Stores all relevant data points including multiplier, timestamp, bet status, and outcome
     * @param {Object} gameData - Game round data
     * @param {number} gameData.multiplier - The crash multiplier value
     * @param {Date|string} gameData.timestamp - When the game occurred (optional, defaults to now)
     * @param {boolean} gameData.betPlaced - Whether a bet was placed (optional, defaults to false)
     * @param {number} gameData.betAmount - Amount bet if bet was placed (optional)
     * @param {number} gameData.targetMultiplier - Target cashout multiplier if bet was placed (optional)
     * @param {number} gameData.actualMultiplier - Actual cashout multiplier if bet won (optional)
     * @param {boolean} gameData.won - Whether the bet won (optional)
     * @param {number} gameData.profit - Profit/loss from bet (optional)
     * @param {number} gameData.gameDuration - Game duration in milliseconds (optional)
     */
    addGameRound(gameData) {
        try {
            const gameRound = {
                id: this.gameHistory.length + 1,
                multiplier: gameData.multiplier || gameData.crashMultiplier || 0,
                timestamp: gameData.timestamp || new Date().toISOString(),
                betPlaced: gameData.betPlaced || false,
                betAmount: gameData.betAmount || 0,
                targetMultiplier: gameData.targetMultiplier || 0,
                actualMultiplier: gameData.actualMultiplier || gameData.multiplier || 0,
                won: gameData.won || false,
                profit: gameData.profit || 0,
                gameDuration: gameData.gameDuration || 0
            };

            this.gameHistory.push(gameRound);

            logger.debug(`Game round added to history: multiplier=${gameRound.multiplier}, betPlaced=${gameRound.betPlaced}`);

            return gameRound;
        } catch (error) {
            logger.error(`Failed to add game round to history: ${error.message}`);
            throw error;
        }
    }

    /**
     * Retrieves game history with optional filtering
     * @param {Object} options - Filter options
     * @param {number} options.limit - Maximum number of records to return (optional)
     * @param {Date|string} options.fromDate - Start date for filtering (optional)
     * @param {Date|string} options.toDate - End date for filtering (optional)
     * @param {boolean} options.betPlacedOnly - Only return games where bets were placed (optional)
     * @param {number} options.minMultiplier - Minimum multiplier value (optional)
     * @param {number} options.maxMultiplier - Maximum multiplier value (optional)
     * @param {boolean} options.wonOnly - Only return winning bets (optional)
     * @returns {Array} - Filtered game history array
     */
    getGameHistory(options = {}) {
        try {
            let filteredHistory = [...this.gameHistory];

            // Filter by date range
            if (options.fromDate) {
                const fromTimestamp = new Date(options.fromDate).getTime();
                filteredHistory = filteredHistory.filter(game =>
                    new Date(game.timestamp).getTime() >= fromTimestamp
                );
            }

            if (options.toDate) {
                const toTimestamp = new Date(options.toDate).getTime();
                filteredHistory = filteredHistory.filter(game =>
                    new Date(game.timestamp).getTime() <= toTimestamp
                );
            }

            // Filter by bet status
            if (options.betPlacedOnly === true) {
                filteredHistory = filteredHistory.filter(game => game.betPlaced === true);
            }

            // Filter by win status
            if (options.wonOnly === true) {
                filteredHistory = filteredHistory.filter(game => game.won === true);
            }

            // Filter by multiplier range
            if (options.minMultiplier !== undefined) {
                filteredHistory = filteredHistory.filter(game =>
                    game.multiplier >= options.minMultiplier
                );
            }

            if (options.maxMultiplier !== undefined) {
                filteredHistory = filteredHistory.filter(game =>
                    game.multiplier <= options.maxMultiplier
                );
            }

            // Apply limit (most recent games first)
            if (options.limit && options.limit > 0) {
                filteredHistory = filteredHistory.slice(-options.limit);
            }

            logger.debug(`Retrieved ${filteredHistory.length} game records from history (total: ${this.gameHistory.length})`);

            return filteredHistory;
        } catch (error) {
            logger.error(`Failed to retrieve game history: ${error.message}`);
            throw error;
        }
    }

    /**
     * Exports game data in the specified format
     * @param {string} format - Export format: 'json', 'csv', or 'database'
     * @param {Object} options - Export options
     * @param {string} options.filename - Custom filename for export (optional)
     * @param {Object} options.filter - Filter options to pass to getGameHistory (optional)
     * @param {Object} options.database - Database instance for database export (optional)
     * @param {boolean} options.pretty - Pretty print JSON (optional, default: true)
     * @param {Array} options.columns - Specific columns for CSV export (optional)
     * @returns {Promise<string|Object>} - Export result (file path or database result)
     */
    async exportData(format, options = {}) {
        try {
            const { filter = {}, ...exportOptions } = options;

            // Get filtered game history
            const dataToExport = this.getGameHistory(filter);

            if (dataToExport.length === 0) {
                logger.warn('No game data available to export');
                throw new Error('No game data available to export');
            }

            let result;

            switch (format.toLowerCase()) {
                case 'json':
                    result = await dataExporter.exportToJSON(dataToExport, exportOptions);
                    logger.info(`Exported ${dataToExport.length} game records to JSON: ${result}`);
                    break;

                case 'csv':
                    result = await dataExporter.exportToCSV(dataToExport, exportOptions);
                    logger.info(`Exported ${dataToExport.length} game records to CSV: ${result}`);
                    break;

                case 'database':
                    if (!exportOptions.database) {
                        throw new Error('Database instance required for database export');
                    }
                    result = await dataExporter.exportToDatabase(
                        dataToExport,
                        exportOptions.database,
                        exportOptions
                    );
                    logger.info(`Exported ${dataToExport.length} game records to database`);
                    break;

                default:
                    throw new Error(`Unsupported export format: ${format}. Supported formats: json, csv, database`);
            }

            return result;
        } catch (error) {
            logger.error(`Failed to export data in ${format} format: ${error.message}`);
            throw error;
        }
    }
}

module.exports = StatsTracker;