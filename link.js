const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

async function scrape() {
  // Launch a new browser instance
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Go to the specified URL
  await page.goto('https://nextjs.org/learn/dashboard-app', { waitUntil: 'networkidle2' });
  
  // Click the button to open the nav tree
  await page.click('#radix-:r1g:-content-nav');
  
  // Wait for the nav tree to open
  await page.waitForSelector('div#radix-:r1g:-content-nav', { visible: true });
  
  // Get the page content and load it into Cheerio
  const content = await page.content();
  console.log(111, content)
  const $ = cheerio.load(content);
  
  // Get all links in the nav tree
  const links = [];
  $('#radix-:r1g:-content-nav a').each((i, link) => {
    links.push($(link).attr('href'));
  });
  
  // Output the links
  console.log(links);
  
  // Close the browser
  await browser.close();
}

// Run the scrape function
scrape();
