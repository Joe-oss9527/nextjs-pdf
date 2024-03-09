const puppeteer = require("puppeteer");
const asyncLib = require("async");
const config = require("./config");
const { mergePDFsForRootAndSubdirectories, getPdfPath } = require("./pdfUtils");

// 自动滚动到页面底部以确保动态内容加载
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      var totalHeight = 0;
      var distance = 100;
      var timer = setInterval(() => {
        var scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

class Scraper {
  constructor(pdfDir, concurrency = config.concurrency) {
    this.pdfDir = pdfDir;
    this.concurrency = concurrency;
    this.browser = null;
    this.queue = asyncLib.queue(async (task, done = () => {}) => {
      const { url, index } = task;
      try {
        await this.scrapePage(url, index);
        done();
      } catch (error) {
        console.error(`Failed to process ${url}: ${error}`);
        done(error);
      }
    }, this.concurrency);
  }

  async initialize() {
    this.browser = await puppeteer.launch({ headless: "new" });
  }

  async close() {
    if (this.browser) await this.browser.close();
  }

  async scrapePage(url, index) {
    let page;
    try {
      page = await this.browser.newPage();
      await page.goto(url, { waitUntil: "networkidle0" });
      await autoScroll(page);

      const pdfPath = await getPdfPath(url, index, config.pdfDir);
      await page.pdf({ path: pdfPath });
      console.log(`Saved PDF: ${pdfPath}`);
    } finally {
      if (page) await page.close();
    }
  }

  addTasks(urls) {
    urls.forEach((url, index) => {
      this.queue.push({ url, index }, (err) => {
        if (err) {
          console.error(`Error processing ${url}:`, err);
        }
      });
    });
  }

  async process(baseUrl) {
    await this.initialize();
    const urls = await this.scrapeNavLinks(baseUrl, config.navLinksSelector);
    this.addTasks(urls);
    await this.queue.drain();

    // 在所有子目录中合并PDF
    await mergePDFsForRootAndSubdirectories(this.pdfDir);

    await this.close();
  }

  async scrapeNavLinks(baseUrl, navLinksSelector) {
    let page;
    try {
      page = await this.browser.newPage();
      await page.goto(baseUrl, { waitUntil: "networkidle0" });
      const links = await page.evaluate((selector) => {
        const elements = Array.from(document.querySelectorAll(selector));
        return elements.map((element) => element.href);
      }, navLinksSelector);
      return links;
    } finally {
      if (page) await page.close();
    }
  }
}

module.exports = Scraper;
