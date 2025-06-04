// test-stage5-integration.js - 第五阶段图片处理层集成测试
import { ImageService } from './src/services/imageService.js';
import { BrowserPool } from './src/services/browserPool.js';
import { PageManager } from './src/services/pageManager.js';
import { StateManager } from './src/services/stateManager.js';
import { ProgressTracker } from './src/services/progressTracker.js';
import { QueueManager } from './src/services/queueManager.js';

// 创建测试logger
function createTestLogger(name) {
  return {
    info: (msg, meta) => console.log(`[${name}] INFO:`, msg, meta ? JSON.stringify(meta) : ''),
    warn: (msg, meta) => console.log(`[${name}] WARN:`, msg, meta ? JSON.stringify(meta) : ''),
    error: (msg, meta) => console.log(`[${name}] ERROR:`, msg, meta ? JSON.stringify(meta) : ''),
    debug: (msg, meta) => {} // 静默debug以减少噪音
  };
}

// 工具函数
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class IntegrationTestSuite {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };
    this.logger = createTestLogger('integration-suite');
  }

  async runTest(name, testFn) {
    console.log(`\n🧪 ${name}`);
    const startTime = Date.now();
    
    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.results.passed++;
      this.results.tests.push({ name, status: 'PASS', duration });
      console.log(`✅ ${name} - 通过 (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.failed++;
      this.results.tests.push({ name, status: 'FAIL', error: error.message, duration });
      console.log(`❌ ${name} - 失败: ${error.message} (${duration}ms)`);
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(70));
    console.log('📊 集成测试结果汇总');
    console.log('='.repeat(70));
    
    const total = this.results.passed + this.results.failed;
    const successRate = total > 0 ? (this.results.passed / total * 100).toFixed(1) : 0;
    const totalDuration = this.results.tests.reduce((sum, test) => sum + test.duration, 0);
    const avgDuration = total > 0 ? (totalDuration / total).toFixed(0) : 0;
    
    console.log(`总测试数: ${total}`);
    console.log(`通过: ${this.results.passed}`);
    console.log(`失败: ${this.results.failed}`);
    console.log(`成功率: ${successRate}%`);
    console.log(`总耗时: ${totalDuration}ms`);
    console.log(`平均耗时: ${avgDuration}ms`);
    
    if (this.results.failed > 0) {
      console.log('\n失败的测试:');
      this.results.tests
        .filter(t => t.status === 'FAIL')
        .forEach(t => console.log(`  ❌ ${t.name}: ${t.error} (${t.duration}ms)`));
    }
    
    console.log('='.repeat(70));
  }
}

// 创建完整的服务堆栈
async function createServiceStack() {
  const logger = createTestLogger('service-stack');
  
  // 创建浏览器池
  const browserPool = new BrowserPool({
    maxBrowsers: 2,
    headless: true,
    logger
  });
  
  await browserPool.initialize();
  
  // 创建页面管理器
  const pageManager = new PageManager(browserPool, {
    defaultTimeout: 15000,
    enableRequestInterception: true,
    blockedResourceTypes: ['font'],
    logger
  });
  
  // 创建图片服务
  const imageService = new ImageService({
    defaultTimeout: 12000,
    scrollDelay: 150,
    maxScrollAttempts: 3,
    logger
  });
  
  // 创建队列管理器
  const queueManager = new QueueManager({
    concurrency: 2,
    interval: 1000,
    intervalCap: 2
  });
  
  // 创建进度追踪器
  const progressTracker = new ProgressTracker(logger);
  
  return {
    browserPool,
    pageManager,
    imageService,
    queueManager,
    progressTracker,
    logger
  };
}

// 清理服务堆栈
async function cleanupServiceStack(services) {
  const { browserPool, pageManager, queueManager } = services;
  
  try {
    queueManager.clear();
    await pageManager.closeAll();
    await browserPool.close();
  } catch (error) {
    console.warn('清理服务堆栈时发生错误:', error.message);
  }
}

// 测试基础服务集成
async function testBasicServiceIntegration() {
  const services = await createServiceStack();
  const { pageManager, imageService } = services;
  
  try {
    // 创建页面
    const page = await pageManager.createPage('integration-test');
    
    // 设置图片服务
    await imageService.setupImageObserver(page);
    
    // 导航到测试页面
    await page.goto('https://example.com');
    
    // 处理图片
    const result = await imageService.processPageImages(page, {
      defaultTimeout: 8000
    });
    
    if (!result.hasOwnProperty('success')) {
      throw new Error('图片处理结果格式不正确');
    }
    
    // 清理页面
    await imageService.cleanup(page);
    await pageManager.closePage('integration-test');
    
    console.log(`    📊 处理结果: 成功=${result.success}, 耗时=${result.totalTime}ms`);
    
  } finally {
    await cleanupServiceStack(services);
  }
}

// 测试多页面并发图片处理
async function testConcurrentImageProcessing() {
  const services = await createServiceStack();
  const { pageManager, imageService, progressTracker } = services;
  
  try {
    const urls = [
      'https://example.com',
      'https://httpbin.org/html',
      'https://httpbin.org/json'
    ];
    
    progressTracker.start(urls.length);
    
    const promises = urls.map(async (url, index) => {
      const pageId = `concurrent-${index}`;
      
      try {
        const page = await pageManager.createPage(pageId);
        await imageService.setupImageObserver(page);
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        
        const result = await imageService.processPageImages(page, {
          defaultTimeout: 10000
        });
        
        await imageService.cleanup(page);
        await pageManager.closePage(pageId);
        
        if (result.success) {
          progressTracker.success(url);
        } else {
          progressTracker.failure(url, new Error(result.error || 'Unknown error'));
        }
        
        return { url, success: result.success, pageId };
        
      } catch (error) {
        progressTracker.failure(url, error);
        throw error;
      }
    });
    
    const results = await Promise.all(promises);
    progressTracker.finish();
    
    const successCount = results.filter(r => r.success).length;
    const stats = progressTracker.getStats();
    
    console.log(`    🔄 并发结果: 成功${successCount}/${results.length}, 总耗时${stats.duration || 'N/A'}`);
    
    if (successCount === 0) {
      throw new Error('所有并发操作都失败了');
    }
    
  } finally {
    await cleanupServiceStack(services);
  }
}

// 测试队列管理的图片处理
async function testQueueManagedImageProcessing() {
  const services = await createServiceStack();
  const { pageManager, imageService, queueManager } = services;
  
  try {
    const urls = [
      'https://example.com',
      'https://httpbin.org/html',
      'https://httpbin.org/json'
    ];
    
    let completedTasks = 0;
    let failedTasks = 0;
    
    // 监听队列事件
    queueManager.on('task-success', () => completedTasks++);
    queueManager.on('task-failure', () => failedTasks++);
    
    // 添加任务到队列
    const taskPromises = urls.map((url, index) => {
      return queueManager.addTask(`process-${index}`, async () => {
        const pageId = `queue-task-${index}`;
        const page = await pageManager.createPage(pageId);
        
        try {
          await imageService.setupImageObserver(page);
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          
          const result = await imageService.processPageImages(page, {
            defaultTimeout: 8000
          });
          
          return { url, result };
          
        } finally {
          await imageService.cleanup(page);
          await pageManager.closePage(pageId);
        }
      }, { priority: index });
    });
    
    // 等待所有任务完成
    const results = await Promise.allSettled(taskPromises);
    await queueManager.waitForIdle();
    
    const queueStatus = queueManager.getStatus();
    
    console.log(`    ⚡ 队列结果: 完成${completedTasks}, 失败${failedTasks}, 队列状态: ${JSON.stringify(queueStatus.tasks)}`);
    
    if (completedTasks === 0) {
      throw new Error('队列中没有任务成功完成');
    }
    
  } finally {
    await cleanupServiceStack(services);
  }
}

// 测试资源管理和清理
async function testResourceManagementAndCleanup() {
  const services = await createServiceStack();
  const { browserPool, pageManager, imageService } = services;
  
  try {
    const initialBrowserStatus = browserPool.getStatus();
    
    // 创建多个页面
    const pageIds = ['resource-1', 'resource-2'];
    const pages = [];
    
    for (const pageId of pageIds) {
      const page = await pageManager.createPage(pageId);
      await imageService.setupImageObserver(page);
      await page.goto('https://example.com');
      pages.push({ page, pageId });
    }
    
    const activeBrowserStatus = browserPool.getStatus();
    
    // 验证资源被正确分配
    if (activeBrowserStatus.busyBrowsers === 0) {
      throw new Error('浏览器资源未被正确分配');
    }
    
    // 处理图片并清理
    for (const { page, pageId } of pages) {
      await imageService.processPageImages(page, { defaultTimeout: 5000 });
      await imageService.cleanup(page);
      await pageManager.closePage(pageId);
    }
    
    // 等待资源释放
    await delay(1000);
    
    const finalBrowserStatus = browserPool.getStatus();
    const pageManagerStatus = pageManager.getStatus();
    
    console.log(`    🧹 资源状态: 浏览器[初始:${initialBrowserStatus.busyBrowsers} 活跃:${activeBrowserStatus.busyBrowsers} 最终:${finalBrowserStatus.busyBrowsers}], 页面:${pageManagerStatus.totalPages}`);
    
    // 验证资源被正确释放
    if (finalBrowserStatus.busyBrowsers !== 0) {
      throw new Error('浏览器资源未被正确释放');
    }
    
    if (pageManagerStatus.totalPages !== 0) {
      throw new Error('页面资源未被正确清理');
    }
    
  } finally {
    await cleanupServiceStack(services);
  }
}

// 测试错误恢复和重试机制
async function testErrorRecoveryAndRetry() {
  const services = await createServiceStack();
  const { pageManager, imageService } = services;
  
  try {
    const page = await pageManager.createPage('error-recovery-test');
    
    // 设置图片服务
    await imageService.setupImageObserver(page);
    
    // 测试无效URL处理
    try {
      await page.goto('invalid-url-format', { timeout: 3000 });
    } catch (error) {
      // 预期的错误，测试恢复
    }
    
    // 恢复到正常页面
    await page.goto('https://example.com');
    
    // 验证图片服务仍然工作
    const result = await imageService.processPageImages(page, {
      defaultTimeout: 6000
    });
    
    if (typeof result.success !== 'boolean') {
      throw new Error('错误恢复后图片服务不正常');
    }
    
    console.log(`    🔄 恢复测试: 错误恢复后处理成功=${result.success}`);
    
    await imageService.cleanup(page);
    await pageManager.closePage('error-recovery-test');
    
  } finally {
    await cleanupServiceStack(services);
  }
}

// 测试性能基准
async function testPerformanceBenchmark() {
  const services = await createServiceStack();
  const { pageManager, imageService } = services;
  
  try {
    const benchmarks = [];
    const testCases = [
      { name: 'example.com', url: 'https://example.com' },
      { name: 'httpbin.org', url: 'https://httpbin.org/html' }
    ];
    
    for (const testCase of testCases) {
      const pageId = `benchmark-${testCase.name}`;
      const startTime = Date.now();
      
      const page = await pageManager.createPage(pageId);
      const setupTime = Date.now();
      
      await imageService.setupImageObserver(page);
      const observerTime = Date.now();
      
      await page.goto(testCase.url, { waitUntil: 'domcontentloaded' });
      const navigationTime = Date.now();
      
      const result = await imageService.processPageImages(page, {
        defaultTimeout: 10000
      });
      const processingTime = Date.now();
      
      await imageService.cleanup(page);
      await pageManager.closePage(pageId);
      const cleanupTime = Date.now();
      
      const benchmark = {
        name: testCase.name,
        setup: setupTime - startTime,
        observer: observerTime - setupTime,
        navigation: navigationTime - observerTime,
        processing: processingTime - navigationTime,
        cleanup: cleanupTime - processingTime,
        total: cleanupTime - startTime,
        success: result.success
      };
      
      benchmarks.push(benchmark);
      
      console.log(`    ⚡ ${testCase.name}: 总计${benchmark.total}ms (设置${benchmark.setup}ms + 观察器${benchmark.observer}ms + 导航${benchmark.navigation}ms + 处理${benchmark.processing}ms + 清理${benchmark.cleanup}ms)`);
    }
    
    const avgTotal = benchmarks.reduce((sum, b) => sum + b.total, 0) / benchmarks.length;
    const successCount = benchmarks.filter(b => b.success).length;
    
    if (avgTotal > 20000) {
      throw new Error(`平均处理时间过长: ${avgTotal}ms`);
    }
    
    if (successCount === 0) {
      throw new Error('所有性能测试都失败了');
    }
    
    console.log(`    📊 性能总结: 平均${avgTotal.toFixed(0)}ms, 成功率${successCount}/${benchmarks.length}`);
    
  } finally {
    await cleanupServiceStack(services);
  }
}

// 测试事件系统集成
async function testEventSystemIntegration() {
  const services = await createServiceStack();
  const { browserPool, pageManager, imageService } = services;
  
  try {
    const events = {
      browserAcquired: false,
      browserReleased: false,
      pageCreated: false,
      pageClosed: false,
      observerSetup: false,
      imagesProgress: false,
      cleanupComplete: false
    };
    
    // 设置事件监听器
    browserPool.once('browser-acquired', () => {
      events.browserAcquired = true;
    });
    
    browserPool.once('browser-released', () => {
      events.browserReleased = true;
    });
    
    pageManager.once('page-created', () => {
      events.pageCreated = true;
    });
    
    pageManager.once('page-closed', () => {
      events.pageClosed = true;
    });
    
    imageService.once('observer-setup', () => {
      events.observerSetup = true;
    });
    
    imageService.once('images-progress', () => {
      events.imagesProgress = true;
    });
    
    imageService.once('cleanup-complete', () => {
      events.cleanupComplete = true;
    });
    
    // 执行操作触发事件
    const page = await pageManager.createPage('event-test');
    await imageService.setupImageObserver(page);
    await page.goto('https://example.com');
    await imageService.waitForImages(page, { defaultTimeout: 3000 });
    await imageService.cleanup(page);
    await pageManager.closePage('event-test');
    
    // 验证事件
    const eventNames = Object.keys(events);
    const triggeredEvents = eventNames.filter(name => events[name]);
    
    console.log(`    📡 事件触发: ${triggeredEvents.length}/${eventNames.length} (${triggeredEvents.join(', ')})`);
    
    if (triggeredEvents.length < eventNames.length * 0.7) {
      throw new Error('事件系统集成不完整');
    }
    
  } finally {
    await cleanupServiceStack(services);
  }
}

// 测试内存使用和稳定性
async function testMemoryUsageAndStability() {
  const services = await createServiceStack();
  const { pageManager, imageService } = services;
  
  try {
    const iterations = 5;
    const memoryUsage = [];
    
    for (let i = 0; i < iterations; i++) {
      const pageId = `memory-test-${i}`;
      
      // 记录内存使用
      if (global.gc) {
        global.gc();
      }
      const memStart = process.memoryUsage();
      
      // 执行操作
      const page = await pageManager.createPage(pageId);
      await imageService.setupImageObserver(page);
      await page.goto('https://example.com');
      await imageService.processPageImages(page, { defaultTimeout: 5000 });
      await imageService.cleanup(page);
      await pageManager.closePage(pageId);
      
      // 记录结束内存
      if (global.gc) {
        global.gc();
      }
      const memEnd = process.memoryUsage();
      
      memoryUsage.push({
        iteration: i,
        heapUsed: memEnd.heapUsed - memStart.heapUsed,
        external: memEnd.external - memStart.external
      });
      
      await delay(500); // 等待资源释放
    }
    
    const avgHeapIncrease = memoryUsage.reduce((sum, m) => sum + m.heapUsed, 0) / iterations;
    const maxHeapIncrease = Math.max(...memoryUsage.map(m => m.heapUsed));
    
    console.log(`    🧠 内存使用: 平均增长${(avgHeapIncrease / 1024 / 1024).toFixed(2)}MB, 最大增长${(maxHeapIncrease / 1024 / 1024).toFixed(2)}MB`);
    
    // 检查内存泄漏
    if (avgHeapIncrease > 50 * 1024 * 1024) { // 50MB threshold
      throw new Error('可能存在内存泄漏');
    }
    
  } finally {
    await cleanupServiceStack(services);
  }
}

// 主测试函数
async function runIntegrationTests() {
  console.log('🔗 第五阶段图片处理层 - 集成测试套件');
  console.log('='.repeat(70));
  
  const testSuite = new IntegrationTestSuite();

  // 运行所有集成测试
  await testSuite.runTest('基础服务集成', testBasicServiceIntegration);
  await testSuite.runTest('多页面并发图片处理', testConcurrentImageProcessing);
  await testSuite.runTest('队列管理的图片处理', testQueueManagedImageProcessing);
  await testSuite.runTest('资源管理和清理', testResourceManagementAndCleanup);
  await testSuite.runTest('错误恢复和重试', testErrorRecoveryAndRetry);
  await testSuite.runTest('性能基准测试', testPerformanceBenchmark);
  await testSuite.runTest('事件系统集成', testEventSystemIntegration);
  await testSuite.runTest('内存使用和稳定性', testMemoryUsageAndStability);

  testSuite.printSummary();
  
  if (testSuite.results.failed === 0) {
    console.log('🎉 所有集成测试通过！第五阶段图片处理层与前序阶段完美集成。');
    return true;
  } else {
    console.log('⚠️  有集成测试失败，请检查服务间的协作。');
    return false;
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  runIntegrationTests()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('\n💥 集成测试执行过程中发生未捕获的错误:', error);
      process.exit(1);
    });
}

export { runIntegrationTests };