// 检查 Claude Code 文档的实际 DOM 结构
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function inspectSelectors() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  console.log('Loading page...');
  await page.goto('https://code.claude.com/docs/en/overview', {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });

  // 等待动态内容加载
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log('\n=== Checking Content Selectors ===\n');

  const selectors = [
    'main',
    'article',
    '[role="main"]',
    '[data-component*="DocContent"]',
    '.docs-content',
    '#content-area',
    '[id*="content"]',
    '[class*="content"]',
  ];

  for (const selector of selectors) {
    const element = await page.$(selector);
    if (element) {
      const text = await element.evaluate((el) => el.textContent?.substring(0, 100));
      const className = await element.evaluate((el) => el.className);
      const id = await element.evaluate((el) => el.id);
      console.log(`✓ Found: ${selector}`);
      console.log(`  - ID: "${id}"`);
      console.log(`  - Class: "${className}"`);
      console.log(`  - Text sample: "${text?.trim()}..."`);
      console.log('');
    } else {
      console.log(`✗ Not found: ${selector}\n`);
    }
  }

  console.log('\n=== Checking Navigation Selectors ===\n');

  const navSelectors = [
    'nav a[href]',
    'aside a[href]',
    '[data-component*="SideNav"] a[href]',
    '[class*="sidebar"] a[href]',
    '[id*="sidebar"] a[href]',
    'a[href^="/docs/en/"]',
  ];

  for (const selector of navSelectors) {
    const elements = await page.$$(selector);
    if (elements.length > 0) {
      const firstHref = await elements[0].evaluate((el) => el.href);
      console.log(`✓ Found ${elements.length} links: ${selector}`);
      console.log(`  - First link: ${firstHref}`);
      console.log('');
    } else {
      console.log(`✗ Not found: ${selector}\n`);
    }
  }

  await browser.close();
}

inspectSelectors().catch(console.error);
