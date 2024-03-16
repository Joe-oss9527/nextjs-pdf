const Scraper = require("./scraper");
const { cleanDirectory, ensureDirectoryExists } = require("./fileUtils");
const config = require("./config");
const executePythonScript = require('./executePythonScript');
const { rootURL, pdfDir } = config;

async function runPython() {
  try {
    // 假设你的Python脚本接受一个参数
    const scriptPath = 'mergePdf.py';
    const args = []; // 如果脚本需要参数
    const output = await executePythonScript(scriptPath, args);
    console.log('Python脚本的输出:', output);
    console.log('Python脚本执行成功');
  } catch (error) {
    console.error('执行Python脚本时出错:', error);
  }
}

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
    console.log("Scraping process completed");
    // 合并PDF文件, 请稍等...
    console.log("Merging PDF files, please wait...");
    await runPython();
    console.log("PDF files merged successfully");
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main();
