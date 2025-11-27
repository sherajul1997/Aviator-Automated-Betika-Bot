# Export API Documentation

This document describes the data export endpoints available in the Aviator Data API Server.

## Export Endpoints

The API provides downloadable export functionality for aviator game data in JSON and CSV formats.

### Dedicated Export Endpoints

#### Export as JSON
```
GET /api/export/json
```

Downloads all game data in JSON format with proper metadata structure.

**Query Parameters:**
- `fromDate` (string, ISO date): Filter games from this date onwards
- `toDate` (string, ISO date): Filter games up to this date
- `betPlacedOnly` (boolean): Only include games where bets were placed (use `true`)
- `wonOnly` (boolean): Only include games that were won (use `true`)
- `minMultiplier` (number): Only include games with multiplier >= this value
- `maxMultiplier` (number): Only include games with multiplier <= this value
- `limit` (number): Limit the number of results

**Response:**
- Content-Type: `application/json`
- Content-Disposition: `attachment; filename="aviator_data_YYYY-MM-DDTHH-mm-ss.json"`
- Body: JSON file with formatted game data

**Example Requests:**
```bash
# Export all data as JSON
curl -O http://localhost:3000/api/export/json

# Export only games with bets placed
curl -O http://localhost:3000/api/export/json?betPlacedOnly=true

# Export games from specific date range
curl -O http://localhost:3000/api/export/json?fromDate=2025-01-01&toDate=2025-01-31

# Export only high multipliers (>= 5x)
curl -O http://localhost:3000/api/export/json?minMultiplier=5.0

# Export last 100 games only
curl -O http://localhost:3000/api/export/json?limit=100
```

#### Export as CSV
```
GET /api/export/csv
```

Downloads all game data in CSV format with column headers.

**Query Parameters:**
Same as JSON export (see above)

**Response:**
- Content-Type: `text/csv`
- Content-Disposition: `attachment; filename="aviator_data_YYYY-MM-DDTHH-mm-ss.csv"`
- Body: CSV file with game data

**Example Requests:**
```bash
# Export all data as CSV
curl -O http://localhost:3000/api/export/csv

# Export only winning games
curl -O http://localhost:3000/api/export/csv?wonOnly=true

# Export games from specific date
curl -O http://localhost:3000/api/export/csv?fromDate=2025-01-27

# Export games in specific multiplier range
curl -O http://localhost:3000/api/export/csv?minMultiplier=2.0&maxMultiplier=5.0
```

### Flexible Format Endpoint

#### Export with Format Parameter
```
GET /api/export/:format
```

Generic export endpoint that accepts format as URL parameter.

**URL Parameters:**
- `format` (required): Export format, must be `json` or `csv`

**Query Parameters:**
Same as dedicated endpoints (see above)

**Example Requests:**
```bash
# Export as JSON using format parameter
curl -O http://localhost:3000/api/export/json

# Export as CSV using format parameter
curl -O http://localhost:3000/api/export/csv

# Invalid format returns 400 error
curl http://localhost:3000/api/export/xml
# Response: {"error": "Invalid format", "message": "Supported formats: json, csv"}
```

## Data Structure

### JSON Export Format

The JSON export includes metadata and formatted game data:

```json
{
  "exportMetadata": {
    "exportDate": "2025-11-27T10:30:00.000Z",
    "dataType": "aviator_game_data",
    "recordCount": 150,
    "version": "1.0"
  },
  "data": [
    {
      "id": 1,
      "multiplier": 2.35,
      "timestamp": "2025-11-27T10:15:00.000Z",
      "betPlaced": true,
      "betAmount": 100,
      "targetMultiplier": 2.0,
      "actualMultiplier": 2.35,
      "won": true,
      "profit": 100,
      "gameDuration": 4500
    },
    {
      "id": 2,
      "multiplier": 1.15,
      "timestamp": "2025-11-27T10:16:00.000Z",
      "betPlaced": false,
      "betAmount": 0,
      "targetMultiplier": 0,
      "actualMultiplier": 1.15,
      "won": false,
      "profit": 0,
      "gameDuration": 2100
    }
  ]
}
```

### CSV Export Format

The CSV export includes all fields as columns with proper escaping:

```csv
id,multiplier,timestamp,betPlaced,betAmount,targetMultiplier,actualMultiplier,won,profit,gameDuration
1,2.35,2025-11-27T10:15:00.000Z,true,100,2,2.35,true,100,4500
2,1.15,2025-11-27T10:16:00.000Z,false,0,0,1.15,false,0,2100
```

## Filter Combinations

You can combine multiple filter parameters for precise data export:

```bash
# Export winning bets from last week with high multipliers
curl -O "http://localhost:3000/api/export/csv?fromDate=2025-11-20&wonOnly=true&minMultiplier=3.0"

# Export all games from a specific date range, limit to 50 results
curl -O "http://localhost:3000/api/export/json?fromDate=2025-11-01&toDate=2025-11-27&limit=50"

# Export only games with bets placed in medium multiplier range
curl -O "http://localhost:3000/api/export/csv?betPlacedOnly=true&minMultiplier=2.0&maxMultiplier=4.0"
```

## Error Responses

All export endpoints return JSON error responses in case of failures:

### Service Unavailable (503)
```json
{
  "error": "Stats tracker not initialized",
  "message": "The bot is starting up, please try again in a moment"
}
```

### Bad Request (400)
```json
{
  "error": "Invalid format",
  "message": "Supported formats: json, csv"
}
```

### Internal Server Error (500)
```json
{
  "error": "Export failed",
  "message": "Detailed error message here"
}
```

## Implementation Details

### File Generation
- Export files are generated on-demand when endpoint is called
- Files are saved to `/code/exports/` directory
- Filenames include timestamp to prevent collisions
- Old export files are retained for reference

### HTTP Headers
All successful export responses include proper headers for browser downloads:

- **Content-Disposition**: `attachment; filename="aviator_data_YYYY-MM-DDTHH-mm-ss.{format}"`
  - Forces browser to download file instead of displaying it
  - Provides user-friendly filename with timestamp

- **Content-Type**:
  - JSON: `application/json`
  - CSV: `text/csv`

### Data Filtering
Filters are applied by the StatsTracker's `getGameHistory()` method before export:

1. Date range filtering (fromDate/toDate)
2. Bet status filtering (betPlacedOnly/wonOnly)
3. Multiplier range filtering (minMultiplier/maxMultiplier)
4. Result limiting (limit parameter)

All filters can be combined for complex queries.

## Integration with Web Interface

The web interface (`/code/public/index.html` and `/code/public/script.js`) includes export buttons that call these endpoints:

```javascript
// Export as JSON
function exportJSON() {
    const url = buildExportUrl('/api/export/json');
    window.open(url, '_blank');
}

// Export as CSV
function exportCSV() {
    const url = buildExportUrl('/api/export/csv');
    window.open(url, '_blank');
}
```

The `buildExportUrl()` function applies current filter settings from the UI to the export request.

## Testing

Use the test server to verify export functionality:

```bash
# Start test server with mock data
node test-server.js

# Test JSON export
curl -O http://localhost:3000/api/export/json

# Test CSV export
curl -O http://localhost:3000/api/export/csv

# Verify files were created
ls -lh exports/
```

## See Also

- [API Server Usage Guide](/code/API_SERVER_USAGE.md) - Complete API documentation
- [Data Exporter Utility](/code/util/dataExporter.js) - Underlying export implementation
- [Stats Tracker](/code/game/statsTracker.js) - Data storage and filtering logic
