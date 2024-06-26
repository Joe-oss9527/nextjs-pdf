const Scraper = require("./scraper");
const { cleanDirectory, ensureDirectoryExists } = require("./fileUtils");
const config = require("./configLoader");
const executePythonScript = require('./executePythonScript');
const path = require('path');

async function runPython() {
  try {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'mergePdf.py');
    const output = await executePythonScript(scriptPath);
    console.log('Python script output:', output);
    console.log('Python script executed successfully');
  } catch (error) {
    console.error('Error executing Python script:', error);
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
    console.error("An error occurred:", error);
  }
}

main();