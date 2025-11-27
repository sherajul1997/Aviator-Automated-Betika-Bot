const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const logger = require('./util/logger');
const dataExporter = require('./util/dataExporter');

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

        // Export data in specified format
        this.app.get('/api/export/:format', async (req, res) => {
            try {
                if (!this.statsTracker) {
                    return res.status(503).json({
                        error: 'Stats tracker not initialized',
                        message: 'The bot is starting up, please try again in a moment'
                    });
                }

                const format = req.params.format.toLowerCase();

                // Validate format
                if (!['json', 'csv'].includes(format)) {
                    return res.status(400).json({
                        error: 'Invalid format',
                        message: 'Supported formats: json, csv'
                    });
                }

                // Parse filtering options
                const filterOptions = {};
                if (req.query.fromDate) filterOptions.fromDate = req.query.fromDate;
                if (req.query.toDate) filterOptions.toDate = req.query.toDate;
                if (req.query.betPlacedOnly === 'true') filterOptions.betPlacedOnly = true;
                if (req.query.wonOnly === 'true') filterOptions.wonOnly = true;
                if (req.query.minMultiplier) filterOptions.minMultiplier = parseFloat(req.query.minMultiplier);
                if (req.query.maxMultiplier) filterOptions.maxMultiplier = parseFloat(req.query.maxMultiplier);
                if (req.query.limit) filterOptions.limit = parseInt(req.query.limit);

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
