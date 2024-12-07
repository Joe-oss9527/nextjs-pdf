const puppeteer = require('puppeteer');
const asyncLib = require('async');
const config = require('./configLoader');
const { delay, isIgnored } = require('./utils');
const { setupImageLoadingObserver, checkAllImagesLoaded, waitForImagesWithTimeout } = require('./imageHandler');
const { getPdfPath, logFailedLink, saveArticleTitle, logImageLoadFailure, getImageLoadFailures } = require('./fileUtils');

class Scraper {
  constructor() {
    this.browser = null;
    this.totalLinks = 0;
    this.queue = asyncLib.queue(this.processTask.bind(this), config.concurrency);
    this.imageLoadFailures = new Set();
  }

  async initialize(headless = 'new') {
    this.browser = await puppeteer.launch({
      headless: headless,
      defaultViewport: {
        width: 0,
        height: 0,
      },
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
    });
  }

  async close() {
    if (this.browser) await this.browser.close();
  }

  async scrapeNavLinks() {
    const page = await this.browser.newPage();
    try {
      await page.goto(config.rootURL, { waitUntil: 'networkidle0', timeout: config.pageTimeout });
      
      // 首先将首页URL添加到链接列表中
      const links = [config.rootURL];
      
      // 然后获取导航链接
      const navLinks = await page.evaluate((selector) => {
        return Array.from(document.querySelectorAll(selector))
          .map(el => el.href)
          .filter(href => href && !href.startsWith('#'));
      }, config.navLinksSelector);
      
      // 合并首页和导航链接
      const allLinks = [...links, ...navLinks];
      
      // 去重
      const uniqueLinks = [...new Set(allLinks)];
      
      return uniqueLinks.filter(link => !isIgnored(link, config.ignoreURLs));
    } finally {
      await page.close();
    }
  }

