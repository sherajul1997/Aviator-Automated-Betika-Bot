/**
 * Test script for dataExporter module
 * This file can be deleted after verification
 */

const dataExporter = require('./util/dataExporter');

// Sample game data for testing
const sampleGameData = [
    {
        multiplier: 2.5,
        timestamp: new Date().toISOString(),
        betPlaced: true,
        betAmount: 100,
        targetMultiplier: 2.0,
        won: true,
        profit: 100
    },
    {
        multiplier: 1.2,
        timestamp: new Date().toISOString(),
        betPlaced: true,
        betAmount: 100,
        targetMultiplier: 2.0,
        won: false,
        profit: -100
    },
    {
        multiplier: 5.8,
        timestamp: new Date().toISOString(),
        betPlaced: false,
        betAmount: 0,
        targetMultiplier: 0,
        won: false,
        profit: 0
    }
];

async function testExporter() {
    console.log('Testing dataExporter module...\n');

    try {
        // Test 1: Format game data
        console.log('Test 1: formatGameData()');
        const formatted = dataExporter.formatGameData(sampleGameData);
        console.log('✓ Formatted data:', JSON.stringify(formatted, null, 2));
        console.log('');

        // Test 2: Export to JSON
        console.log('Test 2: exportToJSON()');
        const jsonPath = await dataExporter.exportToJSON(sampleGameData);
        console.log('✓ JSON exported to:', jsonPath);
        console.log('');

        // Test 3: Export to CSV
        console.log('Test 3: exportToCSV()');
        const csvPath = await dataExporter.exportToCSV(sampleGameData);
        console.log('✓ CSV exported to:', csvPath);
        console.log('');

        // Test 4: Get exported files
        console.log('Test 4: getExportedFiles()');
        const files = await dataExporter.getExportedFiles();
        console.log('✓ Exported files:', files.map(f => f.filename));
        console.log('');

        // Test 5: Generate timestamp filename
        console.log('Test 5: generateTimestampedFilename()');
        const filename = dataExporter.generateTimestampedFilename('test', 'json');
        console.log('✓ Generated filename:', filename);
        console.log('');

        console.log('All tests passed! ✓');
    } catch (error) {
        console.error('Test failed:', error.message);
        process.exit(1);
    }
}

// Run tests
testExporter();
