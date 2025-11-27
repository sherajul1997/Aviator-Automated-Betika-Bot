#!/usr/bin/env node

/**
 * Data Import/Restore Utility for Aviator Game Data
 *
 * Imports and restores aviator game data from previously exported JSON/CSV files
 * Supports merging with existing database records and validation to prevent duplicates
 *
 * Usage:
 *   node scripts/importData.js --file data.json
 *   node scripts/importData.js --file data.csv --type game_rounds --dry-run
 *   node scripts/importData.js --file bets.json --merge --skip-duplicates
 *
 * Arguments:
 *   --file [filepath]         Path to import file (required)
 *   --type [game_rounds|bet_history|auto] Import target table (default: auto-detect)
 *   --source [database|memory] Import destination (default: database)
 *   --merge                   Merge with existing records instead of appending
 *   --skip-duplicates         Skip duplicate records based on timestamp and key fields
 *   --dry-run                 Preview import without executing
 *   --validate-only           Only validate data without importing
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
        file: null,
        type: 'auto',
        source: 'database',
        merge: false,
        skipDuplicates: false,
        dryRun: false,
        validateOnly: false,
        progress: false,
        quiet: false,
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const nextArg = args[i + 1];

        switch (arg) {
            case '--file':
                options.file = nextArg;
                i++;
                break;
            case '--type':
                options.type = nextArg;
                i++;
                break;
            case '--source':
                options.source = nextArg;
                i++;
                break;
            case '--merge':
                options.merge = true;
                break;
            case '--skip-duplicates':
                options.skipDuplicates = true;
                break;
            case '--dry-run':
                options.dryRun = true;
                break;
            case '--validate-only':
                options.validateOnly = true;
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
Aviator Data Import/Restore Tool
=================================

Import and restore aviator game data from previously exported JSON/CSV files.
Supports validation, duplicate detection, and dry-run preview mode.

USAGE:
  node scripts/importData.js [OPTIONS]

REQUIRED OPTIONS:
  --file [filepath]             Path to import file (JSON or CSV)

DATA TYPE OPTIONS:
  --type [type]                 Target table type:
                                  - game_rounds: Game multiplier data
                                  - bet_history: Betting history data
                                  - auto: Auto-detect from file (default)

DESTINATION OPTIONS:
  --source [database|memory]    Import destination (default: database)

IMPORT MODE OPTIONS:
  --merge                       Merge with existing records (update duplicates)
  --skip-duplicates             Skip duplicate records instead of failing
  --dry-run                     Preview import operations without executing
  --validate-only               Only validate data structure and integrity

OTHER OPTIONS:
  --progress                    Show progress indicators during import
  --quiet                       Suppress informational messages
  --help, -h                    Show this help message

EXAMPLES:
  # Import game rounds from JSON export
  node scripts/importData.js --file exports/data_20240115.json

  # Dry-run to preview import without executing
  node scripts/importData.js --file backup.json --dry-run --progress

  # Import bet history and skip duplicates
  node scripts/importData.js --file bets.csv --type bet_history --skip-duplicates

  # Validate data file without importing
  node scripts/importData.js --file data.json --validate-only

  # Merge with existing database records
  node scripts/importData.js --file archive.json --merge --skip-duplicates

  # Import with progress tracking
  node scripts/importData.js --file large_export.json --progress

DUPLICATE DETECTION:
  Game rounds are considered duplicates if they share:
    - Same timestamp (within 1 second)
    - Same multiplier value

  Bet history records are considered duplicates if they share:
    - Same timestamp (within 1 second)
    - Same bet_amount
    - Same target_multiplier

FILE FORMATS:
  JSON: Supports both wrapped exports (with metadata) and raw arrays
  CSV:  First row must be headers, columns auto-mapped to database fields
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

    warn(message) {
        if (this.quiet) return;
        process.stderr.write(`WARNING: ${message}\n`);
    }
}

// Read and parse import file
async function readImportFile(filepath, progress) {
    progress.start(`Reading file: ${filepath}`);

    try {
        const ext = path.extname(filepath).toLowerCase();
        const content = await fs.readFile(filepath, 'utf8');

        let data;
        if (ext === '.json') {
            data = parseJSONFile(content);
        } else if (ext === '.csv') {
            data = parseCSVFile(content);
        } else {
            throw new Error(`Unsupported file format: ${ext}. Only .json and .csv are supported.`);
        }

        progress.complete(`File read successfully: ${data.length} records found`);
        return data;
    } catch (error) {
        throw new Error(`Failed to read import file: ${error.message}`);
    }
}

// Parse JSON file (handles both wrapped exports and raw arrays)
function parseJSONFile(content) {
    const parsed = JSON.parse(content);

    // Handle wrapped export format with metadata
    if (parsed.data && Array.isArray(parsed.data)) {
        return parsed.data;
    }

    // Handle raw array
    if (Array.isArray(parsed)) {
        return parsed;
    }

    // Handle single object
    if (typeof parsed === 'object' && parsed !== null) {
        return [parsed];
    }

    throw new Error('Invalid JSON format: expected array or object with data property');
}

// Parse CSV file
function parseCSVFile(content) {
    const lines = content.trim().split('\n');

    if (lines.length < 2) {
        throw new Error('CSV file must have at least a header row and one data row');
    }

    // Parse headers
    const headers = parseCSVLine(lines[0]);

    // Parse data rows
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue; // Skip empty lines

        const values = parseCSVLine(lines[i]);
        const record = {};

        for (let j = 0; j < headers.length; j++) {
            const header = headers[j];
            const value = values[j] || '';

            // Convert to appropriate type
            record[header] = convertCSVValue(value);
        }

        data.push(record);
    }

    return data;
}

// Parse a single CSV line (handles quoted values)
function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Escaped quote
                current += '"';
                i++; // Skip next quote
            } else {
                // Toggle quote mode
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // End of value
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    // Add last value
    values.push(current.trim());

    return values;
}

// Convert CSV string value to appropriate type
function convertCSVValue(value) {
    if (value === '' || value === 'null' || value === 'NULL') {
        return null;
    }

    // Boolean
    if (value === 'true' || value === 'TRUE' || value === '1') {
        return true;
    }
    if (value === 'false' || value === 'FALSE' || value === '0') {
        return false;
    }

    // Number
    if (/^-?\d+\.?\d*$/.test(value)) {
        return parseFloat(value);
    }

    // Date (ISO format)
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
        return value; // Keep as string for database compatibility
    }

    return value;
}

// Auto-detect data type from records
function detectDataType(data, progress) {
    progress.log('Auto-detecting data type...');

    if (data.length === 0) {
        throw new Error('Cannot detect type from empty data');
    }

    const firstRecord = data[0];
    const fields = Object.keys(firstRecord);

    // Check for bet_history fields
    const betFields = ['bet_amount', 'target_multiplier', 'actual_multiplier', 'profit_loss', 'won'];
    const hasBetFields = betFields.some(field => fields.includes(field));

    // Check for game_rounds fields
    const gameFields = ['multiplier', 'crashMultiplier'];
    const hasGameFields = gameFields.some(field => fields.includes(field));

    if (hasBetFields) {
        progress.log('Detected type: bet_history');
        return 'bet_history';
    } else if (hasGameFields) {
        progress.log('Detected type: game_rounds');
        return 'game_rounds';
    }

    // Default to game_rounds if has timestamp and numeric value
    if (fields.includes('timestamp')) {
        progress.log('Detected type: game_rounds (default)');
        return 'game_rounds';
    }

    throw new Error('Could not auto-detect data type. Please specify --type manually.');
}

// Validate data structure
function validateData(data, type, progress) {
    progress.start(`Validating ${data.length} records`);

    const errors = [];
    const warnings = [];

    for (let i = 0; i < data.length; i++) {
        const record = data[i];
        const recordNum = i + 1;

        if (type === 'game_rounds') {
            // Validate game_rounds fields
            const multiplier = record.multiplier || record.crashMultiplier;

            if (!multiplier) {
                errors.push(`Record ${recordNum}: Missing multiplier field`);
            } else if (typeof multiplier !== 'number' || multiplier <= 0) {
                errors.push(`Record ${recordNum}: Invalid multiplier value: ${multiplier}`);
            }

            if (!record.timestamp) {
                errors.push(`Record ${recordNum}: Missing timestamp field`);
            } else if (!isValidDate(record.timestamp)) {
                errors.push(`Record ${recordNum}: Invalid timestamp: ${record.timestamp}`);
            }

            // Optional fields warnings
            if (record.game_duration && typeof record.game_duration !== 'number') {
                warnings.push(`Record ${recordNum}: Invalid game_duration type`);
            }

        } else if (type === 'bet_history') {
            // Validate bet_history fields
            const requiredFields = [
                'bet_amount',
                'target_multiplier',
                'actual_multiplier',
                'profit_loss',
                'timestamp'
            ];

            for (const field of requiredFields) {
                if (record[field] === undefined || record[field] === null) {
                    errors.push(`Record ${recordNum}: Missing required field: ${field}`);
                }
            }

            // Type validation
            if (record.bet_amount && (typeof record.bet_amount !== 'number' || record.bet_amount <= 0)) {
                errors.push(`Record ${recordNum}: Invalid bet_amount: ${record.bet_amount}`);
            }

            if (record.target_multiplier && (typeof record.target_multiplier !== 'number' || record.target_multiplier <= 0)) {
                errors.push(`Record ${recordNum}: Invalid target_multiplier: ${record.target_multiplier}`);
            }

            if (record.actual_multiplier && (typeof record.actual_multiplier !== 'number' || record.actual_multiplier <= 0)) {
                errors.push(`Record ${recordNum}: Invalid actual_multiplier: ${record.actual_multiplier}`);
            }

            if (record.won !== undefined && typeof record.won !== 'boolean') {
                warnings.push(`Record ${recordNum}: won field should be boolean`);
            }

            if (!isValidDate(record.timestamp)) {
                errors.push(`Record ${recordNum}: Invalid timestamp: ${record.timestamp}`);
            }
        }
    }

    // Show validation results
    if (warnings.length > 0) {
        progress.warn(`Found ${warnings.length} warnings:`);
        warnings.slice(0, 10).forEach(w => progress.warn(`  - ${w}`));
        if (warnings.length > 10) {
            progress.warn(`  ... and ${warnings.length - 10} more warnings`);
        }
    }

    if (errors.length > 0) {
        progress.error(`Found ${errors.length} validation errors:`);
        errors.slice(0, 10).forEach(e => progress.error(`  - ${e}`));
        if (errors.length > 10) {
            progress.error(`  ... and ${errors.length - 10} more errors`);
        }
        throw new Error(`Validation failed with ${errors.length} errors`);
    }

    progress.complete(`Validation passed: ${data.length} records valid`);
    return true;
}

// Check if value is a valid date
function isValidDate(value) {
    if (!value) return false;
    const date = new Date(value);
    return date instanceof Date && !isNaN(date.getTime());
}

// Normalize data to match database schema
function normalizeData(data, type) {
    return data.map(record => {
        if (type === 'game_rounds') {
            return {
                multiplier: record.multiplier || record.crashMultiplier,
                timestamp: new Date(record.timestamp),
                game_duration: record.game_duration || record.gameDuration || null
            };
        } else if (type === 'bet_history') {
            return {
                game_round_id: record.game_round_id || record.gameRoundId || null,
                bet_amount: record.bet_amount || record.betAmount,
                target_multiplier: record.target_multiplier || record.targetMultiplier,
                actual_multiplier: record.actual_multiplier || record.actualMultiplier,
                profit_loss: record.profit_loss || record.profitLoss,
                won: record.won === true || record.won === 1,
                timestamp: new Date(record.timestamp)
            };
        }
        return record;
    });
}

// Check for duplicates in existing database
async function checkDuplicates(database, data, type, progress) {
    progress.start('Checking for duplicates in database');

    const duplicates = [];
    const unique = [];

    try {
        // Get existing records for comparison
        // Use a broad date range to catch potential duplicates
        const timestamps = data.map(r => new Date(r.timestamp));
        const minDate = new Date(Math.min(...timestamps.map(t => t.getTime())));
        const maxDate = new Date(Math.max(...timestamps.map(t => t.getTime())));

        let existingRecords;
        if (type === 'game_rounds') {
            existingRecords = await database.getGameHistory({
                fromDate: minDate,
                toDate: maxDate,
                limit: 100000 // Large limit to get all in range
            });
        } else {
            existingRecords = await database.getBetHistory({
                fromDate: minDate,
                toDate: maxDate,
                limit: 100000
            });
        }

        progress.log(`Found ${existingRecords.length} existing records in date range`);

        // Build lookup map for faster duplicate detection
        const existingMap = new Map();
        for (const existing of existingRecords) {
            const key = buildDuplicateKey(existing, type);
            existingMap.set(key, existing);
        }

        // Check each import record for duplicates
        for (const record of data) {
            const key = buildDuplicateKey(record, type);

            if (existingMap.has(key)) {
                duplicates.push(record);
            } else {
                unique.push(record);
            }
        }

        progress.complete(`Duplicate check complete: ${duplicates.length} duplicates, ${unique.length} unique`);

        return { duplicates, unique };
    } catch (error) {
        throw new Error(`Duplicate check failed: ${error.message}`);
    }
}

// Build a unique key for duplicate detection
function buildDuplicateKey(record, type) {
    const timestamp = new Date(record.timestamp).getTime();
    // Round to nearest second for timestamp comparison
    const roundedTime = Math.floor(timestamp / 1000) * 1000;

    if (type === 'game_rounds') {
        const multiplier = record.multiplier || record.crashMultiplier;
        return `${roundedTime}_${multiplier}`;
    } else if (type === 'bet_history') {
        return `${roundedTime}_${record.bet_amount}_${record.target_multiplier}`;
    }

    return `${roundedTime}`;
}

// Import data to database
async function importToDatabase(database, data, type, options, progress) {
    const { dryRun, skipDuplicates } = options;

    if (dryRun) {
        progress.log('\n=== DRY RUN MODE ===');
        progress.log('No data will be imported. This is a preview only.\n');
    }

    // Check for duplicates if skip-duplicates is enabled
    let recordsToImport = data;
    if (skipDuplicates) {
        const { duplicates, unique } = await checkDuplicates(database, data, type, progress);

        if (duplicates.length > 0) {
            progress.warn(`Skipping ${duplicates.length} duplicate records`);
            recordsToImport = unique;
        }
    }

    if (recordsToImport.length === 0) {
        progress.log('No records to import after filtering');
        return { imported: 0, skipped: data.length - recordsToImport.length };
    }

    // Show preview
    progress.log('\n=== IMPORT PREVIEW ===');
    progress.log(`Data type: ${type}`);
    progress.log(`Total records to import: ${recordsToImport.length}`);
    progress.log(`First record: ${JSON.stringify(recordsToImport[0], null, 2)}`);
    progress.log(`Last record: ${JSON.stringify(recordsToImport[recordsToImport.length - 1], null, 2)}`);

    if (dryRun) {
        progress.log('\nDry run complete. No data was imported.');
        return { imported: 0, skipped: data.length };
    }

    // Perform actual import
    progress.start(`Importing ${recordsToImport.length} records to database`);

    try {
        let importedCount = 0;

        // Use batch insert for efficiency
        const batchSize = 100;
        for (let i = 0; i < recordsToImport.length; i += batchSize) {
            const batch = recordsToImport.slice(i, i + batchSize);

            if (type === 'game_rounds') {
                await database.saveGameRoundsBatch(batch);
            } else if (type === 'bet_history') {
                await database.saveBetHistoryBatch(batch);
            }

            importedCount += batch.length;

            if (options.progress) {
                progress.update(importedCount, recordsToImport.length);
            }
        }

        progress.complete(`Import complete: ${importedCount} records imported`);

        return {
            imported: importedCount,
            skipped: data.length - recordsToImport.length
        };
    } catch (error) {
        throw new Error(`Import failed: ${error.message}`);
    }
}

// Main import function
async function importData() {
    const options = parseArguments();

    // Show help if requested or no file specified
    if (options.help || !options.file) {
        showHelp();
        process.exit(options.help ? 0 : 1);
    }

    const progress = new ProgressIndicator(options.progress, options.quiet);

    try {
        // Read import file
        const data = await readImportFile(options.file, progress);

        if (data.length === 0) {
            progress.warn('Import file contains no data');
            process.exit(0);
        }

        // Detect or validate data type
        const type = options.type === 'auto'
            ? detectDataType(data, progress)
            : options.type;

        if (!['game_rounds', 'bet_history'].includes(type)) {
            throw new Error(`Invalid type: ${type}. Must be "game_rounds" or "bet_history"`);
        }

        // Validate data structure
        validateData(data, type, progress);

        if (options.validateOnly) {
            progress.log('\nValidation complete. File is ready for import.');
            process.exit(0);
        }

        // Normalize data to match database schema
        const normalizedData = normalizeData(data, type);

        // Import to destination
        if (options.source === 'database') {
            const database = require('../database/database');

            // Check database connection
            if (!database.isConnectedToDatabase()) {
                progress.log('Database not connected, attempting to connect...');
                await database.connect();
                await database.initializeDatabase();
            }

            // Import to database
            const result = await importToDatabase(database, normalizedData, type, options, progress);

            // Show summary
            progress.log('\n=== IMPORT SUMMARY ===');
            progress.log(`Total records in file: ${data.length}`);
            progress.log(`Records imported: ${result.imported}`);
            progress.log(`Records skipped: ${result.skipped}`);
            progress.log(`Import destination: database (${type} table)`);

        } else {
            throw new Error(`Source "${options.source}" not yet implemented. Use "database" for now.`);
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

// Run the import
if (require.main === module) {
    importData();
}

module.exports = {
    importData,
    parseArguments,
    readImportFile,
    validateData,
    normalizeData
};
