#!/usr/bin/env node

/**
 * Standalone Data Export Script for Aviator Game Data
 *
 * Command-line tool for exporting aviator game data in JSON or CSV format
 * Supports database and in-memory data sources with flexible filtering
 *
 * Usage:
 *   node scripts/exportData.js --format json --output data.json --from 2024-01-01 --to 2024-12-31
 *   node scripts/exportData.js --format csv --limit 1000 > output.csv
 *   node scripts/exportData.js --format json --source database | jq '.data[0]'
 *
 * Arguments:
 *   --format [json|csv]       Output format (required)
 *   --output [filepath]       Output file path (optional, defaults to stdout)
 *   --from [date]             Start date filter (ISO format: YYYY-MM-DD)
 *   --to [date]               End date filter (ISO format: YYYY-MM-DD)
 *   --limit [number]          Maximum number of records to export
 *   --source [memory|database] Data source (default: database if available, otherwise memory)
 *   --bet-only                Only export games where bets were placed
 *   --won-only                Only export winning bets
 *   --min-multiplier [number] Minimum multiplier filter
 *   --max-multiplier [number] Maximum multiplier filter
 *   --pretty                  Pretty print JSON output
 *   --no-headers              Omit CSV headers
 *   --columns [col1,col2]     Specific columns to export in CSV
 *   --progress                Show progress indicators
 *   --quiet                   Suppress informational messages
 *   --help                    Show help message
 */

const fs = require('fs').promises;
const path = require('path');

// Parse command line arguments
function parseArguments() {
    const args = process.argv.slice(2);
    const options = {
        format: null,
        output: null,
        from: null,
        to: null,
        limit: null,
        source: null,
        betOnly: false,
        wonOnly: false,
        minMultiplier: null,
        maxMultiplier: null,
        pretty: false,
        noHeaders: false,
        columns: null,
        progress: false,
        quiet: false,
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const nextArg = args[i + 1];

        switch (arg) {
            case '--format':
                options.format = nextArg;
                i++;
                break;
            case '--output':
                options.output = nextArg;
                i++;
                break;
            case '--from':
                options.from = nextArg;
                i++;
                break;
            case '--to':
                options.to = nextArg;
                i++;
                break;
            case '--limit':
                options.limit = parseInt(nextArg, 10);
                i++;
                break;
            case '--source':
                options.source = nextArg;
                i++;
                break;
            case '--bet-only':
                options.betOnly = true;
                break;
            case '--won-only':
                options.wonOnly = true;
                break;
            case '--min-multiplier':
                options.minMultiplier = parseFloat(nextArg);
                i++;
                break;
            case '--max-multiplier':
                options.maxMultiplier = parseFloat(nextArg);
                i++;
                break;
            case '--pretty':
                options.pretty = true;
                break;
            case '--no-headers':
                options.noHeaders = true;
                break;
            case '--columns':
                options.columns = nextArg.split(',').map(col => col.trim());
                i++;
                break;
            case '--progress':
                options.progress = true;
                break;
            case '--quiet':
                options.quiet = true;
                break;
            case '--help':
            case '-h':
                options.help = true;
                break;
            default:
                if (arg.startsWith('--')) {
                    console.error(`Unknown option: ${arg}`);
                    process.exit(1);
                }
        }
    }

    return options;
}

// Show help message
function showHelp() {
    console.log(`
Aviator Data Export Tool
========================

Export aviator game data in JSON or CSV format from database or memory.

USAGE:
  node scripts/exportData.js [OPTIONS]

REQUIRED OPTIONS:
  --format [json|csv]           Output format

FILTER OPTIONS:
  --from [date]                 Start date (YYYY-MM-DD or ISO format)
  --to [date]                   End date (YYYY-MM-DD or ISO format)
  --limit [number]              Maximum number of records
  --min-multiplier [number]     Minimum multiplier value
  --max-multiplier [number]     Maximum multiplier value
  --bet-only                    Only games where bets were placed
  --won-only                    Only winning bets

DATA SOURCE OPTIONS:
  --source [memory|database]    Data source (auto-detected if not specified)

OUTPUT OPTIONS:
  --output [filepath]           Output file path (default: stdout)
  --pretty                      Pretty print JSON (JSON format only)
  --no-headers                  Omit headers (CSV format only)
  --columns [col1,col2,...]     Specific columns (CSV format only)

OTHER OPTIONS:
  --progress                    Show progress indicators
  --quiet                       Suppress informational messages
  --help, -h                    Show this help message

EXAMPLES:
  # Export all data to JSON file
  node scripts/exportData.js --format json --output data.json

  # Export last 100 games to CSV with progress
  node scripts/exportData.js --format csv --limit 100 --progress --output recent.csv

  # Export date range from database to pretty JSON
  node scripts/exportData.js --format json --from 2024-01-01 --to 2024-12-31 --pretty

  # Pipe to stdout for processing with other tools
  node scripts/exportData.js --format json --limit 10 | jq '.data[0]'

  # Export only winning bets to CSV
  node scripts/exportData.js --format csv --won-only --bet-only --output wins.csv

  # Export specific columns from games with high multipliers
  node scripts/exportData.js --format csv --min-multiplier 5.0 --columns id,multiplier,timestamp
`);
}

