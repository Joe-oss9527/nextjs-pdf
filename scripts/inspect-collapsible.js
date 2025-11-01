#!/usr/bin/env node

/**
 * 检查折叠元素的 DOM 结构
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const TARGET_URL = 'https://platform.openai.com/docs/guides/prompt-engineering';

async function inspectCollapsibles() {
  let browser = null;

  try {
    console.log('\n🔍 检查折叠元素结构\n');

    browser = await puppeteer.launch({
      headless: false,
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

    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('✅ 页面加载完成\n');

    // 检查折叠元素
    const collapsibleInfo = await page.evaluate(() => {
      const results = {
        detailsElements: [],
        ariaExpandedElements: [],
        collapsedClasses: [],
        customCollapsibles: []
      };

      // 1. 检查 <details> 元素
      document.querySelectorAll('details').forEach(details => {
        const summary = details.querySelector('summary');
        results.detailsElements.push({
          open: details.open,
          summaryText: summary ? summary.textContent.trim().substring(0, 50) : 'No summary',
          classes: details.className,
          ariaExpanded: summary ? summary.getAttribute('aria-expanded') : null
        });
      });

      // 2. 检查 aria-expanded 元素
      document.querySelectorAll('[aria-expanded]').forEach(el => {
        const isExpanded = el.getAttribute('aria-expanded') === 'true';
        results.ariaExpandedElements.push({
          tagName: el.tagName,
          expanded: isExpanded,
          text: el.textContent.trim().substring(0, 50),
          classes: el.className,
          role: el.getAttribute('role'),
          nextSiblingTag: el.nextElementSibling ? el.nextElementSibling.tagName : null,
          nextSiblingClasses: el.nextElementSibling ? el.nextElementSibling.className : null
        });
      });

      // 3. 检查常见的折叠类名
      const collapsibleClassPatterns = [
        'collapse', 'collapsible', 'accordion', 'expandable',
        'toggle', 'dropdown', 'fold', 'hidden'
      ];

      collapsibleClassPatterns.forEach(pattern => {
        document.querySelectorAll(`[class*="${pattern}"]`).forEach(el => {
          if (!results.collapsedClasses.find(item => item.element === el)) {
            results.collapsedClasses.push({
              pattern: pattern,
              tagName: el.tagName,
              classes: el.className,
              text: el.textContent.trim().substring(0, 50),
              display: window.getComputedStyle(el).display,
              visibility: window.getComputedStyle(el).visibility
            });
          }
        });
      });

      // 4. 检查特定的 OpenAI 结构（基于截图）
      // 查找包含 "Coding", "Front-end engineering", "Agentic tasks" 的元素
      const targetTexts = ['Coding', 'Front-end engineering', 'Agentic tasks'];
      targetTexts.forEach(text => {
        const xpath = `//text()[contains(., '${text}')]/ancestor::*[1]`;
        const iterator = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);

        for (let i = 0; i < iterator.snapshotLength; i++) {
          const el = iterator.snapshotItem(i);
          results.customCollapsibles.push({
            targetText: text,
            tagName: el.tagName,
            classes: el.className,
            parent: el.parentElement ? {
              tagName: el.parentElement.tagName,
              classes: el.parentElement.className
            } : null,
            nextSibling: el.nextElementSibling ? {
              tagName: el.nextElementSibling.tagName,
              classes: el.nextElementSibling.className,
              display: window.getComputedStyle(el.nextElementSibling).display
            } : null
          });
        }
      });

      return results;
    });

    console.log('📊 折叠元素分析结果:\n');

    console.log('1. <details> 元素:', collapsibleInfo.detailsElements.length);
    if (collapsibleInfo.detailsElements.length > 0) {
      collapsibleInfo.detailsElements.slice(0, 5).forEach((item, i) => {
        console.log(`   [${i + 1}] ${item.summaryText}`);
        console.log(`       - Open: ${item.open}`);
        console.log(`       - aria-expanded: ${item.ariaExpanded}`);
        console.log(`       - Classes: ${item.classes || '(none)'}`);
      });
    }

    console.log('\n2. [aria-expanded] 元素:', collapsibleInfo.ariaExpandedElements.length);
    if (collapsibleInfo.ariaExpandedElements.length > 0) {
      collapsibleInfo.ariaExpandedElements.slice(0, 10).forEach((item, i) => {
        console.log(`   [${i + 1}] <${item.tagName}> "${item.text}"`);
        console.log(`       - Expanded: ${item.expanded}`);
        console.log(`       - Role: ${item.role || '(none)'}`);
        console.log(`       - Classes: ${item.classes || '(none)'}`);
        if (item.nextSiblingTag) {
          console.log(`       - Next sibling: <${item.nextSiblingTag}> (${item.nextSiblingClasses})`);
        }
      });
    }

    console.log('\n3. 折叠类名元素:', collapsibleInfo.collapsedClasses.length);
    if (collapsibleInfo.collapsedClasses.length > 0) {
      const uniquePatterns = [...new Set(collapsibleInfo.collapsedClasses.map(i => i.pattern))];
      console.log(`   发现的模式: ${uniquePatterns.join(', ')}`);
      collapsibleInfo.collapsedClasses.slice(0, 5).forEach((item, i) => {
        console.log(`   [${i + 1}] <${item.tagName}> "${item.text}"`);
        console.log(`       - Pattern: ${item.pattern}`);
        console.log(`       - Classes: ${item.classes}`);
        console.log(`       - Display: ${item.display}, Visibility: ${item.visibility}`);
      });
    }

    console.log('\n4. 目标文本周围的结构:', collapsibleInfo.customCollapsibles.length);
    if (collapsibleInfo.customCollapsibles.length > 0) {
      collapsibleInfo.customCollapsibles.forEach(item => {
        console.log(`\n   📝 "${item.targetText}":`);
        console.log(`       - 元素: <${item.tagName}> (${item.classes})`);
        if (item.parent) {
          console.log(`       - 父元素: <${item.parent.tagName}> (${item.parent.classes})`);
        }
        if (item.nextSibling) {
          console.log(`       - 下一个兄弟: <${item.nextSibling.tagName}> (${item.nextSibling.classes})`);
          console.log(`       - 兄弟显示状态: ${item.nextSibling.display}`);
        }
      });
    }

    console.log('\n\n⏳ 保持浏览器打开 20 秒供检查...');
    await new Promise(resolve => setTimeout(resolve, 20000));

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

inspectCollapsibles().catch(console.error);
