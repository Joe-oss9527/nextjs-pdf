const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const fs = require("fs");
const async = require("async");
const PDFLib = require("pdf-lib");
const PDFDocument = PDFLib.PDFDocument;
const path = require("path");

const rootURL = "https://react.dev/learn";
let visitedLinks = new Set();
let pdfDocs = [];

const pdfDir = "./pdfs";

process.setMaxListeners(20); // Increase the limit to 20 or a value suitable for your application

function createPdfsFolder() {
  if (fs.existsSync(pdfDir)) {
    try {
      console.log(`Deleting ${pdfDir}...`);
      fs.rmSync(pdfDir, { recursive: true, force: true });
    } catch (err) {
      console.error(`Error while deleting ${pdfDir}.`, err);
    }
  }

  try {
    console.log(`Creating ${pdfDir}...`);
    fs.mkdirSync(pdfDir);
  } catch (err) {
    console.error(`Error while creating ${pdfDir}.`, err);
  }
}

const queue = async.queue(async function (task, callback) {
  const url = task.url;
  const index = task.index;

  if (visitedLinks.has(url)) {
    callback();
    return;
  }

  visitedLinks.add(url);

  await scrapePage(url, index);

  callback();
}, 15); // Limit the concurrency to 15.

queue.drain(async function () {
  console.log("All items have been processed");

  pdfDocs.sort((a, b) => a.index - b.index);

  const pdfDoc = await PDFDocument.create();
  for (let _pdfDoc of pdfDocs) {
    const { pdfPath } = _pdfDoc;
    const pdfBytes = fs.readFileSync(pdfPath);
    const srcPdfDoc = await PDFDocument.load(pdfBytes);

    const indices = srcPdfDoc.getPageIndices();

    const copiedPages = await pdfDoc.copyPages(srcPdfDoc, indices);
    for (let copiedPage of copiedPages) {
      pdfDoc.addPage(copiedPage);
    }
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(`${pdfDir}/react.dev-docs.pdf`, pdfBytes);
});

// 解决图片懒加载问题
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      var totalHeight = 0;
      var distance = 100;
      var timer = setInterval(() => {
        var scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

async function scrapePage(url, index) {
  const browser = await puppeteer.launch({
    headless: "old", // Using the old headless mode.
  });

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.waitForSelector("article");

  page.$eval("article", (element) => {
    // show more code
    // select all sp-layout tags which has no sp-layout-expanded class and click them
    element
      .querySelectorAll(".sp-layout:not(.sp-layout-expanded) button")
      .forEach((layout) => layout.click());
    // show more details
    // select all details tags which has no open attribute and click them
    element
      .querySelectorAll("details:not([open]) button")
      .forEach((detail) => detail.click());
    
    // select all buttons which has "Show solution" text and click them
    element
      .querySelectorAll("button")
      .forEach((button) => {
        if (button.textContent.trim() === "Show solution") {
          button.click();
        }
      });  

  });

  await autoScroll(page);

  // Here we are using the `evaluate` method to modify the page's DOM.
  await page.evaluate(() => {
    // Select all the content outside the <article> tags and remove it.
    document.body.innerHTML = document.querySelector("article").outerHTML;
  });

  const pdfPath = `${pdfDir}/${url.split("/").pop()}.pdf`;
  await page.pdf({
    path: pdfPath,
    format: "A4",
    margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" },
  });
  pdfDocs.push({ pdfPath, index });

  console.log(`Scraped ${visitedLinks.size} / ${queue.length()} urls`);

  await browser.close();
}

async function scrapeNavLinks(url) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  // Wait until all page content is loaded, including images.
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.waitForSelector("aside");

  const content = await page.content();
  const $ = cheerio.load(content);
  const navLinks = $("aside a");
  let index = 0;
  for (let i = 0; i < navLinks.length; i++) {
    const link = $(navLinks[i]).attr("href");
    const fullLink = new URL(link, rootURL).href;
    if (fullLink.startsWith(rootURL)) {
      queue.push({ url: fullLink, index: index++ });
    }
  }

  await browser.close();
}

createPdfsFolder();

scrapeNavLinks(rootURL).catch(console.error);
