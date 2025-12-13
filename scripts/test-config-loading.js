#!/usr/bin/env node

/**
 * 测试脚本：验证 enablePDFStyleProcessing 配置是否正确加载
 */

import { setupContainer } from '../src/core/setup.js';

async function testConfigLoading() {
  console.log('🔍 测试配置加载...\n');

  try {
    // 初始化容器
    const container = await setupContainer();

    // 获取配置
    const config = await container.get('config');

    console.log('✅ 配置加载成功\n');

    // 检查关键字段
    console.log('📋 关键配置字段:');
    console.log('  enablePDFStyleProcessing:', config.enablePDFStyleProcessing);
    console.log('  类型:', typeof config.enablePDFStyleProcessing);
    console.log('  严格检查 (=== true):', config.enablePDFStyleProcessing === true);
    console.log('  严格检查 (=== false):', config.enablePDFStyleProcessing === false);
    console.log('\n  rootURL:', config.rootURL);
    console.log('  contentSelector:', config.contentSelector);

    // 检查所有包含 PDF 或 Style 的字段
    const pdfStyleKeys = Object.keys(config).filter(
      (k) => k.includes('PDF') || k.includes('Style') || k.includes('pdf')
    );
    console.log('\n📌 所有 PDF/Style 相关字段:', pdfStyleKeys);

    // 验证结果
    if (typeof config.enablePDFStyleProcessing === 'boolean') {
      console.log('\n✅ 验证通过：enablePDFStyleProcessing 是布尔类型');
      console.log(`   当前值: ${config.enablePDFStyleProcessing}`);

      if (config.rootURL.includes('claude.com')) {
        if (config.enablePDFStyleProcessing === true) {
          console.log('✅ Claude Code 配置正确 (应该为 true)');
        } else {
          console.log(
            '⚠️  Claude Code 配置错误：应该为 true，实际为',
            config.enablePDFStyleProcessing
          );
        }
      } else if (config.rootURL.includes('openai.com')) {
        if (config.enablePDFStyleProcessing === false) {
          console.log('✅ OpenAI 配置正确 (应该为 false)');
        } else {
          console.log('⚠️  OpenAI 配置错误：应该为 false，实际为', config.enablePDFStyleProcessing);
        }
      }
    } else {
      console.log('\n❌ 验证失败：enablePDFStyleProcessing 不是布尔类型');
      console.log(`   实际类型: ${typeof config.enablePDFStyleProcessing}`);
      console.log(`   实际值: ${config.enablePDFStyleProcessing}`);
    }

    // 清理
    await container.dispose();
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testConfigLoading();
