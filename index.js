const puppeteer = require("puppeteer");
const fs = require("fs");
const async = require("async");
const PDFLib = require("pdf-lib");
const PDFDocument = PDFLib.PDFDocument;

// Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36
const userAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)";

const part = "astro-learn";
const ROOTURL = `https://docs.astro.build/zh-cn/`;
const rootURL = `https://docs.astro.build/zh-cn/getting-started/`;
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
  fs.writeFileSync(`${pdfDir}/${part}.pdf`, pdfBytes);
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
  // set user agent to prevent the website from blocking our request
  await page.setUserAgent(userAgent);
  await page.goto(url, { waitUntil: "networkidle0" });

  console.log(`Start scrolling ${url}...`)
  await autoScroll(page);
  console.log(`End scrolling ${url}...`)

  // Here we are using the `evaluate` method to modify the page's DOM.
  await page.evaluate(() => {
    // Select all the content outside the <article> tags and remove it.
    console.log("get article content...")
    document.body.innerHTML = document.querySelector("article").outerHTML;
  });

  const pdfName = url.split("/").filter(Boolean).pop();
  console.log(`Start saving ${pdfName}...`)

  const pdfPath = `${pdfDir}/${pdfName}.pdf`;
  await page.pdf({
    path: pdfPath,
    format: "A5",
    margin: { top: "2cm", right: "1cm", bottom: "2cm", left: "1cm" },
  });
  pdfDocs.push({ pdfPath, index });

  console.log(`Scraped ${visitedLinks.size} / ${queue.length()} urls`);

  await browser.close();
}

async function scrapeNavLinks(url) {
  try {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    // set user agent to prevent the website from blocking our request
    await page.setUserAgent(userAgent);
    // Wait until all page content is loaded, including images.
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.waitForSelector("aside");
  
    const navLinks = await getNavLinks(page);
    let index = 0;
    const _rootURL = ROOTURL;
    console.log("_rootURL", _rootURL)
    for (let link of navLinks) {
      const fullLink = new URL(link, _rootURL).href;
      if (fullLink.startsWith(_rootURL)) {
        queue.push({ url: fullLink, index: index++ });
      }
    }

    await browser.close();
    
  } catch (error) {
    console.error("出错了", error);
  }
}

async function getNavLinks(page) {
  const navlinks = await page.evaluate(async () => {
    const links = Array.from(document.querySelectorAll('aside a'));
    let navlinks = [];
    for (const link of links) {
      navlinks.push(link.href);
    }

    const startLink = 'https://docs.astro.build/zh-cn/getting-started/';
    // filter navlinks that only start with ROOTURL
    navlinks = navlinks.filter(link => link.startsWith(startLink) && link === startLink || !link.startsWith(startLink));
    return navlinks;
  });
  console.log("navlinks", navlinks);
  
  return navlinks;
}

createPdfsFolder();

scrapeNavLinks(rootURL).catch(console.error);
