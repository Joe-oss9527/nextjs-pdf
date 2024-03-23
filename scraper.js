const puppeteer = require("puppeteer");
const asyncLib = require("async");
const config = require("./config");
const { getPdfPath, saveArtileTitle } = require("./fileUtils");
const { delay, isIgnored } = require("./utils");
const { loadAllLazyImages } = require("./LazyLoadingImageHelper");

class Scraper {
  constructor(pdfDir, concurrency = config.concurrency) {
    this.pdfDir = pdfDir;
    this.concurrency = concurrency;
    this.browser = null;
    this.totalLinks = 0;
    this.queue = asyncLib.queue(async (task) => {
      const { url, groupTitle, index } = task;
      try {
        await this.scrapePageWithRetry(url, index, groupTitle);
        // 任务完成后，调用回调函数
        console.log(`Processed: ${url}`);
      } catch (error) {
        console.error(`Failed to process ${url}: ${error}`);
      }
    }, this.concurrency);
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: "new",
      defaultViewport: {
        width: 0,
        height: 0,
      },
      args: ["--start-maximized"],
    });
  }

  async close() {
    if (this.browser) await this.browser.close();
  }

  async scrapePageWithRetry(url, index, groupTitle) {
    const maxRetries = 5; // 最大重试次数
    let retryCount = 0; // 当前重试次数
    let baseDelay = 1000; // 基础等待时间（毫秒）

    while (retryCount < maxRetries) {
      try {
        await this.scrapePage(url, index, groupTitle); // 尝试执行scrapePage函数
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

  async scrapePage(url, index, groupTitle) {
    console.log(`Scraping page: ${url}`);
    let page;
    try {
      page = await this.browser.newPage();

      // 注意，由于这段代码是在浏览器环境中执行的（通过Puppeteer或Playwright的page.evaluate方法），
      // 所以console.log打印的内容将出现在浏览器的控制台中，而不是Node.js的控制台。
      // 如果你想在Node.js控制台中看到这些信息，
      // 需要使用Puppeteer或Playwright的相关API来捕获页面的console事件。

      // 只处理包含特定前缀的 console 信息
      page.on("console", (msg) => {
        const text = msg.text();
        // 检查消息是否以我们的特定前缀开始
        if (text.startsWith("[NodeConsole]")) {
          // 从消息中移除前缀后输出
          console.log(text.replace("[NodeConsole] ", ""));
        }
      });

      await page.goto(url, { waitUntil: "networkidle0" });
      await page.waitForSelector(config.contentSelector);

      const h1Text = await page.evaluate(async (selector) => {
        const details = document.querySelectorAll("details");
        details.forEach((detail) => {
          detail.setAttribute("open", "true");
        });

        await delay(1000);

        // find all button elements which has the class "sandpack-expand"
        const sandpackExpandButtons = document.querySelectorAll(
          "button.sandpack-expand",
        );

        // click all the buttons
        sandpackExpandButtons.forEach(async (button) => {
          // scroll to the button
          button.scrollIntoView();
          button.click();
          await delay(1000);
        });

        document.body.innerHTML = document.querySelector(selector).outerHTML;
        const h1 = document.querySelector("h1");
        return h1 ? h1.innerText : "";

        function delay(time) {
          return new Promise(function (resolve) {
            setTimeout(resolve, time);
          });
        }
      }, config.contentSelector);

      await saveArtileTitle(index, h1Text);

      await delay(1000);

      console.log("Start to Scroll the page");
      await loadAllLazyImages(page, index);
      console.log("Finish to Scroll the page");

      console.log("Get saving pdf path");
      const pdfPath = await getPdfPath(url, index, config.pdfDir, groupTitle);
      await page.pdf({
        path: pdfPath,
        format: "A4",
        margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" },
      });
      console.log(`Saved PDF: ${pdfPath}`);
      // 等待数秒以确保PDF文件已保存
      await delay(2000);
      // 完成百分比
      const completed = ((index + 1) / this.totalLinks) * 100;
      console.log(
        `Completed: ${completed.toFixed(2)}%, total: ${
          this.totalLinks
        }, current: ${index + 1}.`,
      );
    } catch (error) {
      console.log(`Failed to Scrap page: ${url}, error: ${error}`);
      throw error;
    } finally {
      if (page) await page.close();
    }
  }

  addTasks(groupUrls) {
    let index = 0;
    for (let [groupTitle, groupLinks] of groupUrls) {
      for (let url of groupLinks) {
        this.queue.push({ url, index: index++, groupTitle })
      }
    }
  }

  async process(baseUrl) {
    console.log("开始处理");
    await this.initialize();
    console.log("初始化完成");
    console.log("开始处理导航链接");
    const groupUrls = await this.scrapeNavLinks(baseUrl, config.navigationSelector);
    this.totalLinks = Object.values(groupUrls).flat(Infinity).length;
    console.log("导航链接处理完成", groupUrls);
    console.log("链接总数:", this.totalLinks);
    console.log("开始添加任务");
    this.addTasks(groupUrls);

    // 队列中的所有任务完成后，执行此函数
    return new Promise((resolve) => {
      this.queue.drain(async () => {
        console.log("所有任务已完成");
        console.log("关闭浏览器");
        await this.close();
        resolve();
      });
    });
  }

  async scrapeNavLinks(baseUrl, navigationSelector) {
    navigationSelector = "aside > nav > ul > li";
    let page;
    try {
      page = await this.browser.newPage();
      await page.goto(baseUrl, { waitUntil: "networkidle0" });

      // 注意: 在实际使用中，由于page.evaluate内部代码是在浏览器环境中执行的，
      // 而不是Node.js环境，所以不能直接从Node.js环境传递函数或复杂对象给它。
      // 如果需要在page.evaluate中使用外部定义的函数，你可以考虑将函数体转换为字符串形式传递，
      // 或者直接在evaluate中定义该函数，取决于你的具体需求和函数的复杂度。
      const groupLinks = await page.evaluate((selector) => {
        const lis = Array.from(document.querySelectorAll(selector));
        const groupLinkMap = {} ;
        for (let li of lis) {
          const groupUrls = li.querySelectorAll("a[href]:not([href='#'])");
          if (groupUrls.length > 0) {
            const groupTitle = groupUrls[0].title;
            groupLinkMap[groupTitle] = []
            for (let i = 0; i < groupUrls.length; i++) {
              let link = groupUrls[i];
              groupLinkMap[groupTitle].push(link.href);
            }
          }
          
        }
        return groupLinkMap

      }, navigationSelector);
      console.log(groupLinks)
      return Object.entries(groupLinks);
    } finally {
      if (page) await page.close();
    }
  }
}

module.exports = Scraper;
