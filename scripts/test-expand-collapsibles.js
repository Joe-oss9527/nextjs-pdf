#!/usr/bin/env node

/**
 * 测试折叠元素展开功能
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

const TARGET_URL = 'https://platform.openai.com/docs/guides/prompt-engineering';
const OUTPUT_DIR = './test-pdfs';

async function testExpandCollapsibles() {
  let browser = null;

  try {
    console.log('\n🧪 测试折叠元素展开功能\n');

    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ],
      ignoreDefaultArgs: ['--enable-automation']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    console.log('⏳ 加载页面...');
    await page.goto(TARGET_URL, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log('✅ 页面加载完成\n');

    // 截图：展开前
    await page.screenshot({
      path: `${OUTPUT_DIR}/before-expand.png`,
      fullPage: true
    });
    console.log('📸 保存展开前截图: before-expand.png');

    // 检查展开前的状态
    const beforeStats = await page.evaluate(() => {
      const collapsed = document.querySelectorAll('[aria-expanded="false"]').length;
      const hidden = document.querySelectorAll('.hidden:not(.code-block)').length;
      return { collapsed, hidden };
    });
    console.log(`\n📊 展开前状态:`);
    console.log(`   - aria-expanded="false": ${beforeStats.collapsed}`);
    console.log(`   - .hidden 元素: ${beforeStats.hidden}`);

    // 执行展开逻辑（复制自 pdfStyleService.processSpecialContent）
    console.log('\n⏳ 执行展开操作...');
    const stats = await page.evaluate(() => {
      let expandedElementsCount = 0;
      let ariaExpandedCount = 0;
      let hiddenContentCount = 0;

      // 1. 处理标准 <details> 元素
      document.querySelectorAll('details').forEach(details => {
        details.open = true;
        expandedElementsCount++;

        const summary = details.querySelector('summary[aria-expanded]');
        if (summary) {
          summary.setAttribute('aria-expanded', 'true');
        }

        const content = details.querySelector('[role="region"]');
        if (content) {
          content.style.setProperty('display', 'block', 'important');
          content.style.setProperty('visibility', 'visible', 'important');
          content.style.setProperty('opacity', '1', 'important');
        }
      });

      // 2. 处理 aria-expanded 控制的折叠元素
      document.querySelectorAll('[aria-expanded="false"]').forEach(trigger => {
        trigger.setAttribute('aria-expanded', 'true');
        ariaExpandedCount++;

        // 方法 1: 检查 aria-controls
        const controlsId = trigger.getAttribute('aria-controls');
        if (controlsId) {
          const content = document.getElementById(controlsId);
          if (content) {
            content.style.setProperty('display', 'block', 'important');
            content.style.setProperty('visibility', 'visible', 'important');
            content.style.setProperty('opacity', '1', 'important');
            content.style.setProperty('height', 'auto', 'important');
            content.classList.remove('hidden', 'collapsed');
          }
        }

        // 方法 2: 检查下一个兄弟元素
        const nextSibling = trigger.nextElementSibling;
        if (nextSibling) {
          nextSibling.classList.remove('hidden', 'collapsed', 'collapse');
          nextSibling.style.setProperty('display', 'block', 'important');
          nextSibling.style.setProperty('visibility', 'visible', 'important');
          nextSibling.style.setProperty('opacity', '1', 'important');
          nextSibling.style.setProperty('height', 'auto', 'important');
          nextSibling.style.setProperty('max-height', 'none', 'important');
        }

        // 方法 3: 检查父元素的子元素
        const parent = trigger.parentElement;
        if (parent) {
          const contentSibling = parent.querySelector('.expn-content, [class*="content"], [class*="body"]');
          if (contentSibling && contentSibling !== trigger) {
            contentSibling.classList.remove('hidden', 'collapsed');
            contentSibling.style.setProperty('display', 'block', 'important');
            contentSibling.style.setProperty('visibility', 'visible', 'important');
            contentSibling.style.setProperty('opacity', '1', 'important');
            contentSibling.style.setProperty('height', 'auto', 'important');
          }
        }
      });

      // 3. 强制显示隐藏内容
      document.querySelectorAll('.hidden, .collapsed, [hidden]').forEach(el => {
        if (el.classList.contains('code-block')) {
          return;
        }

        el.classList.remove('hidden', 'collapsed');
        el.removeAttribute('hidden');
        el.style.setProperty('display', 'block', 'important');
        el.style.setProperty('visibility', 'visible', 'important');
        el.style.setProperty('opacity', '1', 'important');
        el.style.setProperty('height', 'auto', 'important');
        el.style.setProperty('max-height', 'none', 'important');

        hiddenContentCount++;
      });

      // 4. 处理折叠面板
      document.querySelectorAll('.accordion-item, [class*="accordion"]').forEach(item => {
        const content = item.querySelector('.accordion-content, [class*="content"]');
        if (content) {
          content.style.setProperty('display', 'block', 'important');
          content.style.setProperty('visibility', 'visible', 'important');
          content.style.setProperty('max-height', 'none', 'important');
        }
      });

      // 5. 处理标签页
      document.querySelectorAll('[role="tabpanel"]').forEach(panel => {
        panel.style.setProperty('display', 'block', 'important');
        panel.style.setProperty('visibility', 'visible', 'important');
        panel.setAttribute('aria-hidden', 'false');
      });

      return {
        detailsExpanded: expandedElementsCount,
        ariaExpandedFixed: ariaExpandedCount,
        hiddenContentRevealed: hiddenContentCount
      };
    });

    console.log('\n✅ 展开完成！');
    console.log(`   - <details> 展开: ${stats.detailsExpanded}`);
    console.log(`   - aria-expanded 修复: ${stats.ariaExpandedFixed}`);
    console.log(`   - 隐藏内容显示: ${stats.hiddenContentRevealed}`);

    // 等待页面稳定
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 截图：展开后
    await page.screenshot({
      path: `${OUTPUT_DIR}/after-expand.png`,
      fullPage: true
    });
    console.log('\n📸 保存展开后截图: after-expand.png');

    // 检查展开后的状态
    const afterStats = await page.evaluate(() => {
      const collapsed = document.querySelectorAll('[aria-expanded="false"]').length;
      const hidden = document.querySelectorAll('.hidden:not(.code-block)').length;
      return { collapsed, hidden };
    });
    console.log(`\n📊 展开后状态:`);
    console.log(`   - aria-expanded="false": ${afterStats.collapsed}`);
    console.log(`   - .hidden 元素: ${afterStats.hidden}`);

    // 生成 PDF
    console.log('\n⏳ 生成 PDF...');
    await page.pdf({
      path: `${OUTPUT_DIR}/expanded-test.pdf`,
      format: 'A4',
      printBackground: true
    });

    const pdfStats = fs.statSync(`${OUTPUT_DIR}/expanded-test.pdf`);
    console.log(`✅ PDF 生成成功: ${(pdfStats.size / 1024).toFixed(2)} KB`);

    console.log('\n✨ 测试完成！\n');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

testExpandCollapsibles().catch(console.error);
