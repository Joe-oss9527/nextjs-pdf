const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const async = require('async');

const rootURL = 'https://nextjs.org/docs';
let visitedLinks = {};

const crawl = async (url) => {
  if (visitedLinks[url]) {
    return;
  }
  
  visitedLinks[url] = true;

  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    
    const links = $("a").map((i, link) => {
      const href = $(link).attr('href');
      if (href.startsWith(rootURL) && !visitedLinks[href]) {
        return href;
      }
    }).get();

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url);
    await page.pdf({ path: `${url.split('/').pop()}.pdf`, format: 'A4', printBackground: true });
    await browser.close();

    await async.mapLimit(links, 5, async (link) => {
      await crawl(link);
    });

  } catch (error) {
    console.error(`Failed to crawl "${url}": ${error.message}`);
  }
}

crawl(rootURL);
