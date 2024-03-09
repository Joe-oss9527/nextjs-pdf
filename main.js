const Scraper = require("./scraper");
const { cleanDirectory, ensureDirectoryExists } = require("./fileUtils");
const config = require("./config");
const { rootURL, pdfDir } = config;
async function main() {
  try {
    await cleanDirectory(pdfDir);
    await ensureDirectoryExists(pdfDir);

    const scraper = new Scraper(pdfDir);
    await scraper.process(rootURL);
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main();
