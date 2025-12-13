#!/usr/bin/env node

/**
 * 检查 code.claude.com 的实际导航结构和section标题
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function inspectNavigation() {
  console.log('🔍 检查 code.claude.com 的导航结构');
  console.log('='.repeat(60));

  let browser = null;
  let page = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // 访问首页
    const url = 'https://code.claude.com/docs/en/overview';
    console.log(`\n📄 访问: ${url}`);

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // 等待动态内容加载
    await new Promise((resolve) => setTimeout(resolve, 3000));

    console.log('✅ 页面加载完成');

    // 提取导航结构
    const navStructure = await page.evaluate(() => {
      const results = {
        allLinks: [],
        sidebarStructure: [],
        possibleSectionTitles: [],
      };

      // 1. 尝试查找侧边栏
      const sidebarSelectors = [
        '[id*="sidebar"]',
        '[class*="sidebar"]',
        'nav[aria-label*="Main"]',
        'nav[aria-label*="Primary"]',
        '[role="navigation"]',
      ];

      let sidebar = null;
      for (const selector of sidebarSelectors) {
        sidebar = document.querySelector(selector);
        if (sidebar) {
          results.sidebarStructure.push({
            selector,
            found: true,
            html: sidebar.innerHTML.substring(0, 500),
          });
          break;
        }
      }

      // 2. 查找所有 /docs/en/ 开头的链接
      const links = document.querySelectorAll('a[href*="/docs/en/"]');
      links.forEach((link) => {
        const href = link.href;
        const text = link.textContent?.trim() || '';
        const parent = link.parentElement;
        const parentTag = parent?.tagName;
        const parentClass = parent?.className || '';

        results.allLinks.push({
          href,
          text,
          parentTag,
          parentClass: parentClass.substring(0, 50),
        });
      });

      // 3. 查找可能的section标题（h2, h3, 或者导航分组标题）
      const headings = document.querySelectorAll('h1, h2, h3, [role="heading"]');
      headings.forEach((heading) => {
        const text = heading.textContent?.trim();
        if (text && text.length > 2 && text.length < 50) {
          results.possibleSectionTitles.push({
            text,
            tag: heading.tagName,
            role: heading.getAttribute('role'),
          });
        }
      });

      // 4. 尝试查找特定的section分组
      const sectionGroupSelectors = [
        '[class*="nav-group"]',
        '[class*="sidebar-group"]',
        '[class*="menu-group"]',
        '[data-section]',
      ];

      for (const selector of sectionGroupSelectors) {
        const groups = document.querySelectorAll(selector);
        if (groups.length > 0) {
          results.sidebarStructure.push({
            selector,
            count: groups.length,
            sample: Array.from(groups)
              .slice(0, 2)
              .map((g) => ({
                text: g.textContent?.trim().substring(0, 100),
                html: g.innerHTML.substring(0, 200),
              })),
          });
        }
      }

      return results;
    });

    console.log('\n📊 导航结构分析结果:');
    console.log('='.repeat(60));

    console.log('\n1️⃣ 侧边栏检测:');
    if (navStructure.sidebarStructure.length > 0) {
      navStructure.sidebarStructure.forEach((item) => {
        console.log(
          `   - ${item.selector}: ${item.found ? '✅ 找到' : `❌ 未找到 (${item.count || 0}个)`}`
        );
      });
    } else {
      console.log('   ⚠️  未找到明确的侧边栏元素');
    }

    console.log('\n2️⃣ /docs/en/ 链接 (前20个):');
    navStructure.allLinks.slice(0, 20).forEach((link) => {
      console.log(`   - ${link.text}`);
      console.log(`     URL: ${link.href}`);
      console.log(`     Parent: <${link.parentTag}> ${link.parentClass}`);
    });

    console.log(`\n   总计: ${navStructure.allLinks.length} 个链接`);

    console.log('\n3️⃣ 可能的Section标题 (前15个):');
    navStructure.possibleSectionTitles.slice(0, 15).forEach((title) => {
      console.log(`   - [${title.tag}${title.role ? ` role="${title.role}"` : ''}] ${title.text}`);
    });

    // 4. 检查配置中的7个entry points
    console.log('\n4️⃣ 验证配置的7个entry points:');
    const entryPoints = [
      'https://code.claude.com/docs/en/overview',
      'https://code.claude.com/docs/en/sub-agents',
      'https://code.claude.com/docs/en/third-party-integrations',
      'https://code.claude.com/docs/en/setup',
      'https://code.claude.com/docs/en/settings',
      'https://code.claude.com/docs/en/cli-reference',
      'https://code.claude.com/docs/en/legal-and-compliance',
    ];

    for (const entryUrl of entryPoints) {
      console.log(`\n   📄 检查: ${entryUrl}`);

      try {
        await page.goto(entryUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const pageInfo = await page.evaluate(() => {
          // 提取页面主标题
          const h1 = document.querySelector('h1');
          const title = h1 ? h1.textContent?.trim() : null;

          // 查找导航中匹配当前页面的链接文本
          const currentUrl = window.location.href;
          const navLinks = document.querySelectorAll('a[href*="/docs/en/"]');
          let navText = null;

          for (const link of navLinks) {
            if (link.href === currentUrl || currentUrl.includes(link.href)) {
              navText = link.textContent?.trim();
              if (navText && navText.length > 2) {
                break;
              }
            }
          }

          return { h1Title: title, navText };
        });

        console.log(`      H1标题: ${pageInfo.h1Title || '未找到'}`);
        console.log(`      导航文本: ${pageInfo.navText || '未找到'}`);
      } catch (error) {
        console.log(`      ❌ 访问失败: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ 检查完成');
  } catch (error) {
    console.error('\n❌ 检查失败:', error.message);
    throw error;
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

inspectNavigation().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
