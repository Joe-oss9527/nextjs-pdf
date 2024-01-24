const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const async = require("async");
const PDFLib = require("pdf-lib");
const PDFDocument = PDFLib.PDFDocument;

const rootURL = "https://vercel.com/guides";
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
      // headless: "new", // Using the old headless mode.
      headless: false
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async scrapePage(url, index) {
    try {
      const page = await this.browser.newPage();
      await page.goto(url, { waitUntil: "networkidle0" });

      await this.autoScroll(page);

      await page.evaluate(() => {
       // hide the header which class name starts with "top-header"
       // check if the element exists
        const topHeader = document.querySelector("div[class^='top-header']");
        if (topHeader) {
          topHeader.style.display = "none";
        }

        // hide the header which class name starts with "guides_breadcrumb__"
        // check if the element exists
        const guidesBreadcrumb = document.querySelector(
          "div[class^='guides_breadcrumb__']"
        );
        if (guidesBreadcrumb) {
          guidesBreadcrumb.style.display = "none";
        }

        // hide the header which class name starts with "guides_contactWrapper__"
        // check if the element exists
        const guidesContactWrapper = document.querySelector(
          "div[class^='guides_contactWrapper__']"
        );
        if (guidesContactWrapper) {
          guidesContactWrapper.style.display = "none";
        }

        // hide the footer which class name starts with "footer"
        // check if the element exists
        const footer = document.querySelector("footer[class^='footer']");
        if (footer) {
          footer.style.display = "none";
        }

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
    } catch (error) {
      console.log("====================================");
      console.log("Error while scraping: ", url);
      console.log("====================================");
    }
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

const queue = async.queue(async function (task, callback = () => {}) {
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
  // add year month and day to the pdf name
  const yearMonthDay = new Date().toISOString().split("T")[0];
  const pdfFileName = `${pdfDir}/${yearMonthDay}-nextjs-guides.pdf`;
  await fs.writeFile(pdfFileName, pdfBytes);
  console.log("All pdfs have been merged", "the path is: ", pdfFileName);

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

  await scraper.autoScroll(page);

  const allDocLinks = await page.evaluate(async () => {
    // guides_guideListWrapper__
    // query the container element that class name starts with "guides_guideListWrapper__"
    const guideListWrapper = document.querySelector(
      "div[class*='guides_guideListWrapper__']"
    );

    if (!guideListWrapper) {
      return [];
    }

    // click the button 10 times which has the text content "See more guides" to load recently blog posts
    for (let i = 0; i < 10; i++) {
      const seeMoreGuidesButton = guideListWrapper.querySelector(
        "button[class*='guides_buttonRowContainer']"
      );
      if (seeMoreGuidesButton) {
        seeMoreGuidesButton.click();
      }
      await delay(1000);
    }

    // wait for 1 second
    await delay(2000);

   
    // query all the links inside the blogPosts element that class name starts with "blog_readMore"
    const blogReadMoreLinks = guideListWrapper.querySelectorAll(
      "a[href^='/guides/']"
    );

    const allDocLinks = blogReadMoreLinks;

    let allDocUrls = new Set();

    for (let a of allDocLinks) {
      allDocUrls.add(a.href);
    }

    return [...allDocUrls];

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
