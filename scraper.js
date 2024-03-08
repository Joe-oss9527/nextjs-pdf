const puppeteer = require("puppeteer");
const asyncLib = require("async");
const fs = require("fs");
const path = require("path");
const { mergePDFsForRootAndSubdirectories } = require("./pdfUtils");

// 确保目录存在的辅助函数
async function ensureDirectoryExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

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
  constructor(pdfDir, concurrency = 5) {
    this.pdfDir = pdfDir;
    this.concurrency = concurrency;
    this.browser = null;
    this.queue = asyncLib.queue(async (task, done = () => {}) => {
      const { url } = task;
      try {
        await this.scrapePage(url);
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

  async scrapePage(url) {
    let page;
    try {
      page = await this.browser.newPage();
      await page.goto(url, { waitUntil: "networkidle0" });
      await autoScroll(page);

      // 获取文件名，并创建子目录（如果需要）
      const urlParts = url.split("/");
      const fileName = urlParts[urlParts.length - 1] || "index";
      let pdfPath = `${this.pdfDir}/${fileName}.pdf`;

      if (url.includes("/app/") || url.includes("/pages/")) {
        const splitter = url.includes("/app/") ? "/app/" : "/pages/";
        const subFolderName = url.split(splitter)[1].split("/")[0];
        const prefix = url.includes("/app/") ? "app" : "pages";
        const appDir = `${this.pdfDir}/${prefix}-${subFolderName}`;
        await ensureDirectoryExists(appDir);
        pdfPath = `${appDir}/${fileName}.pdf`;
      }

      await page.pdf({ path: pdfPath });
      console.log(`Saved PDF: ${pdfPath}`);
    } finally {
      if (page) await page.close();
    }
  }

  addTasks(urls) {
    urls.forEach((url) => {
      this.queue.push({ url }, (err) => {
        if (err) {
          console.error(`Error processing ${url}:`, err);
        }
      });
    });
  }

  async process(baseUrl) {
    await this.initialize();
    const urls = await this.scrapeNavLinks(baseUrl);
    this.addTasks(urls);
    await this.queue.drain();

    // 在所有子目录中合并PDF
    await mergePDFsForRootAndSubdirectories(this.pdfDir);

    await this.close();
  }

  async scrapeNavLinks(baseUrl) {
    let page;
    try {
      page = await this.browser.newPage();
      await page.goto(baseUrl, { waitUntil: "networkidle0" });
      const urls = await page.evaluate(() => {
        const links = Array.from(
          document.querySelectorAll(
            "main nav.styled-scrollbar a[href]:not([href='#'])"
          )
        );
        return links.map((link) => link.href);
      });
      return urls;
    } finally {
      if (page) await page.close();
    }
  }
}

module.exports = Scraper;
