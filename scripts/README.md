# Data Export Scripts

This directory contains standalone command-line tools for exporting and managing aviator game data.

## exportData.js

Standalone command-line tool for exporting aviator game data in JSON or CSV format.

### Features

- **Multiple formats**: Export to JSON or CSV
- **Flexible data sources**: Read from database or memory (exported files)
- **Advanced filtering**: Filter by date range, multiplier, bet status, win status
- **Stdout piping**: Pipe output to other tools (jq, grep, etc.)
- **Progress indicators**: Show progress for large exports
- **Auto-detection**: Automatically detect best available data source

### Installation

No installation required. The script uses built-in Node.js modules.

### Usage

```bash
# Basic usage - export all data to JSON file
node scripts/exportData.js --format json --output data.json

# Export with filters
node scripts/exportData.js --format json --from 2024-01-01 --to 2024-12-31 --output january.json

# Export to CSV with limit
node scripts/exportData.js --format csv --limit 100 --output recent.csv

# Pipe to stdout for processing
node scripts/exportData.js --format json --limit 10 | jq '.data[0]'

# Export only winning bets
node scripts/exportData.js --format csv --won-only --bet-only --output wins.csv

# Export high multipliers with progress indicator
node scripts/exportData.js --format json --min-multiplier 5.0 --progress --output high-multipliers.json

# Export specific CSV columns
node scripts/exportData.js --format csv --columns id,multiplier,timestamp --output simple.csv

# Use specific data source
node scripts/exportData.js --format json --source database --output db-export.json
```

### Command-Line Arguments

#### Required Options

- `--format [json|csv]` - Output format

#### Filter Options

- `--from [date]` - Start date (YYYY-MM-DD or ISO format)
- `--to [date]` - End date (YYYY-MM-DD or ISO format)
- `--limit [number]` - Maximum number of records
- `--min-multiplier [number]` - Minimum multiplier value
- `--max-multiplier [number]` - Maximum multiplier value
- `--bet-only` - Only games where bets were placed
- `--won-only` - Only winning bets

#### Data Source Options

- `--source [memory|database]` - Data source (auto-detected if not specified)

#### Output Options

- `--output [filepath]` - Output file path (default: stdout)
- `--pretty` - Pretty print JSON (JSON format only)
- `--no-headers` - Omit headers (CSV format only)
- `--columns [col1,col2,...]` - Specific columns (CSV format only)

#### Other Options

- `--progress` - Show progress indicators
- `--quiet` - Suppress informational messages
- `--help, -h` - Show help message

### Data Sources

The script supports two data sources:

1. **Database** (default if available)
   - Reads directly from MySQL database
   - Requires database connection to be configured
   - Supports all filter options
   - Efficient for large datasets

2. **Memory** (fallback)
   - Reads from most recent export file in `/exports` directory
   - Used when database is unavailable
   - Applies filters client-side after loading data
   - Good for offline analysis

### Output Format

#### JSON Format

```json
{
  "exportMetadata": {
    "exportDate": "2024-01-15T10:30:00.000Z",
    "dataType": "aviator_game_data",
    "recordCount": 100,
    "version": "1.0",
    "filters": {
      "from": "2024-01-01",
      "to": "2024-12-31",
      "limit": 100,
      "betOnly": false,
      "wonOnly": false,
      "minMultiplier": null,
      "maxMultiplier": null
    }
  },
  "data": [
    {
      "id": 1,
      "multiplier": 2.45,
      "timestamp": "2024-01-15T10:25:00.000Z",
      "betPlaced": true,
      "betAmount": 10,
      "targetMultiplier": 2.0,
      "actualMultiplier": 2.45,
      "won": true,
      "profit": 14.5,
      "gameDuration": 5000
    }
  ]
}
```

#### CSV Format

```csv
id,multiplier,timestamp,betPlaced,betAmount,targetMultiplier,actualMultiplier,won,profit,gameDuration
1,2.45,2024-01-15T10:25:00.000Z,true,10,2.0,2.45,true,14.5,5000
2,1.89,2024-01-15T10:26:00.000Z,true,10,2.0,1.89,false,-10,3800
```

### Exit Codes

- `0` - Success
- `1` - Error (invalid arguments, data source unavailable, etc.)

### Examples

#### Export date range with pretty JSON

```bash
node scripts/exportData.js \
  --format json \
  --from 2024-01-01 \
  --to 2024-01-31 \
  --pretty \
  --output january-2024.json
```

#### Export top 50 highest multipliers to CSV

```bash
node scripts/exportData.js \
  --format csv \
  --min-multiplier 5.0 \
  --limit 50 \
  --columns multiplier,timestamp \
  --output high-multipliers.csv
```

#### Pipe to jq for analysis

```bash
# Get average multiplier
node scripts/exportData.js --format json --limit 1000 | \
  jq '[.data[].multiplier] | add / length'

# Count winning vs losing bets
node scripts/exportData.js --format json --bet-only | \
  jq '[.data[] | select(.won == true)] | length'
```

#### Export with progress indicator

```bash
node scripts/exportData.js \
  --format csv \
  --progress \
  --output all-data.csv
```

### Troubleshooting

**Error: No data found matching filters**
- Check your filter criteria
- Verify data exists in your selected date range
- Try removing filters to see all available data

**Error: Database fetch failed**
- Ensure database is configured and running
- Check database connection settings in config.js
- Try using `--source memory` to use exported files instead

**Error: Memory fetch failed: No export files found**
- No export files exist in the /exports directory
- Use database source or run the main application to generate data first

**Error: format must be "json" or "csv"**
- The --format argument is required
- Must be exactly "json" or "csv" (case-insensitive)

### Performance Tips

- Use `--limit` to restrict large exports
- Use `--source database` with filters for efficient queries
- Use `--quiet` when piping to reduce stderr noise
- Apply filters at export time rather than filtering output
- Use CSV format for smaller file sizes

### Integration with Other Tools

The export script is designed to work well with standard Unix tools:

```bash
# Count records
node scripts/exportData.js --format csv | wc -l

# Search for specific values
node scripts/exportData.js --format csv | grep "10.0"

# Sort by multiplier
node scripts/exportData.js --format csv --no-headers | sort -t',' -k2 -n

# Combine with jq for JSON processing
node scripts/exportData.js --format json | jq '.data | map(select(.multiplier > 5))'
```

## Future Scripts

- `importData.js` - Import previously exported data back into database
- `backupData.js` - Create timestamped backups of all data
- `cleanupData.js` - Archive or delete old data based on age

## License

Part of the Aviator Bot project.
