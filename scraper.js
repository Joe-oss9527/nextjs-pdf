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
        await this.scrapePageWithRetry(url, index);
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

  async scrapePageWithRetry(url, index) {
    const maxRetries = 5; // 最大重试次数
    let retryCount = 0; // 当前重试次数
    let baseDelay = 1000; // 基础等待时间（毫秒）

    while (retryCount < maxRetries) {
      try {
        await this.scrapePage(url, index); // 尝试执行scrapePage函数
        console.log("Page scraped successfully");
        break; // 如果成功，跳出循环
      } catch (error) {
        console.error(`Attempt ${retryCount + 1} failed: ${error.message}`);
        retryCount++; // 增加重试次数
        if (retryCount < maxRetries) {
          const waitTime = baseDelay * 2 ** (retryCount - 1); // 计算指数退避的等待时间
          console.log(`Waiting ${waitTime / 1000} seconds before retrying...`);
          await delay(waitTime); // 等待指定时间后重试
        }
      }
    }

    if (retryCount === maxRetries) {
      console.error("All retries failed.");
    }
  }

  async scrapePage(url, index) {
    let page;
    try {
      page = await this.browser.newPage();
      await page.goto(url, { waitUntil: "networkidle0" });
      await autoScroll(page);

      await page.evaluate((selector) => {
        document.body.innerHTML = document.querySelector(selector).outerHTML;
      }, config.contentSelector);

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
