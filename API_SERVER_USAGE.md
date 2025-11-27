# Aviator Data API Server - Usage Guide

## Overview

The Aviator Data API Server (`/code/server.js`) provides REST API endpoints and Socket.IO real-time streaming for accessing collected aviator game data. This server integrates with the existing bot infrastructure to serve game history, statistics, and export functionality.

## Features

- **REST API Endpoints**: Access game data, statistics, and export functionality via HTTP
- **Real-time Streaming**: Socket.IO server for live game updates
- **CORS Enabled**: Access from web interfaces and external clients
- **Data Export**: Download game data in JSON or CSV formats
- **Filtering**: Query data with various filters (date range, multiplier range, bet status)

## Quick Start

### Option 1: Standalone Test Server

Run the test server with mock data:

```bash
node test-server.js
```

This will:
- Create mock game data (20 initial rounds)
- Start the API server on port 3000
- Simulate new game rounds every 5 seconds
- Broadcast updates to connected Socket.IO clients

### Option 2: Integration with Main Bot

To integrate the API server with the main bot, modify `/code/index.js`:

```javascript
// Add at the top of index.js
const apiServer = require('./server');

// In the main() function, after strategy selection:
async function main() {
    try {
        logger.info('Starting Aviator Bot...');

        // Get strategy configuration from user
        const strategyConfig = await selectStrategy();
        logger.info('Strategy selected, initializing bot...');

        // Start API server
        await apiServer.start();
        logger.info('API server started on port 3000');

        // ... rest of existing code
    }
}

// In handleNewTab function, after creating GameMonitor:
async function handleNewTab(target, browser, strategyConfig) {
    if (target.type() === 'page') {
        const newPage = await target.page();
        if (newPage) {
            try {
                // ... existing code ...

                const gameMonitor = new GameMonitor(newPage, config);

                // Connect statsTracker to API server
                apiServer.setStatsTracker(gameMonitor.statsTracker);

                // Setup broadcasting for real-time updates
                // Wrap the original addGameRound to broadcast updates
                const originalAddGameRound = gameMonitor.statsTracker.addGameRound.bind(gameMonitor.statsTracker);
                gameMonitor.statsTracker.addGameRound = function(gameData) {
                    const gameRound = originalAddGameRound(gameData);
                    apiServer.broadcastGameRound(gameRound);
                    apiServer.broadcastStats(this.getStats());
                    return gameRound;
                };

                // ... rest of existing code ...
            }
        }
    }
}

// In setupGracefulShutdown function:
async function setupGracefulShutdown(browser) {
    const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

    signals.forEach(signal => {
        process.on(signal, async () => {
            logger.info(`Received ${signal}, shutting down gracefully...`);

            try {
                await browser.close();
                await apiServer.stop(); // Add this line
                // database.disconnect();
                logger.info('Cleanup completed');
                rl.close();
                process.exit(0);
            } catch (error) {
                logger.error(`Error during shutdown: ${error.message}`);
                process.exit(1);
            }
        });
    });
}
```

## API Endpoints

### Health Check

**GET** `/api/health`

Check if the server is running and statsTracker is connected.

```bash
curl http://localhost:3000/api/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-27T10:30:00.000Z",
  "statsTrackerConnected": true
}
```

### Get Recent Games

**GET** `/api/data/recent?limit={number}`

Get the most recent game rounds (default: last 100).

```bash
# Get last 100 games (default)
curl http://localhost:3000/api/data/recent

# Get last 10 games
curl http://localhost:3000/api/data/recent?limit=10
```

Response:
```json
{
  "success": true,
  "count": 10,
  "limit": 10,
  "data": [
    {
      "id": 1,
      "multiplier": 2.54,
      "timestamp": "2025-11-27T10:25:30.000Z",
      "betPlaced": true,
      "betAmount": 100,
      "targetMultiplier": 2.0,
      "actualMultiplier": 2.54,
      "won": true,
      "profit": 100,
      "gameDuration": 5430
    }
  ]
}
```

### Get All Games with Filtering

**GET** `/api/data/all?[filters]`

Get all game data with optional filtering.

**Query Parameters:**
- `fromDate` - Start date (ISO format)
- `toDate` - End date (ISO format)
- `betPlacedOnly` - Only games with bets (true/false)
- `wonOnly` - Only winning bets (true/false)
- `minMultiplier` - Minimum multiplier value
- `maxMultiplier` - Maximum multiplier value
- `limit` - Maximum number of records

```bash
# Get all games with bets placed
curl http://localhost:3000/api/data/all?betPlacedOnly=true

# Get games with multiplier >= 5.0
curl http://localhost:3000/api/data/all?minMultiplier=5.0

# Get winning bets from today
curl "http://localhost:3000/api/data/all?wonOnly=true&fromDate=2025-11-27T00:00:00Z"

# Combine multiple filters
curl "http://localhost:3000/api/data/all?betPlacedOnly=true&minMultiplier=2.0&limit=50"
```

### Get Statistics

**GET** `/api/stats`

Get comprehensive statistics including trading stats and game stats.

```bash
curl http://localhost:3000/api/stats
```

Response:
```json
{
  "success": true,
  "tradingStats": {
    "totalTrades": 45,
    "winRate": 62.22,
    "totalProfit": 3450.50,
    "totalLoss": -1200.00,
    "netProfit": 2250.50,
    "largestWin": 450.00,
    "largestLoss": -200.00,
    "averageWin": 123.94,
    "averageLoss": -70.59,
    "longestWinStreak": 7,
    "longestLossStreak": 3
  },
  "gameStats": {
    "totalGames": 150,
    "gamesWithBets": 45,
    "gamesWithoutBets": 105,
    "averageMultiplier": 2.34,
    "maxMultiplier": 12.45,
    "minMultiplier": 1.01
  },
  "timestamp": "2025-11-27T10:30:00.000Z"
}
```

