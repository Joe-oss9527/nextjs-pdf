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

// delay函数
function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

class Scraper {
  constructor(pdfDir, concurrency = config.concurrency) {
    this.pdfDir = pdfDir;
    this.concurrency = concurrency;
    this.browser = null;
    this.queue = asyncLib.queue(async (task) => {
      const { url, index } = task;
      try {
        await this.scrapePage(url, index);
        // 任务完成后，调用回调函数
        console.log(`Processed: ${url}`);
      } catch (error) {
        console.error(`Failed to process ${url}: ${error}`);
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
      // 等待5秒以确保PDF文件已保存
      await delay(5000);
    } finally {
      if (page) await page.close();
    }
  }

  addTasks(urls) {
    urls.forEach((url, index) => {
      this.queue.push({ url, index });
    });
  }

  async process(baseUrl) {
    await this.initialize();
    const urls = await this.scrapeNavLinks(baseUrl, config.navLinksSelector);
    this.addTasks(urls);

    // 队列中的所有任务完成后，执行此函数
    await this.queue.drain(function () {
      console.log("所有任务已完成");
    });

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
