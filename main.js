const Scraper = require('./scraper');
const { cleanDirectory, ensureDirectoryExists } = require('./fileUtils');

const rootURL = "https://nextjs.org/docs"; // 更换为实际的URL
const pdfDir = "./pdfs";

async function main() {
    try {
        await cleanDirectory(pdfDir);
        await ensureDirectoryExists(pdfDir);

        const scraper = new Scraper(pdfDir);
        await scraper.process(rootURL);
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

main();
