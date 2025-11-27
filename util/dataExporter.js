const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

/**
 * DataExporter - Utility module for exporting aviator game data in multiple formats
 * Supports JSON, CSV export with timestamp-based file naming and proper error handling
 */
class DataExporter {
    constructor() {
        this.exportDir = path.join(__dirname, '..', 'exports');
        this.ensureExportDirectory();
    }

    /**
     * Ensures the export directory exists
     */
    async ensureExportDirectory() {
        try {
            await fs.mkdir(this.exportDir, { recursive: true });
        } catch (error) {
            logger.error(`Failed to create export directory: ${error.message}`);
        }
    }

    /**
     * Generates a timestamp-based filename
     * @param {string} prefix - Filename prefix (e.g., 'aviator_data')
     * @param {string} extension - File extension (e.g., 'json', 'csv')
     * @returns {string} - Formatted filename with timestamp
     */
    generateTimestampedFilename(prefix = 'aviator_data', extension = 'json') {
        const timestamp = new Date().toISOString()
            .replace(/:/g, '-')
            .replace(/\./g, '-')
            .substring(0, 19);
        return `${prefix}_${timestamp}.${extension}`;
    }

    /**
     * Formats raw game data into a standardized structure
     * @param {Array|Object} data - Raw game data to format
     * @returns {Object} - Formatted game data with metadata
     */
    formatGameData(data) {
        try {
            const formattedData = {
                exportMetadata: {
                    exportDate: new Date().toISOString(),
                    dataType: 'aviator_game_data',
                    recordCount: Array.isArray(data) ? data.length : 1,
                    version: '1.0'
                },
                data: Array.isArray(data) ? data : [data]
            };

            // Ensure each game record has required fields
            formattedData.data = formattedData.data.map((record, index) => {
                return {
                    id: record.id || index + 1,
                    multiplier: record.multiplier || record.crashMultiplier || 0,
                    timestamp: record.timestamp || new Date().toISOString(),
                    betPlaced: record.betPlaced || false,
                    betAmount: record.betAmount || 0,
                    targetMultiplier: record.targetMultiplier || 0,
                    actualMultiplier: record.actualMultiplier || record.multiplier || 0,
                    won: record.won || false,
                    profit: record.profit || 0,
                    gameDuration: record.gameDuration || 0,
                    ...record // Include any additional fields
                };
            });

            return formattedData;
        } catch (error) {
            logger.error(`Error formatting game data: ${error.message}`);
            throw new Error(`Data formatting failed: ${error.message}`);
        }
    }

    /**
     * Exports data to JSON format
     * @param {Array|Object} data - Data to export
     * @param {Object} options - Export options
     * @param {string} options.filename - Custom filename (optional)
     * @param {boolean} options.pretty - Pretty print JSON (default: true)
     * @param {boolean} options.includeMetadata - Include export metadata (default: true)
     * @returns {Promise<string>} - Path to exported file
     */
    async exportToJSON(data, options = {}) {
        try {
            const {
                filename = this.generateTimestampedFilename('aviator_data', 'json'),
                pretty = true,
                includeMetadata = true
            } = options;

            await this.ensureExportDirectory();

            const formattedData = includeMetadata ? this.formatGameData(data) : data;
            const jsonContent = pretty
                ? JSON.stringify(formattedData, null, 2)
                : JSON.stringify(formattedData);

            const filePath = path.join(this.exportDir, filename);
            await fs.writeFile(filePath, jsonContent, 'utf8');

            logger.info(`Data exported to JSON: ${filePath}`);
            return filePath;
        } catch (error) {
            logger.error(`JSON export failed: ${error.message}`);
            throw new Error(`JSON export failed: ${error.message}`);
        }
    }

    /**
     * Exports data to CSV format
     * @param {Array} data - Array of data objects to export
     * @param {Object} options - Export options
     * @param {string} options.filename - Custom filename (optional)
     * @param {Array} options.columns - Specific columns to export (optional)
     * @param {boolean} options.includeHeaders - Include column headers (default: true)
     * @returns {Promise<string>} - Path to exported file
     */
    async exportToCSV(data, options = {}) {
        try {
            const {
                filename = this.generateTimestampedFilename('aviator_data', 'csv'),
                columns = null,
                includeHeaders = true
            } = options;

            await this.ensureExportDirectory();

            if (!Array.isArray(data) || data.length === 0) {
                throw new Error('Data must be a non-empty array for CSV export');
            }

            // Format data first
            const formattedData = this.formatGameData(data);
            const records = formattedData.data;

            // Determine columns to export
            const allColumns = columns || Object.keys(records[0]);

            // Build CSV content
            let csvContent = '';

            // Add headers
            if (includeHeaders) {
                csvContent += allColumns.map(col => this.escapeCsvValue(col)).join(',') + '\n';
            }

            // Add data rows
            for (const record of records) {
                const row = allColumns.map(col => {
                    const value = record[col] !== undefined ? record[col] : '';
                    return this.escapeCsvValue(value);
                });
                csvContent += row.join(',') + '\n';
            }

            const filePath = path.join(this.exportDir, filename);
            await fs.writeFile(filePath, csvContent, 'utf8');

            logger.info(`Data exported to CSV: ${filePath}`);
            return filePath;
        } catch (error) {
            logger.error(`CSV export failed: ${error.message}`);
            throw new Error(`CSV export failed: ${error.message}`);
        }
    }

