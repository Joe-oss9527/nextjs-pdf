import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function inspectContentArea() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  console.log('Loading page...');
  await page.goto('https://code.claude.com/docs/en/overview', {
    waitUntil: 'domcontentloaded',
    timeout: 15000
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n=== Analyzing #content-area Structure ===\n');

  const analysis = await page.evaluate(() => {
    const contentArea = document.querySelector('#content-area');
    if (!contentArea) {
      return { error: '#content-area not found' };
    }

    // Check for navigation elements inside #content-area
    const navElements = {
      topNav: contentArea.querySelector('nav'),
      sideNav: contentArea.querySelector('[id*="sidebar"]'),
      asideElements: contentArea.querySelectorAll('aside'),
      navLinks: contentArea.querySelectorAll('nav a, [id*="sidebar"] a'),
      allChildren: Array.from(contentArea.children).map(child => ({
        tag: child.tagName,
        id: child.id,
        className: child.className,
        textPreview: child.textContent?.substring(0, 80).trim()
      }))
    };

    // Get the article/main content area inside #content-area
    const article = contentArea.querySelector('article, [role="article"], main, [role="main"]');
    const contentDivs = Array.from(contentArea.querySelectorAll('div')).slice(0, 10);

    return {
      hasNav: !!navElements.topNav,
      hasSidebar: !!navElements.sideNav,
      asideCount: navElements.asideElements.length,
      navLinkCount: navElements.navLinks.length,
      hasArticle: !!article,
      articleInfo: article ? {
        tag: article.tagName,
        id: article.id,
        className: article.className
      } : null,
      directChildren: navElements.allChildren,
      firstFewDivs: contentDivs.map(div => ({
        id: div.id,
        className: div.className?.substring(0, 100),
        textPreview: div.textContent?.substring(0, 60).trim()
      }))
    };
  });

  console.log('Analysis Results:');
  console.log(JSON.stringify(analysis, null, 2));

  console.log('\n=== Checking for Better Selectors ===\n');

  const betterSelectors = await page.evaluate(() => {
    const results = {};
    
    // Try to find the actual article content (without nav)
    const selectors = [
      '#content-area > article',
      '#content-area > div > article', 
      '#content-area [role="article"]',
      '#content-area > div[class*="prose"]',
      '#content-area > div > div[class*="prose"]',
      '#content-area > div:not([id*="sidebar"]):not(nav)',
      '#content-area article',
      '#content-area main'
    ];

    selectors.forEach(selector => {
      const el = document.querySelector(selector);
      if (el) {
        results[selector] = {
          found: true,
          id: el.id,
          className: el.className?.substring(0, 100),
          textPreview: el.textContent?.substring(0, 80).trim(),
          hasNav: !!el.querySelector('nav'),
          hasSidebar: !!el.querySelector('[id*="sidebar"]')
        };
      } else {
        results[selector] = { found: false };
      }
    });

    return results;
  });

  console.log('Better Selector Candidates:');
  console.log(JSON.stringify(betterSelectors, null, 2));

  console.log('\n=== Theme Detection ===\n');

  const themeInfo = await page.evaluate(() => {
    return {
      htmlClass: document.documentElement.className,
      bodyClass: document.body.className,
      dataTheme: document.documentElement.getAttribute('data-theme') || document.body.getAttribute('data-theme'),
      htmlStyle: document.documentElement.getAttribute('style'),
      bodyBgColor: getComputedStyle(document.body).backgroundColor,
      bodyColor: getComputedStyle(document.body).color
    };
  });

  console.log('Theme Information:');
  console.log(JSON.stringify(themeInfo, null, 2));

  await browser.close();
}

inspectContentArea().catch(console.error);
