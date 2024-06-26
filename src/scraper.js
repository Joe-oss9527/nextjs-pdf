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

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: 'new',
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

      return links.filter(link => !isIgnored(link, config.ignoreURLs));
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

      const title = await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        const h1 = element.querySelector('h1');
        return h1 ? h1.innerText : '';
      }, config.contentSelector);
      await saveArticleTitle(config.pdfDir, index, title);

      await setupImageLoadingObserver(page);
      
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

  async processTask(task) {
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
    for (const failure of failures) {
      await this.processTask(failure);
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