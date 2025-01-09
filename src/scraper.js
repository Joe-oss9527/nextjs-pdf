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
    this.processedUrls = new Set();
  }

  normalizeUrl(url) {
    try {
      return url.split('#')[0];
    } catch (e) {
      console.warn(`Invalid URL: ${url}`);
      return url;
    }
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
      const links = await page.evaluate((selector) => {
        return Array.from(document.querySelectorAll(selector))
          .map(el => el.href)
          .filter(href => href && !href.startsWith('#'));
      }, config.navLinksSelector);

      const uniqueLinks = [...new Set(links.map(link => this.normalizeUrl(link)))]
        .filter(link => !isIgnored(link, config.ignoreURLs));
      return uniqueLinks;
    } finally {
      await page.close();
    }
  }

  async scrapePage(url, index) {
    const page = await this.browser.newPage();
    try {
      console.log(`Scraping page: ${url}`);
      await page.setViewport({
        width: 1280,
        height: 800
      });

      await page.goto(url, { 
        waitUntil: ['networkidle0', 'domcontentloaded'],
        timeout: config.pageTimeout 
      });

      await page.evaluate(() => {
        const htmlElement = document.documentElement;
        if (htmlElement.classList.contains('dark')) {
          htmlElement.classList.remove('dark');
        }
        const vpSwitch = document.querySelector('.VPSwitch');
        if (vpSwitch) {
          const input = vpSwitch.querySelector('input[type="checkbox"]');
          if (input && input.checked) {
            input.click();
          }
        }
        document.querySelectorAll('.shiki.github-dark, .shiki.vitesse-dark, pre.shiki').forEach(block => {
          block.classList.remove('github-dark', 'vitesse-dark', 'vp-code-dark');
          block.classList.add('github-light', 'vp-code-light');
          
          block.style.backgroundColor = '#ffffff';
          block.style.color = '#1f2328';

          const codeParent = block.closest('.vp-code');
          if (codeParent) {
            codeParent.style.backgroundColor = '#ffffff';
          }
          
          block.querySelectorAll('span[style*="color:#"]').forEach(span => {
            const color = span.style.color.toUpperCase();
            switch (color) {
              case '#E1E4E8': 
              case '#A6ACCD': span.style.color = '#1F2328'; break;
              case '#F97583':
              case '#89DDFF': span.style.color = '#CF222E'; break;
              case '#B392F0':
              case '#82AAFF': span.style.color = '#8250DF'; break;
              case '#9ECBFF':
              case '#89DDFF': span.style.color = '#0550AE'; break;
              case '#79B8FF':
              case '#89DDFF': span.style.color = '#0550AE'; break;
              case '#FFAB70': span.style.color = '#953800'; break;
              default: span.style.color = '#1F2328'; break;
            }
          });
        });
      });

      await page.waitForSelector('main', {
        timeout: config.pageTimeout
      });

      await page.evaluate(() => {
        document.querySelectorAll('.vp-code-group button').forEach(btn => btn.click());
      });

      const title = await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        const h1 = element.querySelector('h1');
        return h1 ? h1.innerText : '';
      }, config.contentSelector);
      await saveArticleTitle(config.pdfDir, index, title);

      await setupImageLoadingObserver(page);

      // delay before taking the screenshot
      await delay(config.screenshotDelay);
      
      await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        element.innerHTML = element.innerHTML;  // This removes event listeners
        document.body.innerHTML = element.outerHTML;
      }, config.contentSelector);

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(1000);  // Short delay after scrolling
      
      await waitForImagesWithTimeout(page, config.imageTimeout);
      
      const allImagesLoaded = await checkAllImagesLoaded(page);
      if (!allImagesLoaded) {
        console.warn(`Not all images loaded for: ${url}`);
        this.imageLoadFailures.add(url);
        await logImageLoadFailure(config.pdfDir, url, index);
      }

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
    const { url, index } = task;
    const normalizedUrl = this.normalizeUrl(url);
    
    if (this.processedUrls.has(normalizedUrl)) {
      console.log(`Skipping duplicate URL: ${url}`);
      return;
    }
    
    this.processedUrls.add(normalizedUrl);

    if (!this.browser || this.browser.isConnected() === false) {
      await this.initialize(headless);
    }

    let retries = 0;
    while (retries < config.maxRetries) {
      try {
        await this.scrapePage(url, index);
        break;
      } catch (error) {
        retries++;
        console.warn(`Attempt ${retries} failed for ${url}:`, error.message);
        if (retries < config.maxRetries) {
          await delay(config.retryDelay * retries);
        } else {
          await logFailedLink(config.pdfDir, url, index, error);
        }
      }
    }
    
    const completed = (this.processedUrls.size / this.totalLinks) * 100;
    console.log(`Completed: ${completed.toFixed(2)}%, total: ${this.totalLinks}, current: ${this.processedUrls.size}`);
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