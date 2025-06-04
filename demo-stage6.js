/**
 * 第六阶段核心爬虫逻辑演示脚本
 * 展示如何使用重构后的Scraper类进行PDF爬取
 */

import path from 'path';
import { fileURLToPath } from 'url';

// 导入所有服务类
import { Scraper } from './src/core/scraper.js';
import { createLogger } from './src/utils/logger.js';
import { FileService } from './src/services/fileService.js';
import { PathService } from './src/services/pathService.js';
import { MetadataService } from './src/services/metadataService.js';
import { StateManager } from './src/services/stateManager.js';
import { ProgressTracker } from './src/services/progressTracker.js';
import { QueueManager } from './src/services/queueManager.js';
import { BrowserPool } from './src/services/browserPool.js';
import { PageManager } from './src/services/pageManager.js';
import { ImageService } from './src/services/imageService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 演示配置
 */
const demoConfig = {
  // 基础配置
  rootURL: 'https://httpbin.org',  // 使用httpbin作为演示站点
  navLinksSelector: 'a[href]',     // 简单的链接选择器
  contentSelector: 'body',         // 内容选择器
  
  // 路径配置
  outputDir: path.join(__dirname, 'demo-output'),
  pdfDir: path.join(__dirname, 'demo-output'),
  
  // 爬取配置
  pageTimeout: 10000,              // 10秒超时
  maxRetries: 2,                   // 最多重试2次
  concurrency: 1,                  // 演示使用单线程
  requestInterval: 1000,           // 请求间隔1秒
  
  // URL过滤配置
  allowedDomains: ['httpbin.org'], // 只允许httpbin.org
  ignoreURLs: [                    // 忽略的URL模式
    'javascript:',
    'mailto:',
    '#'
  ],
  
  // 其他配置
  retryFailedUrls: true,
  retryDelay: 2000,
  logLevel: 'info'
};

/**
 * 服务容器类 - 管理所有依赖服务
 */
class DemoContainer {
  constructor() {
    this.services = new Map();
  }

  async initialize() {
    console.log('🚀 初始化服务容器...');

    try {
      // 1. 基础服务
      this.services.set('config', demoConfig);
      this.services.set('logger', createLogger({
        level: demoConfig.logLevel,
        format: 'simple',
        includeFileTransports: true
      }));

      const logger = this.services.get('logger');
      logger.info('开始初始化演示环境');

      // 2. 文件服务层
      this.services.set('fileService', new FileService(logger));
      this.services.set('pathService', new PathService(demoConfig, logger));
      this.services.set('metadataService', new MetadataService(
        this.services.get('fileService'),
        this.services.get('pathService'),
        logger
      ));

      // 3. 数据管理层
      this.services.set('stateManager', new StateManager(
        this.services.get('fileService'),
        this.services.get('pathService'),
        logger
      ));

      this.services.set('progressTracker', new ProgressTracker(logger));
      
      this.services.set('queueManager', new QueueManager({
        concurrency: demoConfig.concurrency,
        interval: demoConfig.requestInterval
      }));

      // 4. 浏览器管理层
      this.services.set('browserPool', new BrowserPool({
        logger: logger,
        maxBrowsers: 1,  // 演示使用单浏览器
        launchOptions: {
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
          ]
        }
      }));

      this.services.set('pageManager', new PageManager({
        browserPool: this.services.get('browserPool'),
        logger: logger
      }));

      // 5. 图片处理层
      this.services.set('imageService', new ImageService(logger));

      console.log('✅ 服务容器初始化完成');
      return this;

    } catch (error) {
      console.error('❌ 服务容器初始化失败:', error);
      throw error;
    }
  }

  get(serviceName) {
    return this.services.get(serviceName);
  }

  async dispose() {
    console.log('🧹 清理服务容器...');
    
    const cleanupOrder = [
      'queueManager',
      'pageManager',
      'browserPool',
      'stateManager'
    ];

    for (const serviceName of cleanupOrder) {
      try {
        const service = this.services.get(serviceName);
        if (service && typeof service.close === 'function') {
          await service.close();
        } else if (service && typeof service.dispose === 'function') {
          await service.dispose();
        }
      } catch (error) {
        console.warn(`清理服务 ${serviceName} 失败:`, error.message);
      }
    }

    console.log('✅ 服务容器清理完成');
  }
}

/**
 * 事件监听器 - 监控爬虫运行状态
 */
function setupScraperEventListeners(scraper) {
  console.log('📡 设置事件监听器...');

  // 初始化事件
  scraper.on('initialized', () => {
    console.log('🎯 爬虫初始化完成');
  });

  // URL收集事件
  scraper.on('urlsCollected', (data) => {
    console.log(`📋 收集到 ${data.totalUrls} 个URL`);
    if (data.duplicates > 0) {
      console.log(`🔄 去重了 ${data.duplicates} 个重复URL`);
    }
  });

  // 页面爬取事件
  scraper.on('pageScraped', (data) => {
    console.log(`📄 页面爬取完成: ${data.url}`);
    if (data.title) {
      console.log(`   标题: ${data.title}`);
    }
    console.log(`   PDF: ${data.pdfPath}`);
  });

  // 页面爬取失败事件
  scraper.on('pageScrapeFailed', (data) => {
    console.error(`❌ 页面爬取失败: ${data.url}`);
    console.error(`   错误: ${data.error}`);
  });

  // 进度更新事件
  scraper.on('progress', (stats) => {
    const percent = ((stats.processed / stats.total) * 100).toFixed(1);
    console.log(`📊 进度: ${stats.processed}/${stats.total} (${percent}%)`);
  });

  // 重试完成事件
  scraper.on('retryCompleted', (data) => {
    if (data.successCount > 0 || data.failCount > 0) {
      console.log(`🔄 重试完成: 成功 ${data.successCount}, 失败 ${data.failCount}`);
    }
  });

  // 完成事件
  scraper.on('completed', (data) => {
    console.log('🎉 爬虫任务完成!');
    console.log(`📊 统计: ${JSON.stringify(data.stats, null, 2)}`);
    console.log(`⏱️  耗时: ${Math.round(data.duration / 1000)}秒`);
  });

  // 错误事件
  scraper.on('error', (error) => {
    console.error('💥 爬虫运行错误:', error.message);
  });
}