// Progress indicator class
class ProgressIndicator {
    constructor(enabled = true, quiet = false) {
        this.enabled = enabled && !quiet;
        this.quiet = quiet;
        this.startTime = null;
        this.lastUpdate = 0;
    }

    start(message) {
        if (!this.enabled) return;
        this.startTime = Date.now();
        process.stderr.write(`${message}...\n`);
    }

    update(current, total) {
        if (!this.enabled) return;

        const now = Date.now();
        // Throttle updates to every 100ms
        if (now - this.lastUpdate < 100 && current < total) return;

        this.lastUpdate = now;
        const percentage = total > 0 ? Math.floor((current / total) * 100) : 0;
        const bar = this.createProgressBar(percentage);
        process.stderr.write(`\r${bar} ${current}/${total} (${percentage}%)`);

        if (current >= total) {
            process.stderr.write('\n');
        }
    }

    createProgressBar(percentage, width = 30) {
        const filled = Math.floor((percentage / 100) * width);
        const empty = width - filled;
        return '[' + '='.repeat(filled) + ' '.repeat(empty) + ']';
    }

    complete(message) {
        if (!this.enabled) return;
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
        process.stderr.write(`${message} (${elapsed}s)\n`);
    }

    log(message) {
        if (this.quiet) return;
        process.stderr.write(message + '\n');
    }

    error(message) {
        process.stderr.write(`ERROR: ${message}\n`);
    }
}

// Format data for JSON export
function formatJSONOutput(data, options) {
    const output = {
        exportMetadata: {
            exportDate: new Date().toISOString(),
            dataType: 'aviator_game_data',
            recordCount: data.length,
            version: '1.0',
            filters: {
                from: options.from || null,
                to: options.to || null,
                limit: options.limit || null,
                betOnly: options.betOnly,
                wonOnly: options.wonOnly,
                minMultiplier: options.minMultiplier || null,
                maxMultiplier: options.maxMultiplier || null
            }
        },
        data: data
    };

    return options.pretty
        ? JSON.stringify(output, null, 2)
        : JSON.stringify(output);
}

// Format data for CSV export
function formatCSVOutput(data, options) {
    if (data.length === 0) {
        return '';
    }

    const columns = options.columns || Object.keys(data[0]);
    const lines = [];

    // Add headers unless disabled
    if (!options.noHeaders) {
        lines.push(columns.map(col => escapeCsvValue(col)).join(','));
    }

    // Add data rows
    for (const record of data) {
        const row = columns.map(col => {
            const value = record[col] !== undefined ? record[col] : '';
            return escapeCsvValue(value);
        });
        lines.push(row.join(','));
    }

    return lines.join('\n');
}

// Escape CSV values
function escapeCsvValue(value) {
    if (value === null || value === undefined) {
        return '';
    }

    const stringValue = String(value);

    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
}

// Fetch data from database
async function fetchFromDatabase(database, options, progress) {
    progress.start('Connecting to database');

    try {
        // Check if database is connected
        if (!database.isConnectedToDatabase()) {
            progress.log('Database not connected, attempting to connect...');
            await database.connect();
            await database.initializeDatabase();
        }

        progress.log('Database connected successfully');
        progress.start('Fetching data from database');

        const queryOptions = {
            fromDate: options.from ? new Date(options.from) : null,
            toDate: options.to ? new Date(options.to) : null,
            minMultiplier: options.minMultiplier,
            maxMultiplier: options.maxMultiplier,
            limit: options.limit || 10000, // Default limit for database queries
            orderBy: 'timestamp',
            orderDir: 'DESC'
        };

        // Remove null values
        Object.keys(queryOptions).forEach(key => {
            if (queryOptions[key] === null || queryOptions[key] === undefined) {
                delete queryOptions[key];
            }
        });

        let data;

        // Fetch based on filter type
        if (options.betOnly || options.wonOnly) {
            // Fetch from bet_history table
            const betOptions = {
                ...queryOptions,
                wonOnly: options.wonOnly ? true : undefined
            };
            data = await database.getBetHistory(betOptions);
        } else {
            // Fetch from game_rounds table
            data = await database.getGameHistory(queryOptions);
        }

        progress.complete(`Fetched ${data.length} records from database`);
        return data;
    } catch (error) {
        throw new Error(`Database fetch failed: ${error.message}`);
    }
}

