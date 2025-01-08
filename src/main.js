const Scraper = require("./scraper");
const { cleanDirectory, ensureDirectoryExists } = require("./fileUtils");
const config = require("./configLoader");
const executePythonScript = require('./executePythonScript');
const path = require('path');

async function runPython() {
  try {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'mergePdf.py');
    console.log('Executing Python script:', scriptPath);
    const output = await executePythonScript(scriptPath);
    console.log('Python script output:', output);
    console.log('Python script executed successfully');
  } catch (error) {
    if (error.message.includes('No Python interpreter found')) {
      console.error('\x1b[31m%s\x1b[0m', 'Error: Python 3 is required but not found.');
      console.log('\nPlease install Python 3:');
      console.log('- On macOS: brew install python3');
      console.log('- On Windows: Download from https://www.python.org/downloads/');
      console.log('- On Linux: sudo apt-get install python3\n');
    } else {
      console.error('Error executing Python script:', error);
    }
    process.exit(1);
  }
}

async function main() {
  try {
    console.log("Scraping task started");
    
    console.log("Cleaning and creating PDF directory");
    await cleanDirectory(config.pdfDir);
    
    console.log("Ensuring PDF directory exists");
    await ensureDirectoryExists(config.pdfDir);

    console.log("Starting scraping process");
    const scraper = new Scraper();
    await scraper.run();
    console.log("Scraping process completed");
    
    console.log("Merging PDF files, please wait...");
    await runPython();
    console.log("PDF files merged successfully");
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', "An error occurred:", error);
    process.exit(1);
  }
}

main();