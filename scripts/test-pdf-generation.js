#!/usr/bin/env node

/**
 * PDF 生成测试脚本
 * 测试不同配置下的 PDF 生成
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

const TEST_URL = 'https://platform.openai.com/docs/guides/prompt-engineering';
const OUTPUT_DIR = './test-pdfs';

async function testPDFGeneration() {
  let browser = null;

  try {
    console.log('\n🧪 PDF 生成测试\n');

    // 确保输出目录存在
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // 测试配置
    const testConfigs = [
      {
        name: '标准配置',
        browserOpts: {
          headless: true,
        },
        pdfOpts: {
          format: 'A4',
          printBackground: true,
        },
      },
      {
        name: '简化配置 (无背景)',
        browserOpts: {
          headless: true,
        },
        pdfOpts: {
          format: 'A4',
          printBackground: false,
        },
      },
      {
        name: 'Letter 格式',
        browserOpts: {
          headless: true,
        },
        pdfOpts: {
          format: 'Letter',
          printBackground: true,
        },
      },
      {
        name: '无 preferCSSPageSize',
        browserOpts: {
          headless: true,
        },
        pdfOpts: {
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: false,
        },
      },
      {
        name: 'headless new 模式',
        browserOpts: {
          headless: 'new',
        },
        pdfOpts: {
          format: 'A4',
          printBackground: true,
        },
      },
    ];

    for (const config of testConfigs) {
      console.log(`\n📋 测试: ${config.name}`);
      console.log('─'.repeat(50));

      try {
        // 启动浏览器
        browser = await puppeteer.launch({
          headless: config.browserOpts.headless,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
          ],
          ignoreDefaultArgs: ['--enable-automation'],
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // 访问页面
        console.log('⏳ 加载页面...');
        await page.goto(TEST_URL, {
          waitUntil: 'networkidle2',
          timeout: 60000,
        });

        console.log('✅ 页面加载成功');

        // 等待页面稳定
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // 生成 PDF
        const fileName = `test-${testConfigs.indexOf(config)}-${config.name.replace(/\s+/g, '-')}.pdf`;
        const outputPath = `${OUTPUT_DIR}/${fileName}`;

        console.log('⏳ 生成 PDF...');

        const pdfOpts = {
          ...config.pdfOpts,
          path: outputPath,
        };

        await page.pdf(pdfOpts);

        // 检查文件是否存在
        if (fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          console.log(`✅ PDF 生成成功: ${outputPath}`);
          console.log(`   文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
        } else {
          console.log('❌ PDF 文件不存在');
        }

        await browser.close();
        browser = null;
      } catch (error) {
        console.log(`❌ 测试失败: ${error.message}`);
        if (browser) {
          await browser.close();
          browser = null;
        }
      }
    }

    console.log('\n✨ 测试完成！\n');
    console.log('生成的 PDF 文件:');
    const files = fs.readdirSync(OUTPUT_DIR);
    files.forEach((file) => {
      const stats = fs.statSync(`${OUTPUT_DIR}/${file}`);
      console.log(`  - ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
    });
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

testPDFGeneration().catch(console.error);