// Fetch data from memory (statsTracker data files)
async function fetchFromMemory(options, progress) {
    progress.start('Loading data from memory/files');

    try {
        // Try to load from exports directory
        const exportDir = path.join(__dirname, '..', 'exports');
        const files = await fs.readdir(exportDir).catch(() => []);

        if (files.length === 0) {
            throw new Error('No export files found in exports directory');
        }

        // Find most recent JSON export file
        const jsonFiles = files
            .filter(f => f.endsWith('.json'))
            .sort()
            .reverse();

        if (jsonFiles.length === 0) {
            throw new Error('No JSON export files found');
        }

        const latestFile = path.join(exportDir, jsonFiles[0]);
        progress.log(`Loading from: ${latestFile}`);

        const content = await fs.readFile(latestFile, 'utf8');
        const parsed = JSON.parse(content);

        // Extract data array from export format
        let data = parsed.data || parsed;
        if (!Array.isArray(data)) {
            data = [data];
        }

        // Apply filters
        data = applyFilters(data, options);

        progress.complete(`Loaded ${data.length} records from memory`);
        return data;
    } catch (error) {
        throw new Error(`Memory fetch failed: ${error.message}`);
    }
}

// Apply filters to data array
function applyFilters(data, options) {
    let filtered = [...data];

    // Date range filters
    if (options.from) {
        const fromTime = new Date(options.from).getTime();
        filtered = filtered.filter(record => {
            const recordTime = new Date(record.timestamp).getTime();
            return recordTime >= fromTime;
        });
    }

    if (options.to) {
        const toTime = new Date(options.to).getTime();
        filtered = filtered.filter(record => {
            const recordTime = new Date(record.timestamp).getTime();
            return recordTime <= toTime;
        });
    }

    // Multiplier filters
    if (options.minMultiplier !== null) {
        filtered = filtered.filter(record => {
            const multiplier = record.multiplier || record.crashMultiplier || 0;
            return multiplier >= options.minMultiplier;
        });
    }

    if (options.maxMultiplier !== null) {
        filtered = filtered.filter(record => {
            const multiplier = record.multiplier || record.crashMultiplier || 0;
            return multiplier <= options.maxMultiplier;
        });
    }

    // Bet filters
    if (options.betOnly) {
        filtered = filtered.filter(record => record.betPlaced === true || record.bet_amount > 0);
    }

    if (options.wonOnly) {
        filtered = filtered.filter(record => record.won === true);
    }

    // Limit
    if (options.limit && options.limit > 0) {
        filtered = filtered.slice(-options.limit);
    }

    return filtered;
}

// Auto-detect best data source
async function detectDataSource(options, progress) {
    if (options.source) {
        return options.source;
    }

    progress.log('Auto-detecting data source...');

    // Try database first
    try {
        const database = require('../database/database');
        if (database.isConnectedToDatabase()) {
            progress.log('Using database as data source');
            return 'database';
        }
    } catch (error) {
        // Database module not available or not connected
    }

    // Fall back to memory
    progress.log('Using memory/files as data source');
    return 'memory';
}

// Main export function
async function exportData() {
    const options = parseArguments();

    // Show help if requested or no format specified
    if (options.help || !options.format) {
        showHelp();
        process.exit(options.help ? 0 : 1);
    }

    // Validate format
    if (!['json', 'csv'].includes(options.format.toLowerCase())) {
        console.error('Error: format must be "json" or "csv"');
        process.exit(1);
    }

    const progress = new ProgressIndicator(options.progress, options.quiet);

    try {
        // Detect or validate data source
        const dataSource = await detectDataSource(options, progress);

        if (!['memory', 'database'].includes(dataSource)) {
            throw new Error(`Invalid data source: ${dataSource}. Must be "memory" or "database"`);
        }

        // Fetch data based on source
        let data;
        if (dataSource === 'database') {
            const database = require('../database/database');
            data = await fetchFromDatabase(database, options, progress);
        } else {
            data = await fetchFromMemory(options, progress);
        }

        if (data.length === 0) {
            progress.log('Warning: No data found matching filters');
        }

        // Show progress for formatting
        if (options.progress && data.length > 1000) {
            progress.start('Formatting data');
        }

        // Format data based on output format
        let output;
        if (options.format.toLowerCase() === 'json') {
            output = formatJSONOutput(data, options);
        } else {
            output = formatCSVOutput(data, options);
        }

        if (options.progress && data.length > 1000) {
            progress.complete('Data formatted');
        }

        // Write output
        if (options.output) {
            // Write to file
            progress.start('Writing to file');
            await fs.writeFile(options.output, output, 'utf8');
            progress.complete(`Data exported to: ${options.output}`);
            progress.log(`Total records: ${data.length}`);
        } else {
            // Write to stdout (suppress progress messages when piping)
            if (!options.quiet && !options.progress) {
                process.stderr.write(`Exporting ${data.length} records to stdout...\n`);
            }
            process.stdout.write(output);
            if (options.format.toLowerCase() === 'csv') {
                process.stdout.write('\n');
            }
        }

        process.exit(0);
    } catch (error) {
        progress.error(error.message);
        if (!options.quiet) {
            progress.error('Stack trace:');
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Run the export
if (require.main === module) {
    exportData();
}

module.exports = { exportData, parseArguments, formatJSONOutput, formatCSVOutput };
