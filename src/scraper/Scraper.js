// src/scraper/Scraper.js
const puppeteer = require('puppeteer');
const asyncLib = require('async');
const { getConfig } = require('../config/configLoader');
const { 
  delay, 
  normalizeUrl, 
  isAllowedDomain, 
  isIgnored,
  withRetry,
  createProgressTracker 
} = require('../utils');
const {
  getPdfPath,
  ScrapingStateManager,
  FailedLinksManager,
  ArticleTitlesManager,
  ImageLoadFailuresManager
} = require('../utils/fileUtils');
const { setupImageLoadingObserver, waitForImagesWithTimeout } = require('../imageHandler');

/**
 * 网页爬虫类
 */
class Scraper {
  constructor() {
    this.config = getConfig();
    this.browser = null;
    this.processedUrls = new Set();
    this.urlQueue = new Map(); // URL -> index 映射
    this.progressTracker = null;
    
    // 文件管理器
    this.stateManager = new ScrapingStateManager(this.config.pdfDir);
    this.failedLinksManager = new FailedLinksManager(this.config.pdfDir);
    this.articleTitlesManager = new ArticleTitlesManager(this.config.pdfDir);
    this.imageFailuresManager = new ImageLoadFailuresManager(this.config.pdfDir);
    
    // 创建任务队列
    this.queue = asyncLib.queue(
      this.processTask.bind(this),
      this.config.concurrency
    );
    
    // 队列错误处理
    this.queue.error((error, task) => {
      console.error(`Queue error for ${task.url}:`, error.message);
    });
  }
  
  /**
   * 初始化浏览器
   * @param {boolean} headless - 是否无头模式
   */
  async initialize(headless = true) {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ];
    
    if (!headless) {
      args.push('--start-maximized');
    }
    
