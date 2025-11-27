# DataExporter Module

Utility module for exporting aviator game data in multiple formats (JSON, CSV, Database).

## Features

- ✅ Export to JSON with pretty printing
- ✅ Export to CSV with proper escaping
- ✅ Export to database (batch and individual)
- ✅ Automatic timestamp-based file naming
- ✅ Data formatting and validation
- ✅ Error handling and logging
- ✅ File management utilities

## Installation

The module is already integrated. Simply require it:

```javascript
const dataExporter = require('./util/dataExporter');
```

## Usage Examples

### Export to JSON

```javascript
const gameData = [
    {
        multiplier: 2.5,
        timestamp: new Date().toISOString(),
        betPlaced: true,
        betAmount: 100,
        won: true,
        profit: 100
    }
];

// Basic export
const filePath = await dataExporter.exportToJSON(gameData);
console.log('Exported to:', filePath);

// Custom options
const customPath = await dataExporter.exportToJSON(gameData, {
    filename: 'my_custom_name.json',
    pretty: true,
    includeMetadata: true
});
```

### Export to CSV

```javascript
// Basic export
const csvPath = await dataExporter.exportToCSV(gameData);

// Custom columns and options
const customCsvPath = await dataExporter.exportToCSV(gameData, {
    filename: 'games.csv',
    columns: ['timestamp', 'multiplier', 'betAmount', 'profit'],
    includeHeaders: true
});
```

### Export to Database

```javascript
const database = require('./database/database');

// Batch export (faster)
const result = await dataExporter.exportToDatabase(gameData, database, {
    batch: true
});

console.log(`Success: ${result.successCount}/${result.totalRecords}`);
```

### Format Game Data

```javascript
// Format and validate data structure
const formatted = dataExporter.formatGameData(gameData);

// Returns:
// {
//   exportMetadata: { exportDate, dataType, recordCount, version },
//   data: [ { id, multiplier, timestamp, betPlaced, ... } ]
// }
```

### File Management

```javascript
// List all exported files
const files = await dataExporter.getExportedFiles();
console.log('Exported files:', files);

// List only JSON files
const jsonFiles = await dataExporter.getExportedFiles({ extension: 'json' });

// Clean up old exports (older than 30 days)
const deletedCount = await dataExporter.cleanupOldExports(30);
console.log(`Deleted ${deletedCount} old files`);
```

## Data Structure

Expected game data format:

```javascript
{
    multiplier: Number,         // Game crash multiplier
    timestamp: String (ISO),    // When the game occurred
    betPlaced: Boolean,         // Whether a bet was placed
    betAmount: Number,          // Amount bet (if any)
    targetMultiplier: Number,   // Target cashout multiplier
    actualMultiplier: Number,   // Actual multiplier achieved
    won: Boolean,               // Whether the bet won
    profit: Number,             // Profit/loss amount
    gameDuration: Number        // Game duration in ms (optional)
}
```

## File Output

Exported files are saved to: `/code/exports/`

Filename format: `aviator_data_YYYY-MM-DDTHH-MM-SS.{json|csv}`

Example: `aviator_data_2025-11-27T02-30-15.json`

## Error Handling

All methods include comprehensive error handling:
- Errors are logged via winston logger
- Methods throw descriptive errors on failure
- Export directory is automatically created if missing
- Database export returns detailed success/failure results

## Methods

### Core Export Methods
- `exportToJSON(data, options)` - Export to JSON file
- `exportToCSV(data, options)` - Export to CSV file
- `exportToDatabase(data, database, options)` - Export to database

### Utility Methods
- `formatGameData(data)` - Format and validate data
- `generateTimestampedFilename(prefix, extension)` - Generate filename
- `getExportedFiles(options)` - List exported files
- `cleanupOldExports(daysOld)` - Delete old exports

## Integration with StatsTracker

Future integration (Step 1.2):

```javascript
// In statsTracker.js
const dataExporter = require('../util/dataExporter');

class StatsTracker {
    async exportData(format = 'json') {
        const data = this.getGameHistory();

        if (format === 'json') {
            return await dataExporter.exportToJSON(data);
        } else if (format === 'csv') {
            return await dataExporter.exportToCSV(data);
        }
    }
}
```

## Testing

A test script is provided at `/code/test_exporter.js`:

```bash
node test_exporter.js
```

This will test all major functions and create sample exports.
