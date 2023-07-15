const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const fs = require("fs");
const async = require("async");
const PDFLib = require("pdf-lib");
const PDFDocument = PDFLib.PDFDocument;
const path = require("path");

// Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36
const userAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)";

const part = "about";
const rootURL = `https://www.prisma.io/docs/${part}`;
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
  fs.writeFileSync(`${pdfDir}/prisma-${part}.pdf`, pdfBytes);
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
  await page.waitForSelector("article");

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

function addLinksToQueue(links, index) {
  for (let link of links) {
    const fullLink = new URL(link.href, rootURL).href;
    if (fullLink.startsWith(rootURL)) {
      queue.push({ url: fullLink, index: index++ });
      addLinksToQueue(link.sublinks, index);
    }
  }
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
    addLinksToQueue(navLinks, index);

    await browser.close();
    
  } catch (error) {
    console.error("出错了", error);
  }
}

async function getNavLinks(page) {
  const navlinks = await page.evaluate(async () => {
    const links = Array.from(document.querySelectorAll('aside a'));
    const navlinks = [];

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const getSublinks = async (link) => {
      // get the button element under the link
      const button = link.querySelector('button.item-collapser');
      if (!button) return [];

      button.click();

      await delay(1000); // Adjust the delay as needed to wait for sublinks to appear

      if (!link.nextElementSibling) return [];

      const sublinks = Array.from(link.nextElementSibling.querySelectorAll('ul a'));
    
      const sublinkObjects = [];

      for (const sublink of sublinks) {
        const _subLinks = await getSublinks(sublink);
        sublinkObjects.push({
          text: sublink.innerText,
          href: sublink.href,
          sublinks: _subLinks,
        });
        console.log(sublink.innerText, sublink.href);
      }

      return sublinkObjects;
    };

    for (const link of links) {
      const navlink = {
        text: link.innerText,
        href: link.href,
        sublinks: [],
      };

      const sublinks = await getSublinks(link);
      navlink.sublinks = sublinks;

      console.log(link.innerText, link.href);

      navlinks.push(navlink);
    }

    return navlinks;
  });

  return navlinks;
}

createPdfsFolder();

scrapeNavLinks(rootURL).catch(console.error);
