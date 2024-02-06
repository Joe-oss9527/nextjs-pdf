const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const async = require("async");
const PDFLib = require("pdf-lib");
const PDFDocument = PDFLib.PDFDocument;

const rootURL = "https://nextjs.org/docs";
const pdfDir = "./pdfs";

const MAX_CONCURRENCY = 15;

const visitedLinks = new Set();
const pdfDocs = [];

async function checkDirectoryExists(dirPath) {
  try {
    console.log(`Checking if ${dirPath} exists...`);
    await fs.access(dirPath);
    console.log(`${dirPath} exists.`);
    return true;
  } catch (error) {
    return false;
  }
}

// // Usage
// checkDirectoryExists('./pdfs')
//   .then(exists => console.log(exists ? 'Directory exists' : 'Directory does not exist'))
//   .catch(console.error);

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
    try {
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

      let fullFileName = `${pdfDir}/${fileName}.pdf`;

      if (url.includes("/app/") || url.includes("/pages/")) {
        console.log("====================================");
        console.log("App url: ", url);
        console.log("====================================");
        // create subfolder which is under the app or pages
        const splitter = url.includes("/app/") ? "/app/" : "/pages/";
        const subFolderName = url.split(splitter)[1].split("/")[0];
        const prefix = url.includes("/app/") ? "app" : "pages";
        const appDir = `${pdfDir}/${prefix}-${subFolderName}`;

        try {
          // check if the directory exists
          const checkDir = await checkDirectoryExists(appDir);
          if (!checkDir) {
            console.log(`Creating ${appDir}...`);
            await fs.mkdir(appDir);
          } else {
            console.log(`Directory ${appDir} already exists.`);
          }
        } catch (err) {
          fullFileName = `${appDir}/${fileName}.pdf`;
          console.error(`Error while creating ${appDir}.`, err);
        }
      } else {
        console.log("====================================");
        console.log("Getting started url: ", url);
        console.log("====================================");
        // create subfolder for getting started
        // const gettingStartedDir = `${pdfDir}/getting-started`;
        // create subfolder which is under the app
        const subFolderName = url.split("/docs/")[1].split("/")[0];
        const appDir = `${pdfDir}/${subFolderName}`;
        const gettingStartedDir = appDir;


        try {
          // check if the directory exists
          const checkDir = await checkDirectoryExists(gettingStartedDir);
          if (!checkDir) {
            console.log(`Creating ${gettingStartedDir}...`);
            await fs.mkdir(gettingStartedDir);
          } else {
            console.log(`Directory ${gettingStartedDir} already exists.`);
          }
        } catch (err) {
          fullFileName = `${gettingStartedDir}/${fileName}.pdf`;
          console.error(`Error while creating ${gettingStartedDir}.`, err);
        }
      }

      const pdfPath = fullFileName;
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

  await generatePdfFromSubDir();

  await scraper.close();
});

async function mergePdfs(subFolderName, finalPdfPath) {
  const _pdfDocs = pdfDocs.filter((pdfDoc) =>
    pdfDoc.pdfPath.includes(subFolderName)
  );
  _pdfDocs.sort((a, b) => a.index - b.index);

  const pdfDoc = await PDFDocument.create();
  for (let _pdfDoc of _pdfDocs) {
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
  
  await fs.writeFile(finalPdfPath, pdfBytes);
  console.log(
    "All pdfs have been merged",
    "the path is: ",
    finalPdfPath
  );
}

async function generatePdfFromSubDir() {
  // loop the subfolders and merge the pdfs
  // get all the subfolders
  const subFolders = await fs.readdir(pdfDir, { withFileTypes: true });
  for (let subFolder of subFolders) {
    if (subFolder.isDirectory()) {
      const subFolderName = subFolder.name;
      // const subFolderFiles = await fs.readdir(`${pdfDir}/${subFolderName}`);
      // const subFolderPdfDocs = subFolderFiles.filter((file) =>
      //   file.endsWith(".pdf")
      // );
      const yearMonthDay = new Date().toISOString().split("T")[0];

      const finalPdfPath = `${pdfDir}/${yearMonthDay}-${subFolderName}-nextjs-docs.pdf`;

      await mergePdfs(subFolderName, finalPdfPath);
    }
  }
}
      
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

    const allDocLinks = document.querySelectorAll(
      "main nav.styled-scrollbar a[href]:not([href='#'])"
    );

    let allDocUrls = new Set();
    allDocLinks.forEach((a) => {
      allDocUrls.add(a.href);
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
