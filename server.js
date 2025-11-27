const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const logger = require('./util/logger');
const dataExporter = require('./util/dataExporter');
const analytics = require('./util/analytics');
const database = require('./database/database');

/**
 * Express API Server for Aviator Game Data Access
 * Provides REST API endpoints and Socket.IO for real-time data streaming
 */
class AviatorDataServer {
    constructor(port = 3000) {
        this.port = port;
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        // Store reference to statsTracker - will be set externally
        this.statsTracker = null;

        // Connected Socket.IO clients
        this.connectedClients = new Set();

        // Cache for expensive analytical queries
        this.analyticsCache = new Map();
        this.cacheTTL = 5 * 60 * 1000; // 5 minutes cache TTL

        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketIO();
    }

    /**
     * Set the statsTracker instance to serve data from
     * @param {Object} statsTracker - StatsTracker instance
     */
    setStatsTracker(statsTracker) {
        this.statsTracker = statsTracker;
        logger.info('StatsTracker connected to API server');
    }

    /**
     * Get cached result or execute function and cache result
     * @param {string} cacheKey - Cache key
     * @param {Function} fn - Function to execute if cache miss
     * @returns {Promise<any>} - Cached or fresh result
     */
    async getCachedOrFetch(cacheKey, fn) {
        const cached = this.analyticsCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            logger.debug(`Cache hit for key: ${cacheKey}`);
            return cached.data;
        }

        logger.debug(`Cache miss for key: ${cacheKey}, executing query`);
        const data = await fn();

