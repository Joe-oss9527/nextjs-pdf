const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const async = require("async");
const PDFLib = require("pdf-lib");
const PDFDocument = PDFLib.PDFDocument;

const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const rootURL = "https://vuejs.org/guide/introduction";
const pdfDir = "./pdfs";

const MAX_CONCURRENCY = 10;

const visitedLinks = new Set();
const pdfDocs = [];

class Scraper {
  constructor() {
    this.browser = null;
    this.scrapedCount = 0;
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: "new", // Using the old headless mode.
    });
    this.scrapedCount = 0;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async scrapePage(url, index) {
    console.log("====================================");
    console.log("Start to scraping: ", "index: ", index, "url: ", url);
    console.log("====================================");
    const page = await this.browser.newPage();
    try {
      await page.setUserAgent(userAgent);
      // waitUntil: "networkidle0"; 可能会导致超时
      // await page.goto(url, { waitUntil: "networkidle0" });
      await page.goto(url);

      await this.autoScroll(page);

      await page.evaluate(() => {
        // Select all the content outside the <article> tags and remove it.
        document.body.innerHTML = document.querySelector("main").outerHTML;
      });

      const fileName = url
        .split("/")
        .filter((s) => s)
        .pop();
      console.log(`saving pdf: ${fileName}`);

      const pdfPath = `${pdfDir}/${fileName}.pdf`;
      await page.pdf({
        path: pdfPath,
        format: "A4",
        margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" },
      });
      pdfDocs.push({ pdfPath, index });

      console.log("====================================");
      console.log("End to scraping: ", "index: ", index, "url: ", url);
      console.log("====================================");
      console.log(`Scraped ${visitedLinks.size} / ${queue.length()} urls`);
    } catch (error) {
      console.log("====================================");
      console.log("Error: ", error);
      console.log("====================================");
    } finally {
      console.log("====================================");
      console.log("Close page: ", page.url());
      console.log("====================================");
      await page.close();
      this.scrapedCount++;
      console.log("====================================");
      console.log("Scraped page count: ", this.scrapedCount);
      console.log("====================================");
    }
  }

  async autoScroll(page) {
    console.log("====================================");
    console.log("Start to scroll page...", page.url());
    console.log("====================================");
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        const scrollHeight = document.body.scrollHeight;
        const distance = 100;
        const interval = 100;

        const timer = setInterval(() => {
          window.scrollBy(0, distance);

          if (window.scrollY + window.innerHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, interval);
      });
    });
  }
}

const scraper = new Scraper();

const queue = async.queue(async function (task, callback) {
  const url = task.url;
  const index = task.index;

  if (visitedLinks.has(url)) {
    callback && callback();
    return;
  }
  try {
    visitedLinks.add(url);
    await scraper.scrapePage(url, index);
    callback && callback();
  } catch (error) {
    console.log("====================================");
    console.log(`Error while scraping ${url}`, error);
    console.log("====================================");
    callback && callback();
  }
}, MAX_CONCURRENCY);

// assign an error callback
queue.error(function (err, task) {
  console.error("task experienced an error", err);
});

queue.drain(async function () {
  console.log("All items have been processed");
  console.log("====================================");
  console.log("Generate final pdf...");
  pdfDocs.sort((a, b) => a.index - b.index);

  const pdfDoc = await PDFDocument.create();
  for (let _pdfDoc of pdfDocs) {
    const { pdfPath } = _pdfDoc;
    const pdfBytes = await fs.readFile(pdfPath);
    const srcPdfDoc = await PDFDocument.load(pdfBytes);

    const indices = srcPdfDoc.getPageIndices();

    const copiedPages = await pdfDoc.copyPages(srcPdfDoc, indices);
    for (let copiedPage of copiedPages) {
      pdfDoc.addPage(copiedPage);
    }
  }

  const pdfBytes = await pdfDoc.save();
  await fs.writeFile(`${pdfDir}/vue-docs.pdf`, pdfBytes);
  console.log(
    "All pdfs have been merged",
    "the path is: ",
    `${pdfDir}/vue-docs.pdf`
  );

  await scraper.close();
});

async function createPdfsFolder() {
  try {
    console.log(`Deleting ${pdfDir}...`);
    await fs.rm(pdfDir, { recursive: true, force: true });
  } catch (err) {
    console.error(`Error while deleting ${pdfDir}.`, err);
  }

  try {
    console.log(`Creating ${pdfDir}...`);
    await fs.mkdir(pdfDir);
  } catch (err) {
    console.error(`Error while creating ${pdfDir}.`, err);
  }
}

async function scrapeNavLinks(url) {
  await scraper.initialize();

  const page = await scraper.browser.newPage();
  await page.setUserAgent(userAgent);
  await page.goto(url, { waitUntil: "networkidle0" });

  const allDocLinks = await page.evaluate(async () => {
    // get all the links under the element which has the attr "aria-labelledby="radix-:ri:"
    let allDocLinks = document.querySelectorAll(
      "aside a[href]:not([href='#'])"
    );

    let allDocUrls = new Set();
    allDocLinks.forEach((a) => {
      const link = a.href;
      if (link.includes("#")) {
        return;
      }
      allDocUrls.add(link);
    });

    return [...allDocUrls];
  });

  console.log("====================================");
  console.log(
    "All docs links: ",
    "total pages: ",
    allDocLinks.length,
    " ",
    allDocLinks
  );
  console.log("====================================");
  let index = 0;
  for (let link of allDocLinks) {
    queue.push({ url: link, index: index++ });
  }

  await page.close();
}

async function main() {
  await createPdfsFolder();
  await scrapeNavLinks(rootURL);
}

main().catch(console.error);
