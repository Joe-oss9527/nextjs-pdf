#!/usr/bin/env node

/**
 * OpenAI 页面访问测试脚本
 * 用于调试反爬虫绕过和选择器验证
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';

// 使用 stealth plugin
puppeteer.use(StealthPlugin());

const TARGET_URL = 'https://platform.openai.com/docs/guides/prompt-engineering';
const SCREENSHOT_DIR = './debug-screenshots';

async function testOpenAIAccess() {
  let browser = null;

  try {
    console.log('\n🚀 启动测试：OpenAI 页面访问\n');
    console.log(`目标 URL: ${TARGET_URL}\n`);

    // 确保截图目录存在
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    // 启动浏览器
    console.log('⏳ 启动浏览器...');
    browser = await puppeteer.launch({
      headless: false, // 可视化调试
      defaultViewport: { width: 1920, height: 1080 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1920,1080',
        '--start-maximized',
        '--disable-notifications'
      ],
      ignoreDefaultArgs: ['--enable-automation']
    });

    const page = await browser.newPage();

    // 设置 User-Agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );

    // 增强反检测
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      delete navigator.__proto__.webdriver;

      window.chrome = {
        runtime: {}
      };

      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          {
            description: "Portable Document Format",
            filename: "internal-pdf-viewer",
            name: "Chrome PDF Plugin"
          }
        ],
      });

      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en-US', 'en'],
      });
    });

    console.log('✅ 浏览器启动成功\n');

    // 尝试访问页面
    console.log('⏳ 正在访问页面...');
    const response = await page.goto(TARGET_URL, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log(`✅ 页面响应状态: ${response.status()}\n`);

    if (response.status() === 403) {
      console.error('❌ 403 Forbidden - 网站拒绝访问');
      console.log('💡 可能需要：');
      console.log('   1. 使用代理 IP');
      console.log('   2. 添加更多延迟和随机行为');
      console.log('   3. 尝试其他反爬虫技术\n');
    } else if (response.status() === 200) {
      console.log('✅ 成功访问页面！\n');

      // 等待页面完全加载
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 保存截图
      const screenshotPath = path.join(SCREENSHOT_DIR, 'openai-page.png');
      await page.screenshot({
        path: screenshotPath,
        fullPage: true
      });
      console.log(`📸 截图已保存: ${screenshotPath}\n`);

      // 测试不同的选择器
      console.log('🔍 测试导航选择器...\n');

      const selectors = [
        '#sidebar a[href]',
        'nav a[href]',
        'aside a[href]',
        '[role="navigation"] a[href]',
        '.sidebar a[href]',
        '.nav a[href]',
        '[class*="sidebar"] a[href]',
        '[class*="nav"] a[href]'
      ];

      for (const selector of selectors) {
        try {
          const elements = await page.$$(selector);
          const count = elements.length;

          if (count > 0) {
            console.log(`✅ ${selector.padEnd(35)} → 找到 ${count} 个链接`);

            // 显示前 3 个链接的 href
            const hrefs = await page.evaluate((sel) => {
              const links = Array.from(document.querySelectorAll(sel));
              return links.slice(0, 3).map(link => link.href);
            }, selector);

            hrefs.forEach((href, index) => {
              console.log(`   ${index + 1}. ${href}`);
            });
            console.log('');
          } else {
            console.log(`❌ ${selector.padEnd(35)} → 未找到`);
          }
        } catch (error) {
          console.log(`⚠️  ${selector.padEnd(35)} → 错误: ${error.message}`);
        }
      }

      // 测试内容选择器
      console.log('\n🔍 测试内容选择器...\n');

      const contentSelectors = [
        '#content-area',
        'main',
        'article',
        '[role="main"]',
        '.main-content',
        '[class*="content"]'
      ];

      for (const selector of contentSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const text = await element.evaluate(el => el.textContent.substring(0, 100));
            console.log(`✅ ${selector.padEnd(30)} → 找到 (前100字符: ${text.trim().substring(0, 50)}...)`);
          } else {
            console.log(`❌ ${selector.padEnd(30)} → 未找到`);
          }
        } catch (error) {
          console.log(`⚠️  ${selector.padEnd(30)} → 错误: ${error.message}`);
        }
      }

      // 提取页面结构信息
      console.log('\n📊 页面结构分析...\n');
      const structureInfo = await page.evaluate(() => {
        return {
          title: document.title,
          hasNav: !!document.querySelector('nav'),
          hasAside: !!document.querySelector('aside'),
          hasSidebar: !!document.querySelector('[class*="sidebar"]'),
          hasMain: !!document.querySelector('main'),
          allClassesWithNav: Array.from(document.querySelectorAll('[class*="nav"]')).map(el => el.className),
          allClassesWithSidebar: Array.from(document.querySelectorAll('[class*="sidebar"]')).map(el => el.className)
        };
      });

      console.log('页面标题:', structureInfo.title);
      console.log('有 <nav> 元素:', structureInfo.hasNav);
      console.log('有 <aside> 元素:', structureInfo.hasAside);
      console.log('有 sidebar class:', structureInfo.hasSidebar);
      console.log('有 <main> 元素:', structureInfo.hasMain);

      if (structureInfo.allClassesWithNav.length > 0) {
        console.log('\n包含 "nav" 的类名:');
        structureInfo.allClassesWithNav.slice(0, 5).forEach(className => {
          console.log(`  - ${className}`);
        });
      }

      if (structureInfo.allClassesWithSidebar.length > 0) {
        console.log('\n包含 "sidebar" 的类名:');
        structureInfo.allClassesWithSidebar.slice(0, 5).forEach(className => {
          console.log(`  - ${className}`);
        });
      }

      console.log('\n✨ 测试完成！\n');
    }

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error('\n堆栈信息:', error.stack);
  } finally {
    if (browser) {
      console.log('\n⏳ 关闭浏览器...');
      await browser.close();
      console.log('✅ 浏览器已关闭\n');
    }
  }
}

// 运行测试
testOpenAIAccess().catch(console.error);
