const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const async = require("async");
const PDFLib = require("pdf-lib");
const os = require("os");
const PDFDocument = PDFLib.PDFDocument;

const rootURL = "https://zed.dev/blog/tagged/featured";
const pdfDir = "./pdfs";

const MAX_CONCURRENCY = 1;

const visitedLinks = new Set();
const pdfDocs = [];

class Scraper {
  constructor() {
    this.browser = null;
  }

  async initialize() {
    // get current user directory
    const homeDir = os.homedir();
    console.log("====================================");
    console.log("homeDir: ", homeDir);
    console.log("====================================");

    // extension id
    const extensionId = "bpoadfkcbjbfhfodiogcnhhhpibjhbnh";
    const version = "1.1.8_1";
    // get the path to the extension of windows
    const pathToExtension = `${homeDir}/AppData/Local/Google/Chrome/User Data/Profile 3/Extensions/${extensionId}/${version}`;

    this.browser = await puppeteer.launch({
      // headless: "new", // Using the old headless mode.
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
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
      await page.goto(url);
      // await page.waitForSelector("article");

      await this.autoScroll(page);

      await page.evaluate(() => {
        // const details = document.querySelectorAll("details");
        // details.forEach((detail) => {
        //   detail.setAttribute("open", "true");
        // });

        // Select all the content outside the <article> tags and remove it.
        try {
          document.querySelector("header").remove();
        } catch (error) {}
        try {
          document.querySelector("footer").remove();
        } catch (error) {}
        try {
          document.body.innerHTML = document.querySelector("article").outerHTML;
        } catch (error) {}
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
      console.log("Error while scraping: ", url, error);
      console.log("====================================");
    }
  }

  async autoScroll(page) {
    try {
      await new Promise((resolve) => {
        setTimeout(resolve, 3000);
      });
      // Step 1 & 2: Access the shadow root of the host element
      const shadowHostSelector = "#immersive-translate-popup"; // Replace with your shadow host selector
      const shadowRoot = await page.evaluateHandle(
        (selector) => document.querySelector(selector).shadowRoot,
        shadowHostSelector
      );

      if (shadowRoot) {
        console.log("====================================");
        console.log("shadowRoot: ", shadowRoot);
        console.log("====================================");

        // Step 3: Find the target element in the shadow DOM
        const shadowElementSelector = ".immersive-translate-float-ball-btn"; // Replace with your selector inside shadow DOM
        const elementHandle = await shadowRoot.$(shadowElementSelector);

        if (elementHandle) {
          console.log("====================================");
          console.log("elementHandle: ", elementHandle);
          console.log("====================================");

          // Step 4: Click the element
          await elementHandle.click();

          await new Promise((resolve) => {
            setTimeout(resolve, 3000);
          });

          // hide the translate popup
          await page.evaluate(() => {
            document.querySelector("#immersive-translate-popup").style.display =
              "none";
          });
        }
      }
    } catch (error) {
      console.log("====================================");
      console.log("Error while opening translate popup: ", error);
      console.log("====================================");
    }

    await page.evaluate(async () => {
      await new Promise((resolve) => {
        const scrollHeight = document.body.scrollHeight;
        const distance = 100;
        const interval = 300;

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
  // add month and year to the pdf name
  const yearMonth = new Date().toISOString().slice(0, 7);
  await fs.writeFile(`${pdfDir}/${yearMonth}-zed-editor-blogs.pdf`, pdfBytes);
  console.log(
    "All pdfs have been merged",
    "the path is: ",
    `${pdfDir}/${yearMonth}-zed-editor-blogs.pdf`
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
    // document.querySelector("button[class^='navbar__toggle']").click();

    // wait for 1 second
    await delay(2000);

    const allDocLinks = document.querySelectorAll("div.w-full a");

    let allDocUrls = new Set();
    allDocLinks.forEach((a) => {
      if (a.href.includes("zed.dev/blog") && !a.href.includes("#")) {
        allDocUrls.add(a.href);
      }
    });

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
