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

            /* 代码块容器 */
            .highlight {
              background: transparent !important;
              margin: 1.5em 0;
            }

            /* 代码块基础样式 */
            pre {
              background: #f8f9fa !important;
              border: 1px solid #e9ecef;
              border-radius: 6px;
              padding: 1.2em;
              margin: 0;
              overflow-x: auto;
              page-break-inside: avoid;
            }

            /* Chroma 语法高亮 */
            .chroma {
              background: none !important;
              color: #24292e !important;
            }

            /* 行内代码 */
            code {
              font-family: 'SF Mono', Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
              font-size: 0.9em;
              line-height: 1.6;
              tab-size: 4;
            }

            /* Docker 特定语法高亮 */
            .k { /* 关键字 */
              color: #0550ae !important;
              font-weight: 600;
            }
            
            .nv { /* 环境变量 */
              color: #24292e !important;
              font-weight: normal;
            }
            
            .o { /* 运算符 */
              color: #24292e !important;
            }
            
            .m { /* 数字 */
              color: #005cc5 !important;
            }

            /* Docker 文档特有的链接样式 */
            pre a {
              color: inherit !important;
              text-decoration: none !important;
              border-bottom: 1px dashed #0366d6;
            }

            pre a:hover {
              border-bottom-style: solid;
            }

            /* 行号和行内容 */
            .line {
              display: block;
              line-height: 1.6;
            }
            
            .cl {
              display: inline-block;
              padding: 0 4px;
              width: 100%;
            }

            /* 特殊标记 */
            .underline {
              text-decoration: none !important;
              border-bottom: 1px dashed currentColor;
            }

            .underline-offset-4 {
              border-bottom-width: 1px;
            }

            /* 打印优化 */
            @media print {
              .highlight pre {
                border: 1px solid #e1e4e8 !important;
                background: #f6f8fa !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }

              pre a {
                border-bottom: none !important;
              }

              .k, .nv, .m, .o {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }

              /* 确保代码块内的文本清晰可见 */
              code, pre code {
                font-weight: 500 !important;
                color: #000000 !important;
              }

              /* 环境变量和参数保持清晰 */
              .nv, .o, .m {
                color: #1a1a1a !important;
              }
            }

            /* 控制台输出特定样式 */
            .language-console .go {
              color: #24292e !important;
              font-family: 'SF Mono', Monaco, Consolas, 'Courier New', monospace;
              font-size: 0.9em;
              line-height: 1.45;
            }

            /* 控制台输出中的特殊字符 */
            .language-console .go {
              white-space: pre;
              word-spacing: normal;
              word-break: normal;
            }

            /* 控制台箭头和状态信息 */
            .language-console .go:has-text("=>"),
            .language-console .go:has-text("[+]") {
              color: #1a7f37 !important;
              font-weight: 500;
            }

            /* 控制台时间和进度信息 */
            .language-console .go:contains("FINISHED"),
            .language-console .go:contains("CACHED") {
              color: #0550ae !important;
            }

            /* 控制台错误信息 */
            .language-console .go:contains("ERROR"),
            .language-console .go:contains("FAILED") {
              color: #cf222e !important;
            }

            /* 控制台输出容器样式 */
            .language-console {
              background: #f6f8fa !important;
              padding: 16px !important;
              border-radius: 6px;
              border: 1px solid #d0d7de;
            }

            /* 控制台每行的样式 */
            .language-console .line {
              min-height: 1.45em;
              padding-left: 0.5em;
            }

            /* 控制台输出的交替行背景 */
            .language-console .line:nth-child(even) {
              background: rgba(175, 184, 193, 0.05);
            }

            /* SHA 和版本号的样式 */
            .language-console .go:matches(
              /sha256:[a-f0-9]+/,
              /@sha256:[a-f0-9]+/
            ) {
              color: #0550ae !important;
              font-family: monospace;
            }

            /* 打印优化 */
            @media print {
              .language-console {
                border: 1px solid #e1e4e8 !important;
                background: #f8f9fa !important;
                break-inside: avoid;
              }

              .language-console .go {
                color: #000000 !important;
              }

              .language-console .go:has-text("=>"),
              .language-console .go:has-text("[+]") {
                color: #1a7f37 !important;
                font-weight: 600;
              }

              .language-console .line:nth-child(even) {
                background: rgba(0, 0, 0, 0.02) !important;
              }

              /* 确保控制台输出在打印时清晰可见 */
              .language-console .go {
                font-weight: 500;
                font-size: 9pt;
                line-height: 1.4;
              }
            }

            /* Go 代码块特定样式 */
            .language-go {
              background: #f8f9fa !important;
              color: #24292e !important;
            }

            /* Go 语法高亮 */
            .language-go .kd, /* 关键字 declare */
            .language-go .kn, /* 关键字 namespace */
            .language-go .k   /* 普通关键字 */ {
              color: #0550ae !important;
              font-weight: 600;
            }

            .language-go .nx /* 标识符 */ { 
              color: #24292e !important;
            }

            .language-go .s,  /* 字符串 */
            .language-go .s1, 
            .language-go .s2 {
              color: #0a3069 !important;
            }

            .language-go .o  /* 运算符 */ { 
              color: #24292e !important;
            }

            .language-go .p  /* 标点符号 */ { 
              color: #24292e !important;
            }

            .language-go .c1 /* 注释 */ { 
              color: #6a737d !important;
              font-style: italic;
            }

            .language-go .mi /* 数字 */ { 
              color: #0550ae !important;
            }

            /* 代码块容器样式 */
            .highlight {
              position: relative;
              margin: 1em 0;
              border-radius: 6px;
              background: #f8f9fa;
            }

            /* 代码块主体 */
            .highlight pre {
              margin: 0;
              padding: 1em;
              overflow-x: auto;
              font-family: 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
              font-size: 0.9em;
              line-height: 1.5;
              tab-size: 4;
              background: transparent !important;
            }

            /* 行号和行内容布局 */
            .highlight .line {
              display: table-row;
              width: 100%;
            }

            .highlight .cl {
              display: table-cell;
              padding: 0 0.5em;
              min-height: 1.5em;
              line-height: 1.5;
            }

            /* 语言标识 */
            .highlight code[data-lang]::before {
              content: attr(data-lang);
              position: absolute;
              top: 0;
              right: 0;
              padding: 0.2em 0.5em;
              font-size: 0.8em;
              color: #57606a;
              background: #f0f1f2;
              border-bottom-left-radius: 4px;
              border-top-right-radius: 6px;
            }

            /* 打印优化 */
            @media print {
              .highlight {
                break-inside: avoid;
                border: 1px solid #e1e4e8;
                background: #ffffff !important;
              }

              .highlight pre {
                white-space: pre-wrap;
                word-break: break-word;
                font-size: 9pt;
              }

              .language-go .kd,
              .language-go .kn,
              .language-go .k {
                font-weight: 700;
              }

              /* 确保代码在打印时清晰可见 */
              .language-go {
                color: #000000 !important;
              }

              .highlight code[data-lang]::before {
                display: none;
              }

              /* 保持语法高亮在打印时的颜色 */
              .language-go .s,
              .language-go .s1,
              .language-go .s2 {
                color: #0a3069 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
            }

            /* YAML 代码块特定样式 */
            .language-yaml {
              background: #f8f9fa !important;
              color: #24292e !important;
            }

            /* YAML 语法高亮 */
            .language-yaml .nt { /* 键名 */
              color: #0550ae !important;
              font-weight: 500;
            }

            .language-yaml .p { /* 冒号等标点 */
              color: #24292e !important;
            }

            .language-yaml .w { /* 空白 */
              color: #24292e !important;
            }

            .language-yaml .l { /* 字面量 */
              color: #1a7f37 !important;
            }

            .language-yaml .s,
            .language-yaml .s2 { /* 字符串 */
              color: #0a3069 !important;
            }

            .language-yaml .m { /* 数字 */
              color: #0550ae !important;
            }

            .language-yaml .kc { /* 关键字 */
              color: #cf222e !important;
              font-weight: 600;
            }

            /* YAML 缩进和格式 */
            .language-yaml .line {
              display: table-row;
              width: 100%;
            }

            .language-yaml .cl {
              display: table-cell;
              white-space: pre;
              padding: 0 0.5em;
              line-height: 1.6;
            }

            /* YAML 代码块容��� */
            .language-yaml.chroma {
              border: 1px solid #e1e4e8;
              border-radius: 6px;
              padding: 1em;
              margin: 1em 0;
            }

            /* 保持缩进结构 */
            .language-yaml .w + .nt {
              padding-left: 0;
            }

            /* 环境变量高亮 */
            .language-yaml .l[data-content*="\${"] {
              color: #953800 !important;
              font-style: italic;
            }

            /* 打印优化 */
            @media print {
              .language-yaml {
                break-inside: avoid;
                background: #ffffff !important;
                border: 1px solid #e1e4e8;
              }

              .language-yaml .nt {
                font-weight: 600;
              }

              .language-yaml .l,
              .language-yaml .s,
              .language-yaml .s2 {
                color: #1a7f37 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }

              /* 确保环境变量在打印时清晰可见 */
              .language-yaml .l[data-content*="\${"] {
                color: #953800 !important;
                font-weight: 500;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }

              /* 保持缩进在打印时清晰可见 */
              .language-yaml .cl {
                white-space: pre-wrap;
                font-size: 9pt;
                line-height: 1.4;
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