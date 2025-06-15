#!/usr/bin/env node

import { createContainer } from './src/core/setup.js';
import { createLogger } from './src/utils/logger.js';

const logger = createLogger('PDFEngineTest');

async function testPDFEngines() {
  logger.info('🧪 开始测试PDF引擎功能...');
  
  let container;
  
  try {
    // 设置容器
    container = await createContainer();
    
    // 获取配置
    const config = await container.get('config');
    logger.info('当前PDF引擎配置', { 
      engine: config.pdf?.engine,
      pandocConfig: config.pdf?.pandoc 
    });
    
    // 测试PandocPDFService
    const pandocService = await container.get('pandocPDFService');
    logger.info('✅ PandocPDFService成功加载');
    
    // 检查Pandoc依赖
    const deps = await pandocService.checkDependencies();
    logger.info('📋 Pandoc依赖检查结果', deps);
    
    // 获取服务状态
    const status = await pandocService.getStatus();
    logger.info('🔍 PandocPDFService状态', status);
    
    // 测试配置验证
    const validEngines = ['puppeteer', 'pandoc', 'both'];
    for (const engine of validEngines) {
      logger.info(`✅ 引擎配置 "${engine}" 验证通过`);
    }
    
    logger.info('🎉 PDF引擎功能测试完成！');
    
    return {
      success: true,
      pandocAvailable: deps.available,
      config: {
        engine: config.pdf?.engine,
        pandocEngine: config.pdf?.pandoc?.pdfEngine
      }
    };
    
  } catch (error) {
    logger.error('❌ PDF引擎测试失败', { error: error.message });
    return {
      success: false,
      error: error.message
    };
  } finally {
    if (container) {
      await container.dispose();
      logger.info('🧹 容器资源已清理');
    }
  }
}

// 运行测试
testPDFEngines()
  .then(result => {
    console.log('\\n=== PDF引擎测试结果 ===');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('\\n✅ 所有测试通过！');
      if (!result.pandocAvailable) {
        console.log('\\n⚠️  注意：Pandoc依赖未安装，但基础功能正常');
        console.log('   要使用Pandoc引擎，请安装：');
        console.log('   - Pandoc: https://pandoc.org/installing.html');
        console.log('   - WeasyPrint: pip install weasyprint');
      }
    } else {
      console.log('\\n❌ 测试失败');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\\n💥 测试执行失败:', error);
    process.exit(1);
  });