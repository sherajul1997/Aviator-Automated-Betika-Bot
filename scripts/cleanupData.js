#!/usr/bin/env node

/**
 * Data Cleanup Script for Aviator Bot
 *
 * Archives old data files by moving them to an archive directory
 * Helps maintain clean exports directory and manage storage
 *
 * Usage:
 *   node scripts/cleanupData.js [--days 30] [--dry-run] [--quiet]
 *
 * Options:
 *   --days [number]    Archive files older than N days (default: 30)
 *   --dry-run          Show what would be archived without actually moving files
 *   --quiet            Suppress informational messages
 *   --help, -h         Show help message
 */

const fs = require('fs').promises;
const path = require('path');

// Parse command line arguments
function parseArguments() {
    const args = process.argv.slice(2);
    const options = {
        days: 30,
        dryRun: false,
        quiet: false,
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const nextArg = args[i + 1];

        switch (arg) {
            case '--days':
                options.days = parseInt(nextArg, 10);
                i++;
                break;
            case '--dry-run':
                options.dryRun = true;
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
Aviator Data Cleanup Tool
=========================

Archive old data files to keep exports directory organized.

USAGE:
  node scripts/cleanupData.js [OPTIONS]

OPTIONS:
  --days [number]    Archive files older than N days (default: 30)
  --dry-run          Show what would be archived without moving files
  --quiet            Suppress informational messages
  --help, -h         Show this help message

EXAMPLES:
  # Archive files older than 30 days
  node scripts/cleanupData.js

  # Archive files older than 60 days
  node scripts/cleanupData.js --days 60

  # Preview what would be archived without moving files
  node scripts/cleanupData.js --dry-run

  # Cleanup with minimal output
  node scripts/cleanupData.js --quiet
`);
}

// Get file age in days
async function getFileAgeDays(filePath) {
    const stats = await fs.stat(filePath);
    const ageMs = Date.now() - stats.mtimeMs;
    return ageMs / (1000 * 60 * 60 * 24);
}

// Format bytes to human readable
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Main cleanup function
async function cleanupData() {
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
        const exportsDir = path.join(__dirname, '..', 'exports');
        const archiveDir = path.join(exportsDir, 'archive');

        // Check if exports directory exists
        try {
            await fs.access(exportsDir);
        } catch (error) {
            log('No exports directory found. Nothing to cleanup.');
            process.exit(0);
        }

        // Create archive directory if it doesn't exist
        if (!options.dryRun) {
            try {
                await fs.mkdir(archiveDir, { recursive: true });
            } catch (error) {
                // Directory already exists
            }
        }

        log(`Scanning for files older than ${options.days} days...`);

        // Get all files in exports directory
        const files = await fs.readdir(exportsDir);
        const cutoffDate = Date.now() - (options.days * 24 * 60 * 60 * 1000);

        const filesToArchive = [];
        let totalSize = 0;

        // Filter files to archive
        for (const file of files) {
            // Skip archive directory itself
            if (file === 'archive') continue;

            const filePath = path.join(exportsDir, file);

            try {
                const stats = await fs.stat(filePath);

                // Only process files, not directories
                if (!stats.isFile()) continue;

                // Check if file is old enough
                if (stats.mtimeMs < cutoffDate) {
                    const ageDays = Math.floor((Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24));
                    filesToArchive.push({
                        name: file,
                        path: filePath,
                        size: stats.size,
                        ageDays: ageDays,
                        modified: new Date(stats.mtimeMs)
                    });
                    totalSize += stats.size;
                }
            } catch (error) {
                log(`Warning: Could not process file ${file}: ${error.message}`);
            }
        }

        if (filesToArchive.length === 0) {
            log(`No files found older than ${options.days} days.`);
            process.exit(0);
        }

        // Sort by age (oldest first)
        filesToArchive.sort((a, b) => a.modified - b.modified);

        // Display files to archive
        log(`\nFound ${filesToArchive.length} file(s) to archive (${formatBytes(totalSize)} total):\n`);

        for (const file of filesToArchive) {
            log(`  - ${file.name}`);
            log(`    Age: ${file.ageDays} days | Size: ${formatBytes(file.size)} | Modified: ${file.modified.toISOString()}`);
        }

        if (options.dryRun) {
            log('\n[DRY RUN] No files were moved. Remove --dry-run to archive files.');
            process.exit(0);
        }

        // Archive files
        log('\nArchiving files...');
        let successCount = 0;
        let failCount = 0;

        for (const file of filesToArchive) {
            try {
                const archivePath = path.join(archiveDir, file.name);
                await fs.rename(file.path, archivePath);
                successCount++;
                if (!options.quiet) {
                    process.stdout.write(`  ✓ Archived: ${file.name}\n`);
                }
            } catch (error) {
                failCount++;
                log(`  ✗ Failed to archive ${file.name}: ${error.message}`);
            }
        }

        log(`\n=== Cleanup Complete ===`);
        log(`Successfully archived: ${successCount} file(s)`);
        if (failCount > 0) {
            log(`Failed: ${failCount} file(s)`);
        }
        log(`Total space cleaned: ${formatBytes(totalSize)}`);
        log(`Archive location: ${archiveDir}`);

        process.exit(0);
    } catch (error) {
        console.error(`Error during cleanup: ${error.message}`);
        if (!options.quiet) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Run cleanup
if (require.main === module) {
    cleanupData();
}

module.exports = { cleanupData };
