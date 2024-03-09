const Scraper = require("./scraper");
const { cleanDirectory, ensureDirectoryExists } = require("./fileUtils");
const config = require("./config");
const { rootURL, pdfDir } = config;
async function main() {
  try {
    console.log("Scraping task started");
    console.log();
    console.log("Cleaning and creating PDF directory")
    await cleanDirectory(pdfDir);
    console.log("Ensuring PDF directory exists")
    await ensureDirectoryExists(pdfDir);

    console.log("Starting scraping process")
    const scraper = new Scraper(pdfDir);
    await scraper.process(rootURL);
    console.log("Scraping process completed")
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main();
