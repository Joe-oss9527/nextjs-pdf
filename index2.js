const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const async = require('async');

const rootURL = 'https://nextjs.org/docs';
let visitedLinks = new Set();

const queue = async.queue(async function(task, callback) {
  const url = task.url;

  if (visitedLinks.has(url)) {
    callback();
    return;
  }

  visitedLinks.add(url);

  const browser = await puppeteer.launch({
    headless: 'new', // Using the new headless mode.
  });

  const page = await browser.newPage();
  await page.goto(url);

  // Here we are using the `evaluate` method to modify the page's DOM.
  await page.evaluate(() => {
    // Select all the content outside the <article> tags and remove it.
    document.body.innerHTML = document.querySelector('article').outerHTML;
  });

  await page.pdf({ path: `./output/${url.split('/').pop()}.pdf`, format: 'A4', printBackground: true });

  const content = await page.content();
  const $ = cheerio.load(content);

  const links = $('a');
  for (let i = 0; i < links.length; i++) {
    const link = $(links[i]).attr('href');
    const fullLink = new URL(link, rootURL).href;
    if (fullLink.startsWith(rootURL) && !visitedLinks.has(fullLink)) {
      queue.push({ url: fullLink });
    }
  }

  await browser.close();
  callback();
}, 5); // Limit the concurrency to 5.

queue.drain(function() {
  console.log('All items have been processed');
});

queue.push({ url: rootURL });
