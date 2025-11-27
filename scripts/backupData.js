#!/usr/bin/env node

/**
 * Data Backup Script for Aviator Bot
 *
 * Creates timestamped backups of game data from database or existing exports
 * Compresses backups and stores them in a dedicated backup directory
 *
 * Usage:
 *   node scripts/backupData.js [--source database|memory] [--compress] [--quiet]
 *
 * Options:
 *   --source [database|memory]  Data source (auto-detected if not specified)
 *   --compress                  Compress backup with gzip (not implemented, requires zlib)
 *   --format [json|csv|both]    Backup format (default: json)
 *   --output [directory]        Backup directory (default: backups/)
 *   --quiet                     Suppress informational messages
 *   --help, -h                  Show help message
 */

const fs = require('fs').promises;
const path = require('path');

// Parse command line arguments
function parseArguments() {
    const args = process.argv.slice(2);
    const options = {
        source: null,
        compress: false,
        format: 'json',
        output: null,
        quiet: false,
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const nextArg = args[i + 1];

        switch (arg) {
            case '--source':
                options.source = nextArg;
                i++;
                break;
            case '--compress':
                options.compress = true;
                break;
            case '--format':
                options.format = nextArg;
                i++;
                break;
            case '--output':
                options.output = nextArg;
                i++;
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
Aviator Data Backup Tool
========================

Create timestamped backups of aviator game data.

USAGE:
  node scripts/backupData.js [OPTIONS]

OPTIONS:
  --source [database|memory]  Data source (auto-detected if not specified)
  --format [json|csv|both]    Backup format (default: json)
  --output [directory]        Backup directory (default: backups/)
  --compress                  Compress backup (requires manual implementation)
  --quiet                     Suppress informational messages
  --help, -h                  Show this help message

EXAMPLES:
  # Create JSON backup from database
  node scripts/backupData.js --source database

  # Create both JSON and CSV backups
  node scripts/backupData.js --format both

  # Backup to custom directory
  node scripts/backupData.js --output /path/to/backups

  # Quiet mode
  node scripts/backupData.js --quiet
`);
}

// Format bytes to human readable
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Auto-detect data source
async function detectDataSource(options, log) {
    if (options.source) {
        return options.source;
    }

    log('Auto-detecting data source...');

    // Try database first
    try {
        const database = require('../database/database');
        if (database.isConnectedToDatabase()) {
            log('Using database as data source');
            return 'database';
        }
    } catch (error) {
        // Database not available
    }

    // Fall back to memory
    log('Using memory/exports as data source');
    return 'memory';
}

// Fetch data from database
async function fetchFromDatabase(log) {
    log('Connecting to database...');

    try {
        const database = require('../database/database');

        if (!database.isConnectedToDatabase()) {
            await database.connect();
            await database.initializeDatabase();
        }

        log('Fetching all game data from database...');

        const data = await database.getGameHistory({
            limit: 100000, // Large limit to get all data
            orderBy: 'timestamp',
            orderDir: 'DESC'
        });

        log(`Fetched ${data.length} records from database`);
        return data;
    } catch (error) {
        throw new Error(`Database fetch failed: ${error.message}`);
    }
}

// Fetch data from exports directory
async function fetchFromMemory(log) {
    log('Loading data from exports directory...');

    try {
        const exportsDir = path.join(__dirname, '..', 'exports');
        const files = await fs.readdir(exportsDir).catch(() => []);

        if (files.length === 0) {
            throw new Error('No export files found in exports directory');
        }

        // Find most recent JSON export file
        const jsonFiles = files
            .filter(f => f.endsWith('.json') && !f.includes('backup'))
            .sort()
            .reverse();

        if (jsonFiles.length === 0) {
            throw new Error('No JSON export files found');
        }

        const latestFile = path.join(exportsDir, jsonFiles[0]);
        log(`Loading from: ${latestFile}`);

        const content = await fs.readFile(latestFile, 'utf8');
        const parsed = JSON.parse(content);

        // Extract data array
        const data = parsed.data || parsed;
        log(`Loaded ${Array.isArray(data) ? data.length : 1} records`);

        return Array.isArray(data) ? data : [data];
    } catch (error) {
        throw new Error(`Memory fetch failed: ${error.message}`);
    }
}

// Create backup metadata
function createBackupMetadata(data, source) {
    return {
        backupDate: new Date().toISOString(),
        dataType: 'aviator_game_data',
        source: source,
        recordCount: data.length,
        version: '1.0',
        dateRange: {
            from: data.length > 0 ? data[data.length - 1].timestamp : null,
            to: data.length > 0 ? data[0].timestamp : null
        }
    };
}

// Format data as JSON
function formatJSON(data, metadata) {
    return JSON.stringify({
        backupMetadata: metadata,
        data: data
    }, null, 2);
}

// Format data as CSV
function formatCSV(data) {
    if (data.length === 0) return '';

    const columns = Object.keys(data[0]);
    const lines = [];

    // Add header
    lines.push(columns.map(col => escapeCsvValue(col)).join(','));

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

// Main backup function
async function backupData() {
    const options = parseArguments();

    if (options.help) {
        showHelp();
        process.exit(0);
    }

    const log = (message) => {
        if (!options.quiet) {
            console.log(message);
        }
    };

    try {
        // Validate format
        if (!['json', 'csv', 'both'].includes(options.format)) {
            throw new Error('Format must be "json", "csv", or "both"');
        }

        if (options.compress) {
            log('Warning: Compression not implemented. Backups will be uncompressed.');
        }

        // Determine backup directory
        const backupDir = options.output
            ? path.resolve(options.output)
            : path.join(__dirname, '..', 'backups');

        // Create backup directory if it doesn't exist
        await fs.mkdir(backupDir, { recursive: true });
        log(`Backup directory: ${backupDir}`);

        // Detect data source
        const source = await detectDataSource(options, log);

        // Fetch data
        let data;
        if (source === 'database') {
            data = await fetchFromDatabase(log);
        } else {
            data = await fetchFromMemory(log);
        }

        if (data.length === 0) {
            log('Warning: No data to backup');
            process.exit(0);
        }

        // Create backup metadata
        const metadata = createBackupMetadata(data, source);

        // Generate timestamp for filenames
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const backupFiles = [];

        // Create JSON backup
        if (options.format === 'json' || options.format === 'both') {
            log('\nCreating JSON backup...');
            const jsonContent = formatJSON(data, metadata);
            const jsonFilename = `backup_${timestamp}.json`;
            const jsonPath = path.join(backupDir, jsonFilename);

            await fs.writeFile(jsonPath, jsonContent, 'utf8');
            const jsonStats = await fs.stat(jsonPath);

            backupFiles.push({
                name: jsonFilename,
                path: jsonPath,
                size: jsonStats.size,
                format: 'JSON'
            });

            log(`✓ JSON backup created: ${jsonFilename} (${formatBytes(jsonStats.size)})`);
        }

        // Create CSV backup
        if (options.format === 'csv' || options.format === 'both') {
            log('\nCreating CSV backup...');
            const csvContent = formatCSV(data);
            const csvFilename = `backup_${timestamp}.csv`;
            const csvPath = path.join(backupDir, csvFilename);

            await fs.writeFile(csvPath, csvContent, 'utf8');
            const csvStats = await fs.stat(csvPath);

            backupFiles.push({
                name: csvFilename,
                path: csvPath,
                size: csvStats.size,
                format: 'CSV'
            });

            log(`✓ CSV backup created: ${csvFilename} (${formatBytes(csvStats.size)})`);
        }

        // Display summary
        log('\n=== Backup Complete ===');
        log(`Records backed up: ${data.length}`);
        log(`Data source: ${source}`);
        log(`Backup location: ${backupDir}`);
        log('\nBackup files:');
        for (const file of backupFiles) {
            log(`  - ${file.name} (${file.format}, ${formatBytes(file.size)})`);
        }

        process.exit(0);
    } catch (error) {
        console.error(`Backup failed: ${error.message}`);
        if (!options.quiet) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Run backup
if (require.main === module) {
    backupData();
}

module.exports = { backupData };