    /**
     * Escapes a value for CSV format
     * @param {*} value - Value to escape
     * @returns {string} - Escaped value
     */
    escapeCsvValue(value) {
        if (value === null || value === undefined) {
            return '';
        }

        const stringValue = String(value);

        // If value contains comma, quote, or newline, wrap in quotes and escape quotes
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
        }

        return stringValue;
    }

    /**
     * Exports data to database
     * @param {Array|Object} data - Data to export
     * @param {Object} database - Database instance with saveGameRound method
     * @param {Object} options - Export options
     * @param {boolean} options.batch - Use batch insert (default: true)
     * @returns {Promise<Object>} - Export results
     */
    async exportToDatabase(data, database, options = {}) {
        try {
            const { batch = true } = options;

            if (!database || typeof database.saveGameRound !== 'function') {
                throw new Error('Invalid database instance provided');
            }

            const formattedData = this.formatGameData(data);
            const records = formattedData.data;

            let successCount = 0;
            let failureCount = 0;
            const errors = [];

            if (batch && typeof database.batchSaveGameRounds === 'function') {
                // Use batch insert if available
                try {
                    await database.batchSaveGameRounds(records);
                    successCount = records.length;
                    logger.info(`Batch exported ${successCount} records to database`);
                } catch (error) {
                    logger.error(`Batch database export failed: ${error.message}`);
                    throw error;
                }
            } else {
                // Insert records individually
                for (const record of records) {
                    try {
                        await database.saveGameRound(record);
                        successCount++;
                    } catch (error) {
                        failureCount++;
                        errors.push({
                            record: record,
                            error: error.message
                        });
                        logger.error(`Failed to save record to database: ${error.message}`);
                    }
                }
            }

            const result = {
                success: failureCount === 0,
                totalRecords: records.length,
                successCount,
                failureCount,
                errors: errors.length > 0 ? errors : undefined
            };

            logger.info(`Database export completed: ${successCount} succeeded, ${failureCount} failed`);
            return result;
        } catch (error) {
            logger.error(`Database export failed: ${error.message}`);
            throw new Error(`Database export failed: ${error.message}`);
        }
    }

    /**
     * Gets list of exported files
     * @param {Object} options - Filter options
     * @param {string} options.extension - Filter by extension (e.g., 'json', 'csv')
     * @returns {Promise<Array>} - List of exported files with metadata
     */
    async getExportedFiles(options = {}) {
        try {
            await this.ensureExportDirectory();

            const files = await fs.readdir(this.exportDir);
            const { extension = null } = options;

            const fileList = [];

            for (const file of files) {
                if (extension && !file.endsWith(`.${extension}`)) {
                    continue;
                }

                const filePath = path.join(this.exportDir, file);
                const stats = await fs.stat(filePath);

                fileList.push({
                    filename: file,
                    path: filePath,
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime
                });
            }

            // Sort by modified date, newest first
            fileList.sort((a, b) => b.modified - a.modified);

            return fileList;
        } catch (error) {
            logger.error(`Failed to get exported files: ${error.message}`);
            return [];
        }
    }

    /**
     * Deletes old export files based on age
     * @param {number} daysOld - Delete files older than this many days
     * @returns {Promise<number>} - Number of files deleted
     */
    async cleanupOldExports(daysOld = 30) {
        try {
            await this.ensureExportDirectory();

            const files = await this.getExportedFiles();
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            let deletedCount = 0;

            for (const file of files) {
                if (file.modified < cutoffDate) {
                    await fs.unlink(file.path);
                    deletedCount++;
                    logger.info(`Deleted old export file: ${file.filename}`);
                }
            }

            logger.info(`Cleanup completed: ${deletedCount} files deleted`);
            return deletedCount;
        } catch (error) {
            logger.error(`Cleanup failed: ${error.message}`);
            return 0;
        }
    }
}

module.exports = new DataExporter();