/**
 * 主演示函数
 */
async function runDemo() {
  const startTime = Date.now();
  let container = null;
  let scraper = null;

  try {
    console.log('🎬 开始第六阶段Scraper演示');
    console.log('=' .repeat(60));

    // 初始化容器
    container = new DemoContainer();
    await container.initialize();

    // 创建爬虫实例
    scraper = new Scraper({
      config: container.get('config'),
      logger: container.get('logger'),
      browserPool: container.get('browserPool'),
      pageManager: container.get('pageManager'),
      fileService: container.get('fileService'),
      pathService: container.get('pathService'),
      metadataService: container.get('metadataService'),
      stateManager: container.get('stateManager'),
      progressTracker: container.get('progressTracker'),
      queueManager: container.get('queueManager'),
      imageService: container.get('imageService')
    });

    // 设置事件监听
    setupScraperEventListeners(scraper);

    console.log('🎯 开始运行爬虫...');
    console.log(`📍 目标网站: ${demoConfig.rootURL}`);
    console.log(`📁 输出目录: ${demoConfig.outputDir}`);

    // 运行爬虫
    await scraper.run();

    // 显示最终状态
    const finalStatus = scraper.getStatus();
    console.log('\n📊 最终状态:');
    console.log(`  总URL数: ${finalStatus.totalUrls}`);
    console.log(`  成功处理: ${finalStatus.progress.processed}`);
    console.log(`  处理失败: ${finalStatus.progress.failed}`);
    console.log(`  跳过处理: ${finalStatus.progress.skipped}`);
    console.log(`  运行时间: ${Math.round(finalStatus.uptime / 1000)}秒`);

    const duration = Date.now() - startTime;
    console.log('');
    console.log('🎊 演示完成!');
    console.log(`⏱️  总耗时: ${Math.round(duration / 1000)}秒`);
    console.log('=' .repeat(60));

  } catch (error) {
    console.error('💥 演示失败:', error);
    throw error;
  } finally {
    // 清理资源
    if (scraper) {
      try {
        await scraper.cleanup();
      } catch (error) {
        console.warn('爬虫清理失败:', error.message);
      }
    }
    
    if (container) {
      await container.dispose();
    }
  }
}

/**
 * 演示不同的使用场景
 */
async function demonstrateFeatures() {
  console.log('\n🔧 功能演示');
  console.log('-' .repeat(40));

  // 演示URL验证
  console.log('1. URL验证功能:');
  const mockScraper = new Scraper({
    config: { allowedDomains: ['example.com'], ignoreURLs: ['admin'] },
    logger: { info: ()=>{}, warn: ()=>{}, error: ()=>{}, debug: ()=>{} },
    browserPool: { on: ()=>{} }, pageManager: { on: ()=>{} },
    fileService: {}, pathService: {}, metadataService: {},
    stateManager: { on: ()=>{} }, progressTracker: { on: ()=>{} },
    queueManager: { on: ()=>{} }, imageService: {}
  });

  const testUrls = [
    'https://example.com/page1',      // 有效
    'https://badsite.com/page2',      // 无效域名
    'https://example.com/admin/page', // 被忽略
    'ftp://example.com/file'          // 无效协议
  ];

  testUrls.forEach(url => {
    const valid = mockScraper.validateUrl(url);
    const ignored = mockScraper.isIgnored(url);
    console.log(`   ${url}: 有效=${valid}, 忽略=${ignored}`);
  });

  console.log('\n2. 支持的功能特性:');
  console.log('   ✅ 智能URL收集和去重');
  console.log('   ✅ 多域名和协议验证');
  console.log('   ✅ 页面内容提取和清理');
  console.log('   ✅ 懒加载图片处理');
  console.log('   ✅ 高质量PDF生成');
  console.log('   ✅ 并发控制和队列管理');
  console.log('   ✅ 状态持久化和断点续传');
  console.log('   ✅ 实时进度监控');
  console.log('   ✅ 自动重试机制');
  console.log('   ✅ 完整的资源管理');
}

/**
 * 程序入口
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🌟 Next.js PDF爬虫项目 - 第六阶段演示');
  console.log('🔧 核心爬虫逻辑完整功能展示');
  console.log('');

  // 显示功能特性
  await demonstrateFeatures();

  // 运行实际演示
  runDemo()
    .then(() => {
      console.log('\n💡 提示:');
      console.log('- 检查 demo-output/ 目录查看生成的PDF文件');
      console.log('- 查看 logs/ 目录查看详细日志');
      console.log('- 修改 demoConfig 可以自定义爬取参数');
      console.log('');
      console.log('🚀 第六阶段重构圆满完成！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 演示失败:', error);
      process.exit(1);
    });
}

export { DemoContainer, setupScraperEventListeners, runDemo };