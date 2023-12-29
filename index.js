const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const fs = require("fs");
const async = require("async");
const PDFLib = require("pdf-lib");
const PDFDocument = PDFLib.PDFDocument;

const rootURL = "https://stylexjs.com/docs/learn/";
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
  fs.writeFileSync(`${pdfDir}/stylex-docs.pdf`, pdfBytes);
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
    headless: "new", // Using the old headless mode.
  });

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.waitForSelector("article");

  await autoScroll(page);

  // Here we are using the `evaluate` method to modify the page's DOM.
  await page.evaluate(() => {
    // Select all the content outside the <article> tags and remove it.
    // document.body.innerHTML = document.querySelector("article").outerHTML;

    // details  标签默认是关闭的，需要手动打开
    const details = document.querySelectorAll("details");
    details.forEach((detail) => {
      detail.setAttribute("open", "true");
    });

    // hide the header
    // document.querySelector("header").style.display = "none";
    // // hide the footer
    // document.querySelector("footer").style.display = "none";
    // // hide the sidebar
    // document.querySelector("aside").style.display = "none";
    // // hide the navbar
    // document.querySelector("nav").style.display = "none";
    // // hide the button of 'theme-back-to-top-button'
    // document.querySelector(".theme-back-to-top-button").style.display = "none";
    // // hide the .theme-doc-toc-desktop
    // document.querySelector(".theme-doc-toc-desktop").style.display = "none";
  });

  console.log(`Scraping ${url}...`);
  const fileName = url.split("/").filter((s) => s).pop();
  console.log(`saving pdf: ${fileName}`);

  const pdfPath = `${pdfDir}/${fileName}.pdf`;
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
  const browser = await puppeteer.launch({
    headless: "new",
  });
  const page = await browser.newPage();
  // Wait until all page content is loaded, including images.
  await page.goto(url, { waitUntil: "networkidle0" });

  const allLinks = await page.evaluate(async () => {
    // Select all the content outside the <article> tags and remove it.
    document.querySelector("button[class^='navbar__toggle']").click();

    // wait for 1 second
    await delay(2000);

    const categoryButtons = document.querySelectorAll(
      ".theme-doc-sidebar-item-category"
    );

    let results = [];
    categoryButtons.forEach((button) => {
      // 点击没有展开时，可能是选择的子元素不对
      const a = button.querySelector("a");
      if (a) {
        a.click();
      }
    });
    const list = document.querySelectorAll(
      ".theme-doc-sidebar-menu a[href]:not([href='#'])"
    );
    list.forEach((a) => {
      results.push(a.href);
    });
    return results;
    function delay(time) {
      return new Promise(function (resolve) {
        setTimeout(resolve, time);
      });
    }
  });
  console.log("all links: ", allLinks);

  let index = 0;
  for (let link of allLinks) {
    queue.push({ url: link, index: index++ });
  }

  await browser.close();
}

createPdfsFolder();

scrapeNavLinks(rootURL).catch(console.error);