### Export Data

**GET** `/api/export/:format?[filters]`

Export game data in specified format (json or csv).

**Supported Formats:**
- `json` - JSON format with metadata
- `csv` - CSV format with headers

**Query Parameters:** (same as `/api/data/all`)

```bash
# Export all data as JSON
curl http://localhost:3000/api/export/json -O -J

# Export all data as CSV
curl http://localhost:3000/api/export/csv -O -J

# Export only winning bets as JSON
curl "http://localhost:3000/api/export/json?wonOnly=true" -O -J

# Export games with multiplier >= 5.0 as CSV
curl "http://localhost:3000/api/export/csv?minMultiplier=5.0" -O -J
```

The file will be downloaded with a timestamped filename like:
- `aviator_data_2025-11-27T10-30-00.json`
- `aviator_data_2025-11-27T10-30-00.csv`

### List Exported Files

**GET** `/api/exports?format={extension}`

Get list of previously exported files.

```bash
# List all exports
curl http://localhost:3000/api/exports

# List only JSON exports
curl http://localhost:3000/api/exports?format=json

# List only CSV exports
curl http://localhost:3000/api/exports?format=csv
```

## Socket.IO Real-time Streaming

### Connection

Connect to the Socket.IO server:

```javascript
const socket = io('http://localhost:3000');

// Receive initial data on connection
socket.on('initialData', (data) => {
    console.log('Initial stats:', data.stats);
    console.log('Recent games:', data.recentGames);
});

// Receive new game rounds in real-time
socket.on('newGameRound', (gameRound) => {
    console.log('New game:', gameRound);
});

// Receive stats updates
socket.on('statsUpdate', (stats) => {
    console.log('Updated stats:', stats);
});

// Handle errors
socket.on('error', (error) => {
    console.error('Socket error:', error);
});
```

### Request Data

Request stats or history on demand:

```javascript
// Request current statistics
socket.emit('requestStats');

// Receive stats response
socket.on('stats', (stats) => {
    console.log('Current stats:', stats);
});

// Request game history with filters
socket.emit('requestHistory', { limit: 50, betPlacedOnly: true });

// Receive history response
socket.on('history', (history) => {
    console.log('Game history:', history);
});
```

## Web Interface

The server serves static files from `/code/public/`. Access the web interface at:

```
http://localhost:3000
```

This will serve the existing `/code/public/index.html` page with live chart visualization.

## Testing

### Manual Testing

1. Start the test server:
   ```bash
   node test-server.js
   ```

2. Open another terminal and test endpoints:
   ```bash
   # Health check
   curl http://localhost:3000/api/health

   # Get stats
   curl http://localhost:3000/api/stats

   # Get recent games
   curl http://localhost:3000/api/data/recent?limit=5
   ```

3. Open web browser to test Socket.IO:
   ```
   http://localhost:3000
   ```

   Open browser console and check for real-time updates.

### Integration Testing

To test with the main bot:

1. Apply the integration code changes to `/code/index.js` as shown above
2. Run the bot: `node index.js`
3. The API server will start automatically
4. Access endpoints while the bot is running

## Port Configuration

The server runs on port 3000 by default. To change the port:

```javascript
// In server.js, modify the export at the bottom:
const server = new AviatorDataServer(3001); // Change to desired port
module.exports = server;
```

Or pass the port when initializing in your code:

```javascript
const AviatorDataServer = require('./server');
const server = new AviatorDataServer(3001);
```

## Security Considerations

- CORS is enabled for all origins (`*`) - restrict this in production
- No authentication is implemented - add authentication for production use
- API is intended for local development - use HTTPS and proper security in production

## Troubleshooting

### Port Already in Use

If you see "Port 3000 is already in use":
- Check if another instance is running: `lsof -i :3000`
- Kill the process or use a different port

### StatsTracker Not Connected

If you see "Stats tracker not initialized":
- Ensure `setStatsTracker()` is called before accessing endpoints
- Check that the bot has started and GameMonitor is initialized

### No Data Available

If endpoints return empty arrays:
- Ensure game rounds are being monitored
- Check that `addGameRound()` is being called in GameMonitor
- Verify the bot is actually placing bets and tracking games

## Advanced Usage

### Custom Middleware

Add custom middleware to the server:

```javascript
const server = require('./server');

// Add custom middleware before starting
server.app.use((req, res, next) => {
    console.log(`Custom middleware: ${req.method} ${req.path}`);
    next();
});

await server.start();
```

### Custom Routes

Add additional API routes:

```javascript
const server = require('./server');

// Add custom route
server.app.get('/api/custom', (req, res) => {
    res.json({ message: 'Custom endpoint' });
});

await server.start();
```

### Broadcasting Custom Events

Broadcast custom events to all Socket.IO clients:

```javascript
const server = require('./server');

// Broadcast custom event
server.io.emit('customEvent', { data: 'custom data' });
```

## Next Steps

Step 2.2 of the Runbook will enhance the web interface to:
- Display comprehensive data tables
- Show statistics dashboard
- Add multiplier distribution charts
- Implement export controls in the UI
- Add filtering and date range selection

The API server is now ready to serve data to the enhanced web interface!