  async scrapePage(url, index) {
    const page = await this.browser.newPage();
    try {
      console.log(`Scraping page: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle0', timeout: config.pageTimeout });
      await page.waitForSelector(config.contentSelector, { timeout: config.pageTimeout });

      // 保留原始样式并优化打印效果
      await page.evaluate(() => {
        // 保存所有样式表
        const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'));
        
        // 移除不必要的元素
        const elementsToRemove = document.querySelectorAll('script, iframe, nav[role="navigation"], button, .feedback-links, .reading-time, footer, header');
        elementsToRemove.forEach(el => el.remove());
        
        // 移除深色主题相关的类
        document.body.classList.remove('dark-mode', 'night-mode');
        document.documentElement.classList.remove('dark-mode', 'night-mode');
        
        // 仅保留主要内容和必要的样式
        const mainContent = document.querySelector('article');
        if (mainContent) {
          // 创建一个新的容器
          const container = document.createElement('div');
          container.className = 'docker-content';
          container.innerHTML = mainContent.innerHTML;
          
          // 清空 body 但保留样式
          document.body.innerHTML = '';
          document.body.style.background = '#ffffff';
          
          // 重新添加样式
          styles.forEach(style => document.head.appendChild(style.cloneNode(true)));
          
          // 添加内容
          document.body.appendChild(container);
          
          // 添加优化的打印样式
          const printStyle = document.createElement('style');
          printStyle.textContent = `
            body {
              background: #ffffff !important;
              color: #000000 !important;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            }
            
            .docker-content {
              padding: 2cm;
              max-width: 21cm;
              margin: 0 auto;
              font-size: 11pt;
              line-height: 1.5;
              color: #000000;
            }

            h1, h2, h3, h4, h5, h6 {
              color: #000000 !important;
              page-break-after: avoid;
              margin-top: 1.5em;
              margin-bottom: 0.5em;
            }

            h1 { font-size: 24pt; }
            h2 { font-size: 18pt; }
            h3 { font-size: 14pt; }
            
            p, ul, ol {
              margin-bottom: 0.8em;
            }

            /* 通用代码块样式 */
            pre {
              background: #f8f9fa !important;
              border: 1px solid #e9ecef;
              border-radius: 6px;
              padding: 1em;
              margin: 1.2em 0;
              overflow-x: auto;
              page-break-inside: avoid;
              position: relative;
            }

            /* 行内代码样式 */
            code {
              font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
              font-size: 0.9em;
              background: #f1f3f5 !important;
              padding: 0.2em 0.4em;
              border-radius: 3px;
              color: #24292e !important;
              -webkit-font-smoothing: antialiased;
            }

            /* pre 中的 code 样式 */
            pre code {
              background: none !important;
              padding: 0;
              font-size: 0.95em;
              line-height: 1.5;
              color: #24292e !important;
              border-radius: 0;
              white-space: pre;
              word-break: normal;
              word-spacing: normal;
            }

            /* 代码块标题/语言标识 */
            pre[data-lang]::before {
              content: attr(data-lang);
              position: absolute;
              top: 0;
              right: 0;
              padding: 0.2em 0.5em;
              font-size: 0.8em;
              color: #666;
              background: #f1f3f5;
              border-bottom-left-radius: 4px;
            }

            /* 代码高亮样式 */
            .line { display: block; }
            .cl { display: inline; }
            .highlight {
              background: transparent !important;
            }
            .kn, .kd { color: #d73a49 !important; }  /* 关键字 */
            .s, .s1, .s2 { color: #032f62 !important; }  /* 字符串 */
            .nx { color: #24292e !important; }  /* 标识符 */
            .p { color: #24292e !important; }   /* 标点符号 */
            .c1 { color: #6a737d !important; }  /* 注释 */
            .o { color: #d73a49 !important; }   /* 运算符 */
            .kt { color: #d73a49 !important; }  /* 类型 */

            /* 打印优化 */
            @media print {
              pre, code {
                border-color: #e0e0e0 !important;
                background-color: #f8f9fa !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              
              pre[data-lang]::before {
                display: none;  /* 打印时隐藏语言标识 */
              }

              .highlight {
                border: none !important;
                background: none !important;
              }
            }
          `;
          document.head.appendChild(printStyle);
        }
      });

      await setupImageLoadingObserver(page);

      // delay before taking the screenshot
      await delay(config.screenshotDelay);
      
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(1000);  // Short delay after scrolling
      
      await waitForImagesWithTimeout(page, config.imageTimeout);
      
      const allImagesLoaded = await checkAllImagesLoaded(page);
      if (!allImagesLoaded) {
        console.warn(`Not all images loaded for: ${url}`);
        this.imageLoadFailures.add(url);
        await logImageLoadFailure(config.pdfDir, url, index);
      }

      // 在处理内容之前提取标题
      const title = await page.evaluate(() => {
        const h1 = document.querySelector('article h1');
        if (h1) return h1.innerText;
        const pageTitle = document.querySelector('title');
        return pageTitle ? pageTitle.innerText : '';
      });
      
      await saveArticleTitle(config.pdfDir, index, title);

      const pdfPath = await getPdfPath(url, index, config.pdfDir);
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' },
        printBackground: true
      });

      console.log(`Saved PDF: ${pdfPath}`);

    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
      throw error;
    } finally {
      await page.close();
    }
  }

  async processTask(task, headless = 'new') {
    if (!this.browser || this.browser.isConnected() === false) {
      await this.initialize(headless);
    }
    const { url, index } = task;
    let retries = 0;
    while (retries < config.maxRetries) {
      try {
        await this.scrapePage(url, index);
        break;  // Success, exit the retry loop
      } catch (error) {
        retries++;
        console.warn(`Attempt ${retries} failed for ${url}:`, error.message);
        if (retries < config.maxRetries) {
          await delay(config.retryDelay * retries);  // Exponential backoff
        } else {
          await logFailedLink(config.pdfDir, url, index, error);
        }
      }
    }
    // Log progress
    const completed = ((index + 1) / this.totalLinks) * 100;
    console.log(`Completed: ${completed.toFixed(2)}%, total: ${this.totalLinks}, current: ${index + 1}.`);
  }

  async retryImageLoadFailures() {
    console.log("Retrying pages with image load failures...");
    const failures = await getImageLoadFailures(config.pdfDir);
    
    // Close the current browser instance
    await this.close();
    
    // Initialize a new browser instance with headless set to false
    await this.initialize(false);
    
    for (const failure of failures) {
      await this.processTask(failure, false);
    }
    console.log("Retry of image load failures completed.");
  }

  async run() {
    try {
      await this.initialize();
      const links = await this.scrapeNavLinks();
      this.totalLinks = links.length;
      console.log(`Found ${this.totalLinks} links to scrape.`);

      links.forEach((url, index) => {
        this.queue.push({ url, index });
      });

      // Wait for all tasks to complete
      await new Promise((resolve) => {
        this.queue.drain(resolve);
      });

      console.log("All pages have been processed. Starting retry for image load failures.");
      await this.retryImageLoadFailures();

      console.log("All scraping tasks completed, including retries.");
    } catch (error) {
      console.error("An error occurred during scraping:", error);
    } finally {
      await this.close();
    }
  }
}

module.exports = Scraper;