    this.browser = await puppeteer.launch({
      headless: headless ? 'new' : false,
      defaultViewport: headless ? { width: 1920, height: 1080 } : null,
      args
    });
  }
  
  /**
   * 关闭浏览器和清理资源
   */
  async close() {
    if (this.queue) {
      this.queue.kill();
    }
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    
    // 保存最终状态
    await this.stateManager.finalize();
  }
  
  /**
   * 创建新页面（带有通用设置）
   */
  async createPage() {
    const page = await this.browser.newPage();
    
    // 设置用户代理
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );
    
    // 阻止不必要的资源加载（但保留图片）
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (['font', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });
    
    return page;
  }
  
  /**
   * 爬取导航链接
   * @returns {Promise<string[]>} - 去重后的链接数组
   */
  async scrapeNavLinks() {
    console.log('Scraping navigation links...');
    const page = await this.createPage();
    
    try {
      await page.goto(this.config.rootURL, {
        waitUntil: 'networkidle0',
        timeout: this.config.pageTimeout
      });
      
      // 等待导航加载
      await page.waitForSelector(this.config.navLinksSelector, {
        timeout: this.config.pageTimeout
      });
      
      // 提取所有链接
      const rawLinks = await page.evaluate((selector) => {
        return Array.from(document.querySelectorAll(selector))
          .map(el => el.href)
          .filter(href => href && !href.startsWith('#'));
      }, this.config.navLinksSelector);
      
      console.log(`Found ${rawLinks.length} raw links`);
      
      // 规范化和去重
      const normalizedLinks = rawLinks.map(link => normalizeUrl(link));
      const uniqueLinks = [...new Set(normalizedLinks)];
      
      console.log(`After normalization and deduplication: ${uniqueLinks.length} links`);
      
      // 过滤：只保留允许域名的链接
      const domainFilteredLinks = uniqueLinks.filter(link => 
        isAllowedDomain(link, this.config.allowedDomain)
      );
      
      console.log(`After domain filtering: ${domainFilteredLinks.length} links`);
      
      // 过滤：移除忽略的URL
      const finalLinks = domainFilteredLinks.filter(link => 
        !isIgnored(link, this.config.ignoreURLs)
      );
      
      console.log(`After ignore patterns: ${finalLinks.length} links`);
      
      return finalLinks;
      
    } finally {
      await page.close();
    }
  }
  
  /**
   * 爬取单个页面
   * @param {string} url - 页面URL
   */
  async scrapePage(url) {
    // 检查是否已处理
    if (this.processedUrls.has(url)) {
      console.log(`Skipping already processed URL: ${url}`);
      return;
    }
    
    const page = await this.createPage();
    
    try {
      console.log(`Scraping: ${url}`);
      this.processedUrls.add(url);
      
      // 导航到页面
      await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: this.config.pageTimeout
      });
      
      // 等待内容加载
      await page.waitForSelector(this.config.contentSelector, {
        timeout: this.config.pageTimeout
      });
      
      // 提取并保存标题
      const title = await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        const h1 = element?.querySelector('h1');
        return h1?.innerText || document.title || 'Untitled';
      }, this.config.contentSelector);
      
      await this.articleTitlesManager.saveTitle(url, title);
      console.log(`Page title: ${title}`);
      
      // 设置图片加载观察器
      await setupImageLoadingObserver(page);
      
      // 延迟以确保初始渲染完成
      await delay(this.config.screenshotDelay);
      
      // 隔离内容区域
      await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (element) {
          // 移除所有事件监听器
          const cloned = element.cloneNode(true);
          document.body.innerHTML = '';
          document.body.appendChild(cloned);
        }
      }, this.config.contentSelector);
      
      // 滚动到底部触发懒加载
      await page.evaluate(() => {
        return new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 300;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;
            
            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });
      
      // 等待图片加载
      await waitForImagesWithTimeout(page, this.config.imageTimeout);
      
      // 检查图片加载状态
      const allImagesLoaded = await page.evaluate(() => {
        const images = Array.from(document.querySelectorAll('img'));
        return images.every(img => {
          if (!img.src && !img.dataset.src) return true;
          return img.complete && img.naturalWidth > 0;
        });
      });
      
      if (!allImagesLoaded) {
        console.warn(`Not all images loaded for: ${url}`);
        await this.imageFailuresManager.addFailure(url);
      }
      
      // 生成PDF
      const pdfPath = await getPdfPath(url, this.config.pdfDir);
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        margin: {
          top: '1cm',
          right: '1cm',
          bottom: '1cm',
          left: '1cm'
        },
        printBackground: true,
        preferCSSPageSize: true
      });
      
      console.log(`✓ Saved PDF: ${pdfPath}`);
      
      // 标记为成功处理
      await this.stateManager.markAsProcessed(url, true);
      this.progressTracker?.success();
      
    } catch (error) {
      console.error(`✗ Error scraping ${url}:`, error.message);
      await this.failedLinksManager.addFailedLink(url, error);
      await this.stateManager.markAsProcessed(url, false);
      this.progressTracker?.failure();
      throw error;
      
    } finally {
      await page.close();
    }
  }
  
  /**
   * 处理单个任务（带重试）
   * @param {Object} task - 任务对象 {url, index}
   */
  async processTask(task) {
    const { url } = task;
    
    // 包装爬取函数以支持重试
    const scrapeWithRetry = withRetry(
      () => this.scrapePage(url),
      this.config.maxRetries,
      this.config.retryDelay,
      (error, attempt, maxRetries) => {
        console.log(`Retry ${attempt}/${maxRetries} for ${url}`);
      }
    );
    
    try {
      await scrapeWithRetry();
    } catch (error) {
      console.error(`Failed after ${this.config.maxRetries} retries: ${url}`);
    }
  }
  
  /**
   * 重试图片加载失败的页面
   */
  async retryImageLoadFailures() {
    const failedUrls = await this.imageFailuresManager.getUniqueFailures();
    
    if (failedUrls.length === 0) {
      console.log('No image load failures to retry');
      return;
    }
    
    console.log(`\nRetrying ${failedUrls.length} pages with image load failures...`);
    
    // 使用非无头模式重试
    await this.close();
    await this.initialize(false);
    
    const retryTracker = createProgressTracker(failedUrls.length, 'Image Retry');
    
    for (const url of failedUrls) {
      try {
        await this.scrapePage(url);
        retryTracker.success();
      } catch (error) {
        retryTracker.failure();
      }
    }
  }
  
  /**
   * 运行爬虫
   */
  async run() {
    try {
      console.log('Starting web scraper...\n');
      
      // 初始化浏览器
      await this.initialize();
      
      // 获取所有链接
      const links = await this.scrapeNavLinks();
      
      if (links.length === 0) {
        console.log('No links found to scrape');
        return;
      }
      
      // 初始化进度跟踪
      this.progressTracker = createProgressTracker(links.length, 'Scraping');
      await this.stateManager.setTotalUrls(links.length);
      
      // 构建URL队列
      links.forEach((url, index) => {
        this.urlQueue.set(url, index);
        this.queue.push({ url, index });
      });
      
      console.log(`\nStarting to scrape ${links.length} pages...\n`);
      
      // 等待队列完成
      await new Promise((resolve) => {
        this.queue.drain(() => {
          console.log('\nAll pages processed');
          resolve();
        });
      });
      
      // 获取统计信息
      const stats = this.progressTracker.getStats();
      console.log('\n=== Scraping Summary ===');
      console.log(`Total: ${stats.total}`);
      console.log(`Success: ${stats.completed} (${(stats.successRate * 100).toFixed(1)}%)`);
      console.log(`Failed: ${stats.failed}`);
      console.log(`Time: ${Math.round(stats.elapsedTime / 1000)}s`);
      
      // 重试图片加载失败的页面
      await this.retryImageLoadFailures();
      
      console.log('\nScraping completed!');
      
    } catch (error) {
      console.error('Fatal error during scraping:', error);
      throw error;
      
    } finally {
      await this.close();
    }
  }
}

module.exports = Scraper;