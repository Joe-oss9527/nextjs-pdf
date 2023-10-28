const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const fs = require("fs");
const async = require("async");
const PDFLib = require("pdf-lib");
const PDFDocument = PDFLib.PDFDocument;
const path = require("path");

// Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36
const userAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)";

const part = "nextjs-learn";
const ROOTURL = `https://nextjs.org/learn/dashboard-app`;
const rootURL = `https://nextjs.org/learn/foundations/about-nextjs`;
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
  // const proxyAddress = 'http://127.0.0.1:7890'; // 替换成你的代理地址和端口
  const browser = await puppeteer.launch({
    headless: "old", // Using the old headless mode.
    // args: [`--proxy-server=${proxyAddress}`], // Pass the proxy address here.
  });

  const page = await browser.newPage();
  // set user agent to prevent the website from blocking our request
  await page.setUserAgent(userAgent);
  await page.goto(url, { waitUntil: "networkidle0" });
  // const articleSelector = "main";
  // await page.waitForSelector(articleSelector);

  await autoScroll(page);

  // Here we are using the `evaluate` method to modify the page's DOM.
  await page.evaluate(() => {
    // Select all the content outside the <article> tags and remove it.
    document.body.innerHTML = document.querySelector(".lesson-area").outerHTML;
  });

  const pdfPath = `${pdfDir}/${url.split("/").pop()}.pdf`;
  await page.pdf({
    path: pdfPath,
    format: "A4",
    margin: { top: "2cm", right: "1cm", bottom: "2cm", left: "1cm" },
  });
  pdfDocs.push({ pdfPath, index });

  console.log(`Scraped ${visitedLinks.size} / ${queue.length()} urls`);

  await browser.close();
}



async function scrapeNavLinks(url) {
  console.log("scrapeNavLinks", url)
  try {
    const proxyAddress = 'http://127.0.0.1:7890'; // 替换成你的代理地址和端口
    const browser = await puppeteer.launch({ headless: false,
    args: [`--proxy-server=${proxyAddress}`], // Pass the proxy address here.
    });
    const page = await browser.newPage();
    // set user agent to prevent the website from blocking our request
    await page.setUserAgent(userAgent);
    // Wait until all page content is loaded, including images.
    await page.goto(url, { waitUntil: "networkidle0" });
    // await page.waitForSelector(".navigation-area");

    // click the buttion with the id `radix-:r1g:-content-nav`
    // Click the button with the specified id radix-:r1g:-trigger-nav
    await page.click('button#radix-\\:r1g\\:-trigger-nav');
    // wait a second
     await new Promise(r => setTimeout(r, 1000));

    console.log(1111)
  
    // const navLinks = await getNavLinks(page);
    const navTopLinks = await getTopNavLinks(page);
    console.log('navT', navTopLinks)
    // console.log("navTopLinks", navTopLinks);
    const allNavLinks = []
    for(let navTopLink of navTopLinks) {
      const navSubLinks = await getSubNavLinks(navTopLink);
      console.log("navSubLinks", navSubLinks);
      allNavLinks.push(...navSubLinks);
    }
    
    let index = 0;
    const _rootURL = ROOTURL;
    console.log("_rootURL", _rootURL)
    for (let link of allNavLinks) {
      const fullLink = new URL(link, _rootURL).href;
      // console.log("fullLink", fullLink)
      if (fullLink.startsWith(_rootURL)) {
        queue.push({ url: fullLink, index: index++ });
      }
    }
    await browser.close();

  } catch (error) {
    console.error("出错了", error);
  }
}

async function getTopNavLinks(page) {
  const navlinks = await page.evaluate(async () => {
    const links = Array.from(document.querySelectorAll('div#radix-\\:r1g\\:-content-nav a'));

    let navlinks = [];
    for (const link of links) {
      navlinks.push(link.href);
    }
    // navlinks = navlinks.filter((link) => link.includes("learn")).filter((link) => !link.includes("what-is-nextjs"));
    return navlinks;
  });

  console.log('navlinks', navlinks)
  
  return navlinks;
}

async function getSubNavLinks(topNavLink) {
  try {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    // set user agent to prevent the website from blocking our request
    await page.setUserAgent(userAgent);
    // Wait until all page content is loaded, including images.
    await page.goto(topNavLink, { waitUntil: "networkidle0" });
    await page.waitForSelector(".navigation-area");
  
    // get element node whick href is topNavLink
    const navlinks = await page.evaluate(async (topNavLink) => {
      // get the node which href is href="/learn/foundations/about-nextjs"
      const anchor = document.querySelector(`a[href="${topNavLink.replace("https://nextjs.org", "")}"]`);
      // get the parent node of the node
      const parent = anchor.parentNode;
      // get the sublinks
      const sublinks = Array.from(parent.querySelectorAll("ul a"));
      return sublinks.map((link) => link.href);
    }, topNavLink);
    
    await browser.close();

    return navlinks;
    
  } catch (error) {
    console.error("出错了", error);
  }
}

createPdfsFolder();

scrapeNavLinks(ROOTURL).catch(console.error);
