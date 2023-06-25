const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdf-lib").PDFDocument;
const PDFMerger = require("pdf-merger-js");
const queue = require("async/queue");

const rootURL = "https://nextjs.org/docs";

const pdfDocs = [];

async function scrapePage({ url, index }) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.waitForSelector("article");

  const pdfPath = `./pdfs/${path.basename(url)}.pdf`;
  await page.pdf({ path: pdfPath, format: "A4" });

  await browser.close();

  return { pdfPath, index };
}

async function scrapeNavLinks(url) {
  const pdfDir = "./pdfs";
  if (fs.existsSync(pdfDir)) {
    try {
      fs.rmSync(pdfDir, { recursive: true, force: true });
    } catch (err) {
      console.error(`Error while deleting ${pdfDir}.`, err);
    }
  }

  try {
    fs.mkdirSync(pdfDir);
  } catch (err) {
    console.error(`Error while creating ${pdfDir}.`, err);
  }

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.waitForSelector("main nav.docs-scrollbar");

  const content = await page.content();
  const $ = cheerio.load(content);

  const navLinks = $("main nav.docs-scrollbar a");
  let index = 0;

  const isUsingAppRouter = $('main button[role="combobox"]').text();
  let inTargetCategory = isUsingAppRouter.indexOf("Using App Router") > -1;
  if (inTargetCategory) {
    for (let i = 0; i < navLinks.length; i++) {
      const link = $(navLinks[i]).attr("href");
      const fullLink = new URL(link, rootURL).href;
      if (fullLink.startsWith(rootURL)) {
        queue.push({ url: fullLink, index: index++ }, function (err, result) {
          if (err) {
            console.log(err);
          } else {
            pdfDocs.push(result);
            console.log(`Finished scraping ${fullLink}`);
          }
        });
      }
    }
  }

  await browser.close();
}

const q = queue(scrapePage, 5);

q.drain(async function () {
  console.log("All pages have been scraped.");

  const merger = new PDFMerger();

  pdfDocs.sort((a, b) => a.index - b.index);

  for (let i = 0; i < pdfDocs.length; i++) {
    merger.add(pdfDocs[i].pdfPath);
  }

  await merger.save("merged.pdf");
  console.log("PDFs have been merged.");
});

scrapeNavLinks(rootURL).catch(console.error);
