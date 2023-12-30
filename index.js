const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const async = require("async");
const PDFLib = require("pdf-lib");
const PDFDocument = PDFLib.PDFDocument;

const rootURL = "https://nextjs.org/learn/dashboard-app";
const pdfDir = "./pdfs";

const MAX_CONCURRENCY = 15;

const visitedLinks = new Set();
const pdfDocs = [];

class Scraper {
  constructor() {
    this.browser = null;
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: "new", // Using the old headless mode.
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async scrapePage(url, index) {
    const page = await this.browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.waitForSelector("article");

    await this.autoScroll(page);

    await page.evaluate(() => {
      // const details = document.querySelectorAll("details");
      // details.forEach((detail) => {
      //   detail.setAttribute("open", "true");
      // });

      // Select all the content outside the <article> tags and remove it.
      document.body.innerHTML = document.querySelector("article").outerHTML;
    });

    console.log(`Scraping ${url}...`);
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

    console.log(`Scraped ${visitedLinks.size} / ${queue.length()} urls`);

    await page.close();
  }

  async autoScroll(page) {
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
    callback();
    return;
  }

  visitedLinks.add(url);

  await scraper.scrapePage(url, index);

  callback();
}, MAX_CONCURRENCY);

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
  await fs.writeFile(`${pdfDir}/nextjs-learn.pdf`, pdfBytes);
  console.log(
    "All pdfs have been merged",
    "the path is: ",
    `${pdfDir}/nextjs-learn.pdf`
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
  await page.goto(url, { waitUntil: "networkidle0" });

  const allDocLinks = await page.evaluate(async () => {
    // trigger the click event of the navbar toggle button
    // which is under the aside element
    // which id is end with "-trigger-nav"
    document.querySelector("aside button[aria-label='View Chapters']").click();

    // document.querySelector("button[class^='navbar__toggle']").click();

    // wait for 1 second
    await delay(2000);

    // get all the links under the element which has the attr "aria-labelledby="radix-:ri:"
    let allDocLinks = document.querySelectorAll(
      "div[role='dialog'] a[href]:not([href='#'])"
    );

    if (!allDocLinks) {
      allDocLinks = document.querySelectorAll(
        "aside [id$='-content-nav'] a[href]:not([href='#'])"
      );
    }

    let allDocUrls = [];
    allDocLinks.forEach((a) => {
      allDocUrls.push(a.href);
    });
    
    return allDocUrls;

    function delay(time) {
      return new Promise(function (resolve) {
        setTimeout(resolve, time);
      });
    }
  });

  console.log("====================================");
  console.log("All docs links: ", allDocLinks);
  console.log("====================================");
  let index = 0;
  for (let link of allDocLinks) {
    queue.push({ url: link, index: index++ });
  }
}

async function main() {
  await createPdfsFolder();
  await scrapeNavLinks(rootURL);
}

main().catch(console.error);
