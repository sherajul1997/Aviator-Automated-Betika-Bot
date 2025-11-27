const mysql = require('mysql');
const config = require('../util/config');
const logger = require('../util/logger');
const fs = require('fs').promises;
const path = require('path');

/**
 * Database class for managing MySQL connections and operations
 * Provides connection pooling, error recovery, and comprehensive data operations
 * for aviator game data, betting history, and session statistics
 */
class Database {
    constructor() {
        this.pool = null;
        this.previousBubbleValue = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000; // 5 seconds
    }

    /**
     * Initialize connection pool with error handling and reconnection logic
     * Uses connection pooling for better performance
     * @returns {Promise<void>}
     */
    connect() {
        return new Promise((resolve, reject) => {
            try {
                // Create connection pool for better performance
                this.pool = mysql.createPool({
                    ...config.DATABASE,
                    connectionLimit: 10,
                    waitForConnections: true,
                    queueLimit: 0,
                    enableKeepAlive: true,
                    keepAliveInitialDelay: 0
                });

                // Test the connection
                this.pool.getConnection((err, connection) => {
                    if (err) {
                        logger.error(`Database connection error: ${err.message}`);
                        this.handleConnectionError(err);
                        reject(err);
                        return;
                    }

                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    logger.info('Successfully connected to database with connection pool');

                    // Release the test connection back to pool
                    connection.release();
                    resolve();
                });

                // Handle pool errors
                this.pool.on('error', (err) => {
                    logger.error(`Database pool error: ${err.message}`);
                    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNREFUSED') {
                        this.isConnected = false;
                        this.handleConnectionError(err);
                    }
                });

            } catch (err) {
                logger.error(`Failed to create database pool: ${err.message}`);
                reject(err);
            }
        });
    }

    /**
     * Handle connection errors with automatic reconnection logic
     * @param {Error} err - The error that occurred
     */
    handleConnectionError(err) {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
            return;
        }

        this.reconnectAttempts++;
        logger.info(`Attempting to reconnect to database (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

        setTimeout(() => {
            this.connect()
                .then(() => {
                    logger.info('Database reconnection successful');
                })
                .catch((err) => {
                    logger.error(`Database reconnection failed: ${err.message}`);
                });
        }, this.reconnectDelay);
    }

    /**
     * Execute a query with connection error handling
     * @param {string} query - SQL query to execute
     * @param {Array} params - Query parameters
     * @returns {Promise<any>} - Query results
     */
    executeQuery(query, params = []) {
        return new Promise((resolve, reject) => {
            if (!this.pool) {
                const err = new Error('Database pool not initialized');
                logger.error(err.message);
                reject(err);
                return;
            }

            this.pool.query(query, params, (err, results) => {
                if (err) {
                    logger.error(`Query error: ${err.message}`);
                    logger.debug(`Failed query: ${query}`);
                    reject(err);
                    return;
                }
                resolve(results);
            });
        });
    }

    /**
     * Initialize database tables using schema.sql
     * Creates tables if they don't exist
     * @returns {Promise<void>}
     */
    async initializeDatabase() {
        try {
            logger.info('Initializing database schema...');

            // Read schema file
            const schemaPath = path.join(__dirname, 'schema.sql');
            const schemaContent = await fs.readFile(schemaPath, 'utf8');

            // Split schema into individual statements
            // Remove comments and split by semicolon
            const statements = schemaContent
                .split('\n')
                .filter(line => !line.trim().startsWith('--'))
                .join('\n')
                .split(';')
                .map(stmt => stmt.trim())
                .filter(stmt => stmt.length > 0);

            // Execute each statement
            for (const statement of statements) {
                if (statement.toUpperCase().includes('CREATE DATABASE')) {
                    // Skip CREATE DATABASE statement as we assume DB exists
                    continue;
                }
                if (statement.toUpperCase().includes('USE ')) {
                    // Skip USE statement as connection config handles this
                    continue;
                }

                try {
                    await this.executeQuery(statement);
                } catch (err) {
                    // Log but don't throw for view creation errors (may already exist)
                    if (statement.toUpperCase().includes('CREATE OR REPLACE VIEW')) {
                        logger.warn(`View creation warning: ${err.message}`);
                    } else {
                        logger.error(`Statement execution failed: ${err.message}`);
                        throw err;
                    }
                }
            }

            logger.info('Database schema initialized successfully');
        } catch (err) {
            logger.error(`Failed to initialize database: ${err.message}`);
            throw err;
        }
    }

    /**
     * Save a game round to the database
     * @param {Object} gameData - Game round data
     * @param {number} gameData.multiplier - The crash multiplier
     * @param {Date|string} gameData.timestamp - Game timestamp
     * @param {number} [gameData.gameDuration] - Game duration in milliseconds
     * @returns {Promise<number>} - Inserted row ID
     */
    async saveGameRound(gameData) {
        try {
            const { multiplier, timestamp, gameDuration = null } = gameData;

            if (!multiplier || !timestamp) {
                throw new Error('Missing required game data: multiplier and timestamp are required');
            }

            const query = 'INSERT INTO game_rounds (multiplier, timestamp, game_duration) VALUES (?, ?, ?)';
            const result = await this.executeQuery(query, [multiplier, timestamp, gameDuration]);

            logger.debug(`Saved game round: multiplier=${multiplier}, id=${result.insertId}`);
            return result.insertId;
        } catch (err) {
            logger.error(`Failed to save game round: ${err.message}`);
            throw err;
        }
    }

    /**
     * Save bet history to the database
     * @param {Object} betData - Bet history data
     * @param {number} [betData.gameRoundId] - Foreign key to game_rounds table
     * @param {number} betData.betAmount - Amount wagered
     * @param {number} betData.targetMultiplier - Target multiplier for cashout
     * @param {number} betData.actualMultiplier - Actual multiplier achieved
     * @param {number} betData.profitLoss - Net profit or loss
     * @param {boolean} betData.won - Whether bet was won
     * @param {Date|string} betData.timestamp - Bet timestamp
     * @returns {Promise<number>} - Inserted row ID
     */
    async saveBetHistory(betData) {
        try {
            const {
                gameRoundId = null,
                betAmount,
                targetMultiplier,
                actualMultiplier,
                profitLoss,
                won,
                timestamp
            } = betData;

            if (!betAmount || !targetMultiplier || !actualMultiplier || profitLoss === undefined || won === undefined || !timestamp) {
                throw new Error('Missing required bet data');
            }

            const query = `
                INSERT INTO bet_history
                (game_round_id, bet_amount, target_multiplier, actual_multiplier, profit_loss, won, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            const result = await this.executeQuery(query, [
                gameRoundId,
                betAmount,
                targetMultiplier,
                actualMultiplier,
                profitLoss,
                won,
                timestamp
            ]);

            logger.debug(`Saved bet history: amount=${betAmount}, won=${won}, id=${result.insertId}`);
            return result.insertId;
        } catch (err) {
            logger.error(`Failed to save bet history: ${err.message}`);
            throw err;
        }
    }

    /**
     * Batch insert game rounds for efficiency
     * @param {Array<Object>} gameRounds - Array of game round data objects
     * @returns {Promise<number>} - Number of rows inserted
     */
    async saveGameRoundsBatch(gameRounds) {
        try {
            if (!gameRounds || gameRounds.length === 0) {
                return 0;
            }

            const query = 'INSERT INTO game_rounds (multiplier, timestamp, game_duration) VALUES ?';
            const values = gameRounds.map(game => [
                game.multiplier,
                game.timestamp,
                game.gameDuration || null
            ]);

            const result = await this.executeQuery(query, [values]);
            logger.info(`Batch inserted ${result.affectedRows} game rounds`);
            return result.affectedRows;
        } catch (err) {
            logger.error(`Failed to batch insert game rounds: ${err.message}`);
            throw err;
        }
    }

    /**
     * Batch insert bet history for efficiency
     * @param {Array<Object>} bets - Array of bet history data objects
     * @returns {Promise<number>} - Number of rows inserted
     */
    async saveBetHistoryBatch(bets) {
        try {
            if (!bets || bets.length === 0) {
                return 0;
            }

            const query = `
                INSERT INTO bet_history
                (game_round_id, bet_amount, target_multiplier, actual_multiplier, profit_loss, won, timestamp)
                VALUES ?
            `;
            const values = bets.map(bet => [
                bet.gameRoundId || null,
                bet.betAmount,
                bet.targetMultiplier,
                bet.actualMultiplier,
                bet.profitLoss,
                bet.won,
                bet.timestamp
            ]);

            const result = await this.executeQuery(query, [values]);
            logger.info(`Batch inserted ${result.affectedRows} bet history records`);
            return result.affectedRows;
        } catch (err) {
            logger.error(`Failed to batch insert bet history: ${err.message}`);
            throw err;
        }
    }

    /**
     * Get game history with optional filtering
     * @param {Object} options - Query options
     * @param {Date|string} [options.fromDate] - Start date for filtering
     * @param {Date|string} [options.toDate] - End date for filtering
     * @param {number} [options.minMultiplier] - Minimum multiplier filter
     * @param {number} [options.maxMultiplier] - Maximum multiplier filter
     * @param {number} [options.limit=100] - Maximum number of records to return
     * @param {number} [options.offset=0] - Number of records to skip
     * @param {string} [options.orderBy='timestamp'] - Column to order by
     * @param {string} [options.orderDir='DESC'] - Order direction (ASC or DESC)
     * @returns {Promise<Array>} - Array of game round records
     */
    async getGameHistory(options = {}) {
        try {
            const {
                fromDate,
                toDate,
                minMultiplier,
                maxMultiplier,
                limit = 100,
                offset = 0,
                orderBy = 'timestamp',
                orderDir = 'DESC'
            } = options;

            let query = 'SELECT * FROM game_rounds WHERE 1=1';
            const params = [];

            // Add date range filters
            if (fromDate) {
                query += ' AND timestamp >= ?';
                params.push(fromDate);
            }
            if (toDate) {
                query += ' AND timestamp <= ?';
                params.push(toDate);
            }

            // Add multiplier range filters
            if (minMultiplier !== undefined) {
                query += ' AND multiplier >= ?';
                params.push(minMultiplier);
            }
            if (maxMultiplier !== undefined) {
                query += ' AND multiplier <= ?';
                params.push(maxMultiplier);
            }

            // Add ordering
            const validOrderColumns = ['id', 'multiplier', 'timestamp', 'game_duration', 'created_at'];
            const validOrderDirs = ['ASC', 'DESC'];

            if (validOrderColumns.includes(orderBy) && validOrderDirs.includes(orderDir.toUpperCase())) {
                query += ` ORDER BY ${orderBy} ${orderDir.toUpperCase()}`;
            } else {
                query += ' ORDER BY timestamp DESC';
            }

            // Add pagination
            query += ' LIMIT ? OFFSET ?';
            params.push(limit, offset);

            const results = await this.executeQuery(query, params);
            logger.debug(`Retrieved ${results.length} game history records`);
            return results;
        } catch (err) {
            logger.error(`Failed to get game history: ${err.message}`);
            throw err;
        }
    }

    /**
     * Get bet history with optional filtering
     * @param {Object} options - Query options
     * @param {Date|string} [options.fromDate] - Start date for filtering
     * @param {Date|string} [options.toDate] - End date for filtering
     * @param {boolean} [options.wonOnly] - Filter for winning bets only
     * @param {number} [options.limit=100] - Maximum number of records to return
     * @param {number} [options.offset=0] - Number of records to skip
     * @returns {Promise<Array>} - Array of bet history records
     */
    async getBetHistory(options = {}) {
        try {
            const {
                fromDate,
                toDate,
                wonOnly,
                limit = 100,
                offset = 0
            } = options;

            let query = 'SELECT * FROM bet_history WHERE 1=1';
            const params = [];

            if (fromDate) {
                query += ' AND timestamp >= ?';
                params.push(fromDate);
            }
            if (toDate) {
                query += ' AND timestamp <= ?';
                params.push(toDate);
            }
            if (wonOnly !== undefined) {
                query += ' AND won = ?';
                params.push(wonOnly);
            }

            query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);

            const results = await this.executeQuery(query, params);
            logger.debug(`Retrieved ${results.length} bet history records`);
            return results;
        } catch (err) {
            logger.error(`Failed to get bet history: ${err.message}`);
            throw err;
        }
    }

    /**
     * Get comprehensive statistics for a date range
     * @param {Object} dateRange - Date range for statistics
     * @param {Date|string} [dateRange.fromDate] - Start date
     * @param {Date|string} [dateRange.toDate] - End date
     * @returns {Promise<Object>} - Statistics object with game and bet data
     */
    async getStatistics(dateRange = {}) {
        try {
            const { fromDate, toDate } = dateRange;
            const params = [];

            // Build date filter clause
            let dateFilter = '';
            if (fromDate || toDate) {
                dateFilter = ' WHERE';
                if (fromDate) {
                    dateFilter += ' timestamp >= ?';
                    params.push(fromDate);
                }
                if (toDate) {
                    if (fromDate) dateFilter += ' AND';
                    dateFilter += ' timestamp <= ?';
                    params.push(toDate);
                }
            }

            // Get game statistics
            const gameStatsQuery = `
                SELECT
                    COUNT(*) as total_games,
                    AVG(multiplier) as avg_multiplier,
                    MIN(multiplier) as min_multiplier,
                    MAX(multiplier) as max_multiplier,
                    STDDEV(multiplier) as stddev_multiplier,
                    AVG(game_duration) as avg_duration
                FROM game_rounds
                ${dateFilter}
            `;
            const gameStats = await this.executeQuery(gameStatsQuery, params);

            // Get bet statistics
            const betStatsQuery = `
                SELECT
                    COUNT(*) as total_bets,
                    SUM(CASE WHEN won = 1 THEN 1 ELSE 0 END) as total_wins,
                    SUM(CASE WHEN won = 0 THEN 1 ELSE 0 END) as total_losses,
                    SUM(profit_loss) as net_profit,
                    AVG(profit_loss) as avg_profit_per_bet,
                    AVG(bet_amount) as avg_bet_amount,
                    MIN(bet_amount) as min_bet_amount,
                    MAX(bet_amount) as max_bet_amount,
                    AVG(target_multiplier) as avg_target_multiplier
                FROM bet_history
                ${dateFilter}
            `;
            const betStats = await this.executeQuery(betStatsQuery, params);

            // Get multiplier distribution
            const distributionQuery = `
                SELECT
                    CASE
                        WHEN multiplier < 1.5 THEN '1.0-1.5'
                        WHEN multiplier < 2.0 THEN '1.5-2.0'
                        WHEN multiplier < 3.0 THEN '2.0-3.0'
                        WHEN multiplier < 5.0 THEN '3.0-5.0'
                        WHEN multiplier < 10.0 THEN '5.0-10.0'
                        ELSE '10.0+'
                    END as multiplier_range,
                    COUNT(*) as frequency
                FROM game_rounds
                ${dateFilter}
                GROUP BY multiplier_range
                ORDER BY MIN(multiplier)
            `;
            const distribution = await this.executeQuery(distributionQuery, params);

            // Calculate win rate
            const totalBets = betStats[0].total_bets || 0;
            const totalWins = betStats[0].total_wins || 0;
            const winRate = totalBets > 0 ? (totalWins / totalBets * 100).toFixed(2) : 0;

            const statistics = {
                dateRange: {
                    from: fromDate || null,
                    to: toDate || null
                },
                games: {
                    total: gameStats[0].total_games || 0,
                    avgMultiplier: parseFloat(gameStats[0].avg_multiplier || 0).toFixed(2),
                    minMultiplier: parseFloat(gameStats[0].min_multiplier || 0).toFixed(2),
                    maxMultiplier: parseFloat(gameStats[0].max_multiplier || 0).toFixed(2),
                    stddevMultiplier: parseFloat(gameStats[0].stddev_multiplier || 0).toFixed(2),
                    avgDuration: parseInt(gameStats[0].avg_duration || 0)
                },
                bets: {
                    total: totalBets,
                    wins: totalWins,
                    losses: betStats[0].total_losses || 0,
                    winRate: parseFloat(winRate),
                    netProfit: parseFloat(betStats[0].net_profit || 0).toFixed(2),
                    avgProfitPerBet: parseFloat(betStats[0].avg_profit_per_bet || 0).toFixed(2),
                    avgBetAmount: parseFloat(betStats[0].avg_bet_amount || 0).toFixed(2),
                    minBetAmount: parseFloat(betStats[0].min_bet_amount || 0).toFixed(2),
                    maxBetAmount: parseFloat(betStats[0].max_bet_amount || 0).toFixed(2),
                    avgTargetMultiplier: parseFloat(betStats[0].avg_target_multiplier || 0).toFixed(2)
                },
                distribution: distribution.map(row => ({
                    range: row.multiplier_range,
                    frequency: row.frequency
                }))
            };

            logger.debug('Retrieved statistics successfully');
            return statistics;
        } catch (err) {
            logger.error(`Failed to get statistics: ${err.message}`);
            throw err;
        }
    }

    /**
     * Legacy method for saving bubble values (backward compatibility)
     * @param {number} value - Bubble value to save
     * @returns {Promise<any>}
     */
    async saveBubbleValue(value) {
        if (value === this.previousBubbleValue) {
            logger.debug('No change in bubble value, skipping save');
            return;
        }

        return new Promise((resolve, reject) => {
            const query = 'INSERT INTO bubble_data (value) VALUES (?)';
            this.pool.query(query, [value], (err, result) => {
                if (err) {
                    logger.error(`Database save error: ${err.message}`);
                    reject(err);
                    return;
                }
                logger.info(`Saved bubble value: ${value}`);
                this.previousBubbleValue = value;
                resolve(result);
            });
        });
    }

    /**
     * Check if database is connected
     * @returns {boolean} - Connection status
     */
    isConnectedToDatabase() {
        return this.isConnected && this.pool !== null;
    }

    /**
     * Get connection pool statistics
     * @returns {Object} - Pool statistics
     */
    getPoolStats() {
        if (!this.pool) {
            return { connected: false };
        }

        return {
            connected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts
        };
    }

    /**
     * Close database connection pool
     * @returns {Promise<void>}
     */
    disconnect() {
        return new Promise((resolve, reject) => {
            if (this.pool) {
                this.pool.end((err) => {
                    if (err) {
                        logger.error(`Error closing database pool: ${err.message}`);
                        reject(err);
                        return;
                    }
                    this.isConnected = false;
                    this.pool = null;
                    logger.info('Database connection pool closed');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = new Database();
