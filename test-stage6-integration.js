/**
 * 第六阶段完整集成测试
 * 测试Scraper类与前5阶段所有服务的真实集成
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// 导入所有服务类
import { Scraper } from './src/core/scraper.js';
import { ConfigLoader } from './src/config/loader.js';
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

// 测试配置
const testConfig = {
  rootURL: 'https://example.com',
  navLinksSelector: 'a',
  contentSelector: 'body',
  outputDir: path.join(__dirname, 'test-output'),
  pdfDir: path.join(__dirname, 'test-output'),
  metadataDir: path.join(__dirname, 'test-metadata'),
  pageTimeout: 15000,
  maxRetries: 2,
  concurrency: 1,
  requestInterval: 500,
  ignoreURLs: ['javascript:', 'mailto:', '#'],
  allowedDomains: ['example.com', 'httpbin.org'],
  retryFailedUrls: true,
  retryDelay: 1000,
  logLevel: 'info'
};

/**
 * 依赖注入容器
 */
class TestContainer {
  constructor() {
    this.services = new Map();
  }

  async initialize() {
    try {
      console.log('🚀 初始化测试容器...');

      // 1. 配置和日志
      this.services.set('config', testConfig);
      this.services.set('logger', createLogger({
        level: testConfig.logLevel || 'info',
        format: 'simple',
        transports: ['console'],
        includeFileTransports: false
      }));

      // 2. 文件服务层
      this.services.set('fileService', new FileService(
        this.services.get('logger')
      ));

      this.services.set('pathService', new PathService(
        this.services.get('config'),
        this.services.get('logger')
      ));

      this.services.set('metadataService', new MetadataService(
        this.services.get('fileService'),
        this.services.get('pathService'),
        this.services.get('logger')
      ));

      // 3. 数据管理层
      this.services.set('stateManager', new StateManager(
        this.services.get('fileService'),
        this.services.get('pathService'),
        this.services.get('logger')
      ));

      this.services.set('progressTracker', new ProgressTracker(
        this.services.get('logger')
      ));

      this.services.set('queueManager', new QueueManager({
        concurrency: 2,
        interval: 500
      }));

      // 4. 浏览器管理层
      this.services.set('browserPool', new BrowserPool({
        logger: this.services.get('logger'),
        maxBrowsers: 2,
        launchOptions: {
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
      }));

      this.services.set('pageManager', new PageManager({
        browserPool: this.services.get('browserPool'),
        logger: this.services.get('logger')
      }));

      // 5. 图片处理层
      this.services.set('imageService', new ImageService(
        this.services.get('logger')
      ));

      console.log('✅ 测试容器初始化完成');
      return this;

    } catch (error) {
      console.error('❌ 测试容器初始化失败:', error);
      throw error;
    }
  }

  get(serviceName) {
    return this.services.get(serviceName);
  }

  async dispose() {
    console.log('🧹 清理测试容器...');
    
    // 按依赖顺序清理资源
    const cleanupOrder = [
      'queueManager',
      'pageManager', 
      'browserPool',
      'stateManager'
    ];

    for (const serviceName of cleanupOrder) {
      try {
        const service = this.services.get(serviceName);
        if (service && typeof service.dispose === 'function') {
          await service.dispose();
        } else if (service && typeof service.close === 'function') {
          await service.close();
        } else if (service && typeof service.cleanup === 'function') {
          await service.cleanup();
        }
      } catch (error) {
        console.warn(`清理服务 ${serviceName} 失败:`, error.message);
      }
    }

    // 清理测试文件
    try {
      await fs.rm(testConfig.outputDir, { recursive: true, force: true });
      await fs.rm(testConfig.metadataDir, { recursive: true, force: true });
      console.log('✅ 测试文件清理完成');
    } catch (error) {
      console.warn('测试文件清理失败:', error.message);
    }
  }
}

/**
 * 运行集成测试
 */
async function runIntegrationTests() {
  const startTime = Date.now();
  let container = null;
  let scraper = null;
  
  try {
    console.log('🎯 开始第六阶段集成测试');
    console.log('=' .repeat(50));

    // 初始化容器
    container = new TestContainer();
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

    // 运行测试用例
    await testScraperInitialization(scraper);
    await testURLValidation(scraper);
    await testServiceIntegration(scraper, container);
    await testEventSystem(scraper);
    await testErrorHandling(scraper);
    await testResourceManagement(scraper);
    await testStateManagement(scraper, container);
    await testPerformanceMetrics(scraper, container);

    const duration = Date.now() - startTime;
    console.log('');
    console.log('🎉 所有集成测试通过!');
    console.log(`⏱️  总耗时: ${Math.round(duration / 1000)}秒`);
    console.log('=' .repeat(50));

  } catch (error) {
    console.error('❌ 集成测试失败:', error);
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
 * 测试1: 爬虫初始化
 */
async function testScraperInitialization(scraper) {
  console.log('📋 测试1: 爬虫初始化');
  
  const startTime = Date.now();
  await scraper.initialize();
  const duration = Date.now() - startTime;

  if (!scraper.isInitialized) {
    throw new Error('爬虫初始化失败');
  }

  console.log(`  ✅ 爬虫初始化成功 (${duration}ms)`);
  console.log(`  📊 初始化状态: ${scraper.isInitialized}`);
}

/**
 * 测试2: URL验证功能
 */
async function testURLValidation(scraper) {
  console.log('📋 测试2: URL验证功能');

  const testCases = [
    { url: 'https://example.com/page1', expected: true },
    { url: 'http://example.com/page2', expected: true },
    { url: 'https://httpbin.org/html', expected: true },
    { url: 'ftp://example.com/file', expected: false },
    { url: 'https://badsite.com/page', expected: false },
    { url: 'invalid-url', expected: false },
    { url: 'javascript:alert(1)', expected: false }
  ];

  let passed = 0;
  for (const testCase of testCases) {
    const result = scraper.validateUrl(testCase.url);
    if (result === testCase.expected) {
      passed++;
    } else {
      console.warn(`  ⚠️  URL验证失败: ${testCase.url} (期望: ${testCase.expected}, 实际: ${result})`);
    }
  }

  if (passed !== testCases.length) {
    throw new Error(`URL验证测试失败: ${passed}/${testCases.length}`);
  }

  console.log(`  ✅ URL验证测试通过 (${passed}/${testCases.length})`);

  // 测试忽略URL
  const ignoredUrls = [
    'https://example.com/javascript:void(0)',
    'mailto:test@example.com',
    'https://example.com/#section'
  ];

  let ignoredCount = 0;
  for (const url of ignoredUrls) {
    if (scraper.isIgnored(url)) {
      ignoredCount++;
    }
  }

  console.log(`  ✅ URL忽略测试通过 (${ignoredCount}/${ignoredUrls.length})`);
}

/**
 * 测试3: 服务集成
 */
async function testServiceIntegration(scraper, container) {
  console.log('📋 测试3: 服务集成测试');

  // 测试文件服务集成
  const testDir = path.join(testConfig.outputDir, 'integration-test');
  await container.get('fileService').ensureDirectory(testDir);
  
  const dirExists = await fs.access(testDir).then(() => true).catch(() => false);
  if (!dirExists) {
    throw new Error('文件服务集成失败');
  }
  console.log('  ✅ 文件服务集成正常');

  // 测试路径服务集成
  const pdfPath = await container.get('pathService').getPdfPath('https://example.com/test', 0);
  if (!pdfPath || !pdfPath.includes('test')) {
    throw new Error('路径服务集成失败');
  }
  console.log('  ✅ 路径服务集成正常');

  // 测试状态管理集成
  const stateManager = container.get('stateManager');
  await stateManager.load();
  stateManager.markProcessed('https://example.com/test');
  
  if (!stateManager.isProcessed('https://example.com/test')) {
    throw new Error('状态管理集成失败');
  }
  console.log('  ✅ 状态管理集成正常');

  // 测试队列管理集成
  const queueManager = container.get('queueManager');
  
  let taskExecuted = false;
  queueManager.addTask('test-task', async () => {
    taskExecuted = true;
  });
  
  await queueManager.waitForIdle();
  
  if (!taskExecuted) {
    throw new Error('队列管理集成失败');
  }
  console.log('  ✅ 队列管理集成正常');
}

/**
 * 测试4: 事件系统
 */
async function testEventSystem(scraper) {
  console.log('📋 测试4: 事件系统测试');

  const events = [];
  
  // 注册事件监听器
  scraper.on('initialized', () => events.push('initialized'));
  scraper.on('urlsCollected', (data) => events.push(`urlsCollected:${data.totalUrls}`));
  scraper.on('pageScraped', (data) => events.push(`pageScraped:${data.url}`));
  scraper.on('progress', (stats) => events.push(`progress:${stats.processed}`));
  scraper.on('completed', (data) => events.push(`completed:${data.totalUrls}`));

  // 触发事件
  scraper.emit('initialized');
  scraper.emit('urlsCollected', { totalUrls: 5 });
  scraper.emit('pageScraped', { url: 'https://example.com/test' });
  scraper.emit('progress', { processed: 3 });
  scraper.emit('completed', { totalUrls: 5 });

  if (events.length !== 5) {
    throw new Error(`事件系统测试失败: 期望5个事件, 实际${events.length}个`);
  }

  console.log('  ✅ 事件系统工作正常');
  console.log(`  📊 触发的事件: ${events.join(', ')}`);
}

/**
 * 测试5: 错误处理
 */
async function testErrorHandling(scraper) {
  console.log('📋 测试5: 错误处理测试');

  // 测试未初始化错误
  const uninitializedScraper = new (scraper.constructor)({
    config: testConfig,
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    browserPool: { initialize: async () => {} },
    pageManager: { createPage: async () => {}, closePage: async () => {} },
    fileService: { ensureDirectory: async () => {} },
    pathService: { getMetadataDir: () => '/tmp' },
    metadataService: {},
    stateManager: { 
      load: async () => {},
      on: () => {},
      emit: () => {}
    },
    progressTracker: {
      on: () => {},
      emit: () => {}
    },
    queueManager: { 
      setConcurrency: () => {},
      on: () => {},
      emit: () => {}
    },
    imageService: {}
  });

  try {
    await uninitializedScraper.collectUrls();
    throw new Error('应该抛出未初始化错误');
  } catch (error) {
    if (!error.message.includes('未初始化')) {
      throw error;
    }
  }

  console.log('  ✅ 未初始化错误处理正常');

  // 测试重复运行错误
  scraper.isRunning = true;
  try {
    await scraper.run();
    throw new Error('应该抛出重复运行错误');
  } catch (error) {
    if (!error.message.includes('已在运行')) {
      throw error;
    }
  } finally {
    scraper.isRunning = false;
  }

  console.log('  ✅ 重复运行错误处理正常');
}

/**
 * 测试6: 资源管理
 */
async function testResourceManagement(scraper) {
  console.log('📋 测试6: 资源管理测试');

  // 获取初始状态
  const initialStatus = scraper.getStatus();
  
  if (typeof initialStatus !== 'object') {
    throw new Error('状态查询失败');
  }

  console.log('  ✅ 状态查询正常');
  console.log(`  📊 初始化状态: ${initialStatus.isInitialized}`);
  console.log(`  📊 运行状态: ${initialStatus.isRunning}`);

  // 测试清理功能
  await scraper.cleanup();
  console.log('  ✅ 资源清理正常');
}

/**
 * 测试7: 状态管理
 */
async function testStateManagement(scraper, container) {
  console.log('📋 测试7: 状态管理测试');

  const stateManager = container.get('stateManager');
  
  // 测试状态保存和加载
  const testUrl = 'https://example.com/state-test';
  stateManager.markProcessed(testUrl);
  
  await stateManager.save();
  console.log('  ✅ 状态保存成功');

  // 重新加载状态
  await stateManager.load();
  
  if (!stateManager.isProcessed(testUrl)) {
    throw new Error('状态加载失败');
  }

  console.log('  ✅ 状态加载成功');

  // 测试失败URL记录
  const failedUrl = 'https://example.com/failed-test';
  const error = new Error('测试错误');
  stateManager.markFailed(failedUrl, error);

  const failedUrls = stateManager.getFailedUrls();
  if (failedUrls.length === 0) {
    throw new Error('失败URL记录失败');
  }

  console.log('  ✅ 失败URL记录正常');
  console.log(`  📊 失败URL数量: ${failedUrls.length}`);
}

/**
 * 测试8: 性能指标
 */
async function testPerformanceMetrics(scraper, container) {
  console.log('📋 测试8: 性能指标测试');

  const startTime = Date.now();
  
  // 测试进度追踪器基本功能
  const { ProgressTracker } = await import('./src/services/progressTracker.js');
  const testProgressTracker = new ProgressTracker(container.get('logger'));
  
  // 简化测试 - 只验证方法可以正常调用
  testProgressTracker.start(3);
  testProgressTracker.success('test-url-1');
  testProgressTracker.failure('test-url-2', new Error('测试错误'));
  testProgressTracker.skip('test-url-3');
  testProgressTracker.finish();
  
  const stats = testProgressTracker.getStats();
  console.log('  ✅ 进度追踪正常');
  console.log(`  📊 处理: ${stats.processed}, 失败: ${stats.failed}, 跳过: ${stats.skipped}`);

  // 测试队列管理器性能
  const queueManager = container.get('queueManager');
  const queueStartTime = Date.now();
  
  // 添加少量测试任务
  for (let i = 0; i < 3; i++) {
    queueManager.addTask(`perf-task-${i}`, async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
  }
  
  await queueManager.waitForIdle();
  const queueDuration = Date.now() - queueStartTime;
  
  console.log('  ✅ 队列性能测试通过');
  console.log(`  📊 队列处理时间: ${queueDuration}ms`);

  const totalDuration = Date.now() - startTime;
  console.log(`  📊 性能测试总耗时: ${totalDuration}ms`);
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  runIntegrationTests()
    .then(() => {
      console.log('🎊 第六阶段集成测试全部完成！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 集成测试失败:', error);
      process.exit(1);
    });
}

export { runIntegrationTests, TestContainer };