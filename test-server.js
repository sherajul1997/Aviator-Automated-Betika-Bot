/**
 * Test script for the Aviator Data API Server
 * This script creates a mock statsTracker and tests the API endpoints
 */

const server = require('./server');
const StatsTracker = require('./game/statsTracker');
const logger = require('./util/logger');

async function testServer() {
    try {
        logger.info('=== Testing Aviator Data API Server ===');

        // Create a mock statsTracker with test data
        const statsTracker = new StatsTracker();

        // Add some mock game rounds
        logger.info('Adding mock game data...');
        for (let i = 1; i <= 20; i++) {
            const multiplier = (Math.random() * 10 + 1).toFixed(2);
            const betPlaced = i % 3 === 0; // Every 3rd game has a bet

            const gameData = {
                multiplier: parseFloat(multiplier),
                timestamp: new Date(Date.now() - (20 - i) * 60000).toISOString(), // Spread over last 20 minutes
                betPlaced: betPlaced,
                gameDuration: Math.floor(Math.random() * 10000) + 2000
            };

            if (betPlaced) {
                const targetMultiplier = (Math.random() * 3 + 1.5).toFixed(2);
                gameData.betAmount = 100;
                gameData.targetMultiplier = parseFloat(targetMultiplier);
                gameData.won = parseFloat(multiplier) >= parseFloat(targetMultiplier);
                gameData.profit = gameData.won
                    ? gameData.betAmount * (gameData.targetMultiplier - 1)
                    : -gameData.betAmount;
            }

            statsTracker.addGameRound(gameData);
        }

        logger.info(`Added ${statsTracker.gameHistory.length} mock game rounds`);

        // Connect statsTracker to server
        server.setStatsTracker(statsTracker);

        // Start the server
        await server.start();

        logger.info('');
        logger.info('=== Server Started Successfully ===');
        logger.info('');
        logger.info('Test the following endpoints:');
        logger.info('  - http://localhost:3000/api/health');
        logger.info('  - http://localhost:3000/api/stats');
        logger.info('  - http://localhost:3000/api/data/recent');
        logger.info('  - http://localhost:3000/api/data/recent?limit=5');
        logger.info('  - http://localhost:3000/api/data/all');
        logger.info('  - http://localhost:3000/api/data/all?betPlacedOnly=true');
        logger.info('  - http://localhost:3000/api/export/json');
        logger.info('  - http://localhost:3000/api/export/csv');
        logger.info('  - http://localhost:3000/api/exports');
        logger.info('');
        logger.info('Web interface available at: http://localhost:3000');
        logger.info('');
        logger.info('Press Ctrl+C to stop the server');
        logger.info('');

        // Simulate real-time updates every 5 seconds
        setInterval(() => {
            const multiplier = (Math.random() * 10 + 1).toFixed(2);
            const betPlaced = Math.random() > 0.7;

            const gameData = {
                multiplier: parseFloat(multiplier),
                timestamp: new Date().toISOString(),
                betPlaced: betPlaced,
                gameDuration: Math.floor(Math.random() * 10000) + 2000
            };

            if (betPlaced) {
                const targetMultiplier = (Math.random() * 3 + 1.5).toFixed(2);
                gameData.betAmount = 100;
                gameData.targetMultiplier = parseFloat(targetMultiplier);
                gameData.won = parseFloat(multiplier) >= parseFloat(targetMultiplier);
                gameData.profit = gameData.won
                    ? gameData.betAmount * (gameData.targetMultiplier - 1)
                    : -gameData.betAmount;
            }

            const gameRound = statsTracker.addGameRound(gameData);
            const stats = statsTracker.getStats();

            // Broadcast to connected clients
            server.broadcastGameRound(gameRound);
            server.broadcastStats(stats);

            logger.info(`Simulated game round: ${multiplier}x (bet: ${betPlaced})`);
        }, 5000);

    } catch (error) {
        logger.error(`Test failed: ${error.message}`);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    logger.info('\nShutting down test server...');
    await server.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('\nShutting down test server...');
    await server.stop();
    process.exit(0);
});

// Run the test
testServer();