        this.analyticsCache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });

        return data;
    }

    /**
     * Clear analytics cache (e.g., when new data is added)
     */
    clearAnalyticsCache() {
        this.analyticsCache.clear();
        logger.debug('Analytics cache cleared');
    }

    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        // CORS configuration
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

            if (req.method === 'OPTIONS') {
                return res.sendStatus(200);
            }
            next();
        });

        // JSON parsing
        this.app.use(express.json());

        // Static files from public directory
        this.app.use(express.static(path.join(__dirname, 'public')));

        // Request logging
        this.app.use((req, res, next) => {
            logger.debug(`${req.method} ${req.path}`);
            next();
        });
    }

    /**
     * Setup API routes
     */
    setupRoutes() {
        // Health check endpoint
        this.app.get('/api/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                statsTrackerConnected: this.statsTracker !== null
            });
        });

        // Get recent games (last 100 by default)
        this.app.get('/api/data/recent', (req, res) => {
            try {
                if (!this.statsTracker) {
                    return res.status(503).json({
                        error: 'Stats tracker not initialized',
                        message: 'The bot is starting up, please try again in a moment'
                    });
                }

                const limit = parseInt(req.query.limit) || 100;
                const gameHistory = this.statsTracker.getGameHistory({ limit });

                res.json({
                    success: true,
                    count: gameHistory.length,
                    limit: limit,
                    data: gameHistory
                });
            } catch (error) {
                logger.error(`Error fetching recent data: ${error.message}`);
                res.status(500).json({
                    error: 'Failed to fetch recent data',
                    message: error.message
                });
            }
        });

        // Get all game data with optional filtering
        this.app.get('/api/data/all', (req, res) => {
            try {
                if (!this.statsTracker) {
                    return res.status(503).json({
                        error: 'Stats tracker not initialized',
                        message: 'The bot is starting up, please try again in a moment'
                    });
                }

                // Parse query parameters for filtering
                const options = {};

                if (req.query.fromDate) {
                    options.fromDate = req.query.fromDate;
                }
                if (req.query.toDate) {
                    options.toDate = req.query.toDate;
                }
                if (req.query.betPlacedOnly === 'true') {
                    options.betPlacedOnly = true;
                }
                if (req.query.wonOnly === 'true') {
                    options.wonOnly = true;
                }
                if (req.query.minMultiplier) {
                    options.minMultiplier = parseFloat(req.query.minMultiplier);
                }
                if (req.query.maxMultiplier) {
                    options.maxMultiplier = parseFloat(req.query.maxMultiplier);
                }
                if (req.query.limit) {
                    options.limit = parseInt(req.query.limit);
                }

                const gameHistory = this.statsTracker.getGameHistory(options);

                res.json({
                    success: true,
                    count: gameHistory.length,
                    filters: options,
                    data: gameHistory
                });
            } catch (error) {
                logger.error(`Error fetching all data: ${error.message}`);
                res.status(500).json({
                    error: 'Failed to fetch data',
                    message: error.message
                });
            }
        });

        // Get statistics
        this.app.get('/api/stats', (req, res) => {
            try {
                if (!this.statsTracker) {
                    return res.status(503).json({
                        error: 'Stats tracker not initialized',
                        message: 'The bot is starting up, please try again in a moment'
                    });
                }

                const stats = this.statsTracker.getStats();
                const gameHistory = this.statsTracker.getGameHistory();

                // Calculate additional statistics
                const totalGames = gameHistory.length;
                const gamesWithBets = gameHistory.filter(g => g.betPlaced).length;
                const multipliers = gameHistory.map(g => g.multiplier);
                const avgMultiplier = multipliers.length > 0
                    ? multipliers.reduce((a, b) => a + b, 0) / multipliers.length
                    : 0;
                const maxMultiplier = multipliers.length > 0 ? Math.max(...multipliers) : 0;
                const minMultiplier = multipliers.length > 0 ? Math.min(...multipliers) : 0;

                res.json({
                    success: true,
                    tradingStats: stats,
                    gameStats: {
                        totalGames,
                        gamesWithBets,
                        gamesWithoutBets: totalGames - gamesWithBets,
                        averageMultiplier: parseFloat(avgMultiplier.toFixed(2)),
                        maxMultiplier: parseFloat(maxMultiplier.toFixed(2)),
                        minMultiplier: parseFloat(minMultiplier.toFixed(2))
                    },
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                logger.error(`Error fetching stats: ${error.message}`);
                res.status(500).json({
                    error: 'Failed to fetch statistics',
                    message: error.message
                });
            }
        });

        // Helper function to parse filter options from query parameters
        const parseFilterOptions = (query) => {
            const filterOptions = {};
            if (query.fromDate) filterOptions.fromDate = query.fromDate;
            if (query.toDate) filterOptions.toDate = query.toDate;
            if (query.betPlacedOnly === 'true') filterOptions.betPlacedOnly = true;
            if (query.wonOnly === 'true') filterOptions.wonOnly = true;
            if (query.minMultiplier) filterOptions.minMultiplier = parseFloat(query.minMultiplier);
            if (query.maxMultiplier) filterOptions.maxMultiplier = parseFloat(query.maxMultiplier);
            if (query.limit) filterOptions.limit = parseInt(query.limit);
            return filterOptions;
        };

        // Helper function to handle export logic
        const handleExport = async (req, res, format) => {
            try {
                if (!this.statsTracker) {
                    return res.status(503).json({
                        error: 'Stats tracker not initialized',
                        message: 'The bot is starting up, please try again in a moment'
                    });
                }

                // Parse filtering options
                const filterOptions = parseFilterOptions(req.query);

                // Export data using statsTracker
                const filePath = await this.statsTracker.exportData(format, {
                    filter: filterOptions,
                    pretty: format === 'json' ? true : undefined
                });

                // Generate download filename
                const timestamp = new Date().toISOString()
                    .replace(/:/g, '-')
                    .replace(/\./g, '-')
                    .substring(0, 19);
                const downloadFilename = `aviator_data_${timestamp}.${format}`;

                // Set headers for file download
                res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
                res.setHeader('Content-Type', format === 'json' ? 'application/json' : 'text/csv');

                // Send file
                res.sendFile(filePath, (err) => {
                    if (err) {
                        logger.error(`Error sending file: ${err.message}`);
                        if (!res.headersSent) {
                            res.status(500).json({
                                error: 'Failed to send file',
                                message: err.message
                            });
                        }
                    }
                });

                logger.info(`Data exported as ${format}: ${downloadFilename}`);
            } catch (error) {
                logger.error(`Export error: ${error.message}`);
                res.status(500).json({
                    error: 'Export failed',
                    message: error.message
                });
            }
        };

        // Export data as JSON
        // Query parameters: fromDate, toDate, betPlacedOnly, wonOnly, minMultiplier, maxMultiplier, limit
        this.app.get('/api/export/json', async (req, res) => {
            await handleExport(req, res, 'json');
        });

        // Export data as CSV
        // Query parameters: fromDate, toDate, betPlacedOnly, wonOnly, minMultiplier, maxMultiplier, limit
        this.app.get('/api/export/csv', async (req, res) => {
            await handleExport(req, res, 'csv');
        });

        // Export data in specified format (flexible endpoint)
        this.app.get('/api/export/:format', async (req, res) => {
            const format = req.params.format.toLowerCase();

            // Validate format
            if (!['json', 'csv'].includes(format)) {
                return res.status(400).json({
                    error: 'Invalid format',
                    message: 'Supported formats: json, csv'
                });
            }

            await handleExport(req, res, format);
        });

        // ===== ANALYTICS ENDPOINTS =====

        /**
         * GET /api/analytics/distribution
         * Get multiplier distribution analysis with configurable ranges
         * Query parameters:
         *   - fromDate: Start date for filtering (ISO string)
         *   - toDate: End date for filtering (ISO string)
         *   - source: Data source ('memory' or 'database', default: 'memory')
         *   - ranges: Custom ranges JSON array (optional)
         */
        this.app.get('/api/analytics/distribution', async (req, res) => {
            try {
                const { fromDate, toDate, source = 'memory', ranges } = req.query;

                // Build cache key from query parameters
                const cacheKey = `distribution:${source}:${fromDate || 'all'}:${toDate || 'all'}:${ranges || 'default'}`;

                const result = await this.getCachedOrFetch(cacheKey, async () => {
                    let gameData;

                    // Fetch data from appropriate source
                    if (source === 'database' && database.isConnectedToDatabase()) {
                        const options = {};
                        if (fromDate) options.fromDate = fromDate;
                        if (toDate) options.toDate = toDate;
                        gameData = await database.getGameHistory(options);
                    } else if (this.statsTracker) {
                        const options = {};
                        if (fromDate) options.fromDate = fromDate;
                        if (toDate) options.toDate = toDate;
                        gameData = this.statsTracker.getGameHistory(options);
                    } else {
                        throw new Error('No data source available');
                    }

                    // Parse custom ranges if provided
                    const analysisOptions = {};
                    if (ranges) {
                        try {
                            analysisOptions.ranges = JSON.parse(ranges);
                        } catch (err) {
                            logger.warn(`Failed to parse custom ranges: ${err.message}`);
                        }
                    }

                    // Calculate distribution using analytics module
                    const distribution = analytics.calculateMultiplierDistribution(gameData, analysisOptions);

                    return {
                        success: true,
                        source: source,
                        dataCount: gameData.length,
                        filters: { fromDate: fromDate || null, toDate: toDate || null },
                        distribution: distribution
                    };
                });

                res.json(result);
            } catch (error) {
                logger.error(`Error calculating distribution: ${error.message}`);
                res.status(500).json({
                    success: false,
                    error: 'Failed to calculate distribution',
                    message: error.message
                });
            }
        });

        /**
         * GET /api/analytics/trends
         * Get time-series trend analysis with grouping options
         * Query parameters:
         *   - interval: Time interval ('hour', 'day', 'week', 'month', default: 'hour')
         *   - limit: Maximum number of periods to return (default: 24)
         *   - fromDate: Start date for filtering (ISO string)
         *   - toDate: End date for filtering (ISO string)
         *   - source: Data source ('memory' or 'database', default: 'memory')
         */
        this.app.get('/api/analytics/trends', async (req, res) => {
            try {
                const { interval = 'hour', limit = 24, fromDate, toDate, source = 'memory' } = req.query;

                // Validate interval
                const validIntervals = ['hour', 'day', 'week', 'month'];
                if (!validIntervals.includes(interval)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid interval',
                        message: `Interval must be one of: ${validIntervals.join(', ')}`
                    });
                }

                // Build cache key
                const cacheKey = `trends:${source}:${interval}:${limit}:${fromDate || 'all'}:${toDate || 'all'}`;

                const result = await this.getCachedOrFetch(cacheKey, async () => {
                    let gameData;

                    // Fetch data from appropriate source
                    if (source === 'database' && database.isConnectedToDatabase()) {
                        const options = { limit: 10000 }; // Large limit for trend analysis
                        if (fromDate) options.fromDate = fromDate;
                        if (toDate) options.toDate = toDate;
                        gameData = await database.getGameHistory(options);
                    } else if (this.statsTracker) {
                        const options = {};
                        if (fromDate) options.fromDate = fromDate;
                        if (toDate) options.toDate = toDate;
                        gameData = this.statsTracker.getGameHistory(options);
                    } else {
                        throw new Error('No data source available');
                    }

                    // Perform time-series analysis
                    const trendAnalysis = analytics.analyzeTimeSeries(gameData, {
                        interval: interval,
                        limit: parseInt(limit)
                    });

                    return {
                        success: true,
                        source: source,
                        dataCount: gameData.length,
                        filters: { fromDate: fromDate || null, toDate: toDate || null },
                        analysis: trendAnalysis
                    };
                });

                res.json(result);
            } catch (error) {
                logger.error(`Error analyzing trends: ${error.message}`);
                res.status(500).json({
                    success: false,
                    error: 'Failed to analyze trends',
                    message: error.message
                });
            }
        });

        /**
         * GET /api/analytics/performance
         * Get comprehensive strategy performance evaluation
         * Query parameters:
         *   - fromDate: Start date for filtering (ISO string)
         *   - toDate: End date for filtering (ISO string)
         *   - source: Data source ('memory' or 'database', default: 'memory')
         *   - includeVolatility: Include volatility analysis (default: false)
         *   - includePatterns: Include pattern detection (default: false)
         */
        this.app.get('/api/analytics/performance', async (req, res) => {
            try {
                const {
                    fromDate,
                    toDate,
                    source = 'memory',
                    includeVolatility = 'false',
                    includePatterns = 'false'
                } = req.query;

                // Build cache key
                const cacheKey = `performance:${source}:${fromDate || 'all'}:${toDate || 'all'}:${includeVolatility}:${includePatterns}`;

                const result = await this.getCachedOrFetch(cacheKey, async () => {
                    let gameData, betData;

                    // Fetch data from appropriate source
                    if (source === 'database' && database.isConnectedToDatabase()) {
                        const gameOptions = {};
                        const betOptions = {};
                        if (fromDate) {
                            gameOptions.fromDate = fromDate;
                            betOptions.fromDate = fromDate;
                        }
                        if (toDate) {
                            gameOptions.toDate = toDate;
                            betOptions.toDate = toDate;
                        }
                        gameData = await database.getGameHistory(gameOptions);
                        betData = await database.getBetHistory(betOptions);
                    } else if (this.statsTracker) {
                        const options = {};
                        if (fromDate) options.fromDate = fromDate;
                        if (toDate) options.toDate = toDate;

                        gameData = this.statsTracker.getGameHistory(options);
                        // Filter for bets only
                        betData = this.statsTracker.getGameHistory({ ...options, betPlacedOnly: true });
                    } else {
                        throw new Error('No data source available');
                    }

                    // Build comprehensive performance report
                    const performanceReport = {
                        dataCount: {
                            games: gameData.length,
                            bets: betData.length
                        },
                        filters: { fromDate: fromDate || null, toDate: toDate || null }
                    };

                    // Always include core ROI and win rate analysis
                    if (betData.length > 0) {
                        performanceReport.roi = analytics.calculateROI(betData);
                        performanceReport.winRateByMultiplier = analytics.getWinRateByMultiplier(betData);
                        performanceReport.strategyEvaluation = analytics.evaluateStrategyPerformance(betData, gameData);
                    } else {
                        performanceReport.roi = { overall: null, message: 'No betting data available' };
                        performanceReport.winRateByMultiplier = { segments: [], overall: null };
                        performanceReport.strategyEvaluation = { evaluation: null, message: 'No betting data available' };
                    }

                    // Optional: Include volatility analysis
                    if (includeVolatility === 'true' && gameData.length > 0) {
                        performanceReport.volatility = analytics.calculateVolatility(gameData);
                    }

                    // Optional: Include pattern detection
                    if (includePatterns === 'true' && gameData.length > 0) {
                        performanceReport.patterns = analytics.identifyPatterns(gameData);
                    }

                    return {
                        success: true,
                        source: source,
                        report: performanceReport
                    };
                });

                res.json(result);
            } catch (error) {
                logger.error(`Error generating performance report: ${error.message}`);
                res.status(500).json({
                    success: false,
                    error: 'Failed to generate performance report',
                    message: error.message
                });
            }
        });

        // Get list of exported files
        this.app.get('/api/exports', async (req, res) => {
            try {
                const extension = req.query.format || null;
                const files = await dataExporter.getExportedFiles({ extension });

                res.json({
                    success: true,
                    count: files.length,
                    files: files.map(f => ({
                        filename: f.filename,
                        size: f.size,
                        created: f.created,
                        modified: f.modified,
                        path: f.path
                    }))
                });
            } catch (error) {
                logger.error(`Error fetching exports: ${error.message}`);
                res.status(500).json({
                    error: 'Failed to fetch exports',
                    message: error.message
                });
            }
        });

        // 404 handler for API routes
        this.app.use('/api/*', (req, res) => {
            res.status(404).json({
                error: 'Not found',
                message: `API endpoint ${req.path} does not exist`
            });
        });
    }

    /**
     * Setup Socket.IO for real-time data streaming
     */
    setupSocketIO() {
        this.io.on('connection', (socket) => {
            this.connectedClients.add(socket);
            logger.info(`Client connected via Socket.IO (ID: ${socket.id}), total clients: ${this.connectedClients.size}`);

            // Send current stats on connection
            if (this.statsTracker) {
                try {
                    const stats = this.statsTracker.getStats();
                    const recentGames = this.statsTracker.getGameHistory({ limit: 10 });

                    socket.emit('initialData', {
                        stats,
                        recentGames,
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    logger.error(`Error sending initial data: ${error.message}`);
                }
            }

            // Handle client disconnection
            socket.on('disconnect', () => {
                this.connectedClients.delete(socket);
                logger.info(`Client disconnected (ID: ${socket.id}), remaining clients: ${this.connectedClients.size}`);
            });

            // Handle request for stats
            socket.on('requestStats', () => {
                if (this.statsTracker) {
                    try {
                        const stats = this.statsTracker.getStats();
                        socket.emit('stats', stats);
                    } catch (error) {
                        logger.error(`Error sending stats: ${error.message}`);
                        socket.emit('error', { message: error.message });
                    }
                }
            });

            // Handle request for game history
            socket.on('requestHistory', (options = {}) => {
                if (this.statsTracker) {
                    try {
                        const history = this.statsTracker.getGameHistory(options);
                        socket.emit('history', history);
                    } catch (error) {
                        logger.error(`Error sending history: ${error.message}`);
                        socket.emit('error', { message: error.message });
                    }
                }
            });
        });
    }

    /**
     * Broadcast new game round to all connected clients
     * Call this method when a new game round is recorded
     * @param {Object} gameRound - Game round data
     */
    broadcastGameRound(gameRound) {
        if (this.connectedClients.size > 0) {
            this.io.emit('newGameRound', gameRound);
            logger.debug(`Broadcasted new game round to ${this.connectedClients.size} clients`);
        }
    }

    /**
     * Broadcast updated statistics to all connected clients
     * Call this method when stats are updated
     * @param {Object} stats - Updated statistics
     */
    broadcastStats(stats) {
        if (this.connectedClients.size > 0) {
            this.io.emit('statsUpdate', stats);
            logger.debug(`Broadcasted stats update to ${this.connectedClients.size} clients`);
        }
    }

    /**
     * Start the server
     */
    start() {
        return new Promise((resolve, reject) => {
            try {
                this.server.listen(this.port, () => {
                    logger.info(`Aviator Data API Server running on http://localhost:${this.port}`);
                    logger.info(`API endpoints available at http://localhost:${this.port}/api/*`);
                    logger.info(`Socket.IO server ready for real-time connections`);
                    resolve();
                });

                this.server.on('error', (error) => {
                    if (error.code === 'EADDRINUSE') {
                        logger.error(`Port ${this.port} is already in use`);
                    } else {
                        logger.error(`Server error: ${error.message}`);
                    }
                    reject(error);
                });
            } catch (error) {
                logger.error(`Failed to start server: ${error.message}`);
                reject(error);
            }
        });
    }

    /**
     * Stop the server gracefully
     */
    stop() {
        return new Promise((resolve) => {
            logger.info('Shutting down API server...');

            // Close all Socket.IO connections
            this.io.close(() => {
                logger.info('Socket.IO connections closed');
            });

            // Close HTTP server
            this.server.close(() => {
                logger.info('API server stopped');
                resolve();
            });
        });
    }
}

// Export singleton instance
const server = new AviatorDataServer(3000);
module.exports = server;
