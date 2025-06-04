// test-stage5.js - 第五阶段图片处理层测试
import { ImageService } from './src/services/imageService.js';
import { BrowserPool } from './src/services/browserPool.js';
import { PageManager } from './src/services/pageManager.js';

// 创建简单的测试logger
function createTestLogger(name) {
  return {
    info: (msg, meta) => console.log(`[${name}] INFO:`, msg, meta ? JSON.stringify(meta) : ''),
    warn: (msg, meta) => console.log(`[${name}] WARN:`, msg, meta ? JSON.stringify(meta) : ''),
    error: (msg, meta) => console.log(`[${name}] ERROR:`, msg, meta ? JSON.stringify(meta) : ''),
    debug: (msg, meta) => {} // 禁用debug以减少噪音
  };
}

// 工具函数
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class TestSuite {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  async runTest(name, testFn) {
    console.log(`\n🧪 ${name}`);
    try {
      await testFn();
      this.results.passed++;
      this.results.tests.push({ name, status: 'PASS' });
      console.log(`✅ ${name} - 通过`);
    } catch (error) {
      this.results.failed++;
      this.results.tests.push({ name, status: 'FAIL', error: error.message });
      console.log(`❌ ${name} - 失败: ${error.message}`);
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试结果汇总');
    console.log('='.repeat(60));
    console.log(`总测试数: ${this.results.passed + this.results.failed}`);
    console.log(`通过: ${this.results.passed}`);
    console.log(`失败: ${this.results.failed}`);
    console.log(`成功率: ${((this.results.passed / (this.results.passed + this.results.failed)) * 100).toFixed(1)}%`);
    
    if (this.results.failed > 0) {
      console.log('\n失败的测试:');
      this.results.tests
        .filter(t => t.status === 'FAIL')
        .forEach(t => console.log(`  ❌ ${t.name}: ${t.error}`));
    }
    console.log('='.repeat(60));
  }
}

async function setupTestEnvironment() {
  const logger = createTestLogger('test-env');
  
  const browserPool = new BrowserPool({
    maxBrowsers: 1,
    headless: true,
    logger
  });
  
  await browserPool.initialize();
  
  const pageManager = new PageManager(browserPool, {
    defaultTimeout: 10000,
    logger
  });
  
  return { browserPool, pageManager, logger };
}

async function cleanupTestEnvironment(browserPool, pageManager) {
  await pageManager.closeAll();
  await browserPool.close();
}

async function testImageServiceBasics() {
  const logger = createTestLogger('image-service');
  const imageService = new ImageService({
    defaultTimeout: 10000,
    logger
  });
  
  // 测试基础属性
  if (!imageService.options.defaultTimeout) {
    throw new Error('默认超时未设置');
  }
  
  if (!imageService.stats) {
    throw new Error('统计信息未初始化');
  }
  
  // 测试统计信息重置
  imageService.stats.imagesProcessed = 5;
  imageService.resetStats();
  
  if (imageService.stats.imagesProcessed !== 0) {
    throw new Error('统计信息重置失败');
  }
  
  // 测试事件发射器
  let eventReceived = false;
  imageService.once('stats-reset', () => {
    eventReceived = true;
  });
  
  imageService.resetStats();
  
  if (!eventReceived) {
    throw new Error('事件未正确发射');
  }
}

async function testImageObserverSetup() {
  const { browserPool, pageManager } = await setupTestEnvironment();
  
  try {
    const logger = createTestLogger('observer-test');
    const imageService = new ImageService({ logger });
    
    const page = await pageManager.createPage('observer-test');
    
    // 设置图片观察器
    await imageService.setupImageObserver(page);
    
    // 导航到测试页面
    await page.goto('https://example.com');
    
    // 检查观察器是否正确设置
    const observerSetup = await page.evaluate(() => {
      return {
        hasObserverSetup: !!window.__imageObserverSetup,
        hasImageObserver: !!window.__imageObserver,
        hasMutationObserver: !!window.__mutationObserver,
        customImageClass: window.Image.name === 'Image'
      };
    });
    
    if (!observerSetup.hasObserverSetup) {
      throw new Error('图片观察器设置标记未找到');
    }
    
    await pageManager.closePage('observer-test');
    
  } finally {
    await cleanupTestEnvironment(browserPool, pageManager);
  }
}

async function testImageLoadingWait() {
  const { browserPool, pageManager } = await setupTestEnvironment();
  
  try {
    const logger = createTestLogger('loading-test');
    const imageService = new ImageService({
      defaultTimeout: 8000,
      logger
    });
    
    const page = await pageManager.createPage('loading-test');
    
    // 设置图片观察器
    await imageService.setupImageObserver(page);
    
    // 导航到有图片的页面
    await page.goto('https://example.com');
    
    // 等待图片加载
    const result = await imageService.waitForImages(page, { defaultTimeout: 5000 });
    
    // 获取统计信息
    const stats = imageService.getStats();
    
    console.log(`    📊 图片统计: 处理${stats.imagesProcessed}张, 加载${stats.imagesLoaded}张, 失败${stats.imagesFailed}张`);
    
    if (typeof result !== 'boolean') {
      throw new Error('waitForImages应该返回布尔值');
    }
    
    await pageManager.closePage('loading-test');
    
  } finally {
    await cleanupTestEnvironment(browserPool, pageManager);
  }
}

async function testPageScrolling() {
  const { browserPool, pageManager } = await setupTestEnvironment();
  
  try {
    const logger = createTestLogger('scroll-test');
    const imageService = new ImageService({
      scrollDistance: 200,
      scrollDelay: 100,
      logger
    });
    
    const page = await pageManager.createPage('scroll-test');
    
    // 导航到较长的页面
    await page.goto('https://httpbin.org/html');
    
    // 滚动页面
    const scrollResult = await imageService.scrollPage(page);
    
    if (!scrollResult.totalHeight || !scrollResult.scrollSteps) {
      throw new Error('滚动结果信息不完整');
    }
    
    if (scrollResult.scrollSteps.length === 0) {
      throw new Error('没有执行滚动步骤');
    }
    
    console.log(`    📏 滚动信息: 页面高度${scrollResult.totalHeight}px, 滚动${scrollResult.scrollSteps.length}步`);
    
    await pageManager.closePage('scroll-test');
    
  } finally {
    await cleanupTestEnvironment(browserPool, pageManager);
  }
}

async function testLazyLoadingTrigger() {
  const { browserPool, pageManager } = await setupTestEnvironment();
  
  try {
    const logger = createTestLogger('lazy-test');
    const imageService = new ImageService({
      defaultTimeout: 8000,
      logger
    });
    
    const page = await pageManager.createPage('lazy-test');
    
    // 设置图片观察器
    await imageService.setupImageObserver(page);
    
    // 创建包含懒加载图片的HTML
    await page.setContent(`
      <html>
        <body>
          <div style="height: 1000px;">
            <img src="https://via.placeholder.com/100x100/blue" alt="normal">
            <img loading="lazy" data-src="https://via.placeholder.com/100x100/red" alt="lazy1">
            <img data-src="https://via.placeholder.com/100x100/green" alt="lazy2">
            <div style="height: 2000px;">更多内容</div>
            <img data-original="https://via.placeholder.com/100x100/yellow" alt="lazy3">
          </div>
        </body>
      </html>
    `);
    
    // 触发懒加载
    const lazyResult = await imageService.triggerLazyLoading(page);
    
    if (!lazyResult.totalLazyImages) {
      throw new Error('没有检测到懒加载图片');
    }
    
    if (lazyResult.triggered === 0) {
      throw new Error('没有触发任何懒加载图片');
    }
    
    console.log(`    🖼️  懒加载统计: 检测${lazyResult.totalLazyImages}张, 触发${lazyResult.triggered}张`);
    
    await pageManager.closePage('lazy-test');
    
  } finally {
    await cleanupTestEnvironment(browserPool, pageManager);
  }
}

async function testCompleteImageProcessing() {
  const { browserPool, pageManager } = await setupTestEnvironment();
  
  try {
    const logger = createTestLogger('complete-test');
    const imageService = new ImageService({
      defaultTimeout: 10000,
      maxScrollAttempts: 2,
      logger
    });
    
    const page = await pageManager.createPage('complete-test');
    
    // 导航到有图片的页面
    await page.goto('https://example.com');
    
    // 完整的图片处理流程
    const result = await imageService.processPageImages(page);
    
    if (!result.success && !result.error) {
      throw new Error('处理结果信息不完整');
    }
    
    if (!result.stats) {
      throw new Error('统计信息缺失');
    }
    
    console.log(`    ⏱️  处理时间: ${result.totalTime}ms, 尝试次数: ${result.attempts}`);
    
    // 清理资源
    await imageService.cleanup(page);
    
    await pageManager.closePage('complete-test');
    
  } finally {
    await cleanupTestEnvironment(browserPool, pageManager);
  }
}

async function testImageServiceEvents() {
  const { browserPool, pageManager } = await setupTestEnvironment();
  
  try {
    const logger = createTestLogger('events-test');
    const imageService = new ImageService({ logger });
    
    const events = {
      observerSetup: false,
      imagesProgress: false,
      scrollComplete: false,
      cleanupComplete: false
    };
    
    // 设置事件监听器
    imageService.once('observer-setup', () => {
      events.observerSetup = true;
    });
    
    imageService.once('images-progress', () => {
      events.imagesProgress = true;
    });
    
    imageService.once('scroll-complete', () => {
      events.scrollComplete = true;
    });
    
    imageService.once('cleanup-complete', () => {
      events.cleanupComplete = true;
    });
    
    const page = await pageManager.createPage('events-test');
    
    // 触发事件
    await imageService.setupImageObserver(page);
    await page.goto('https://example.com');
    await imageService.waitForImages(page, { defaultTimeout: 3000 });
    await imageService.scrollPage(page);
    await imageService.cleanup(page);
    
    await pageManager.closePage('events-test');
    
    // 验证事件
    Object.entries(events).forEach(([event, received]) => {
      if (!received) {
        throw new Error(`事件 ${event} 未被触发`);
      }
    });
    
  } finally {
    await cleanupTestEnvironment(browserPool, pageManager);
  }
}

async function testErrorHandling() {
  const { browserPool, pageManager } = await setupTestEnvironment();
  
  try {
    const logger = createTestLogger('error-test');
    const imageService = new ImageService({
      defaultTimeout: 2000,
      logger
    });
    
    const page = await pageManager.createPage('error-test');
    
    // 测试无效页面处理
    try {
      await page.goto('invalid-url', { timeout: 1000 });
    } catch (error) {
      // 预期的错误
    }
    
    // 设置观察器应该仍然工作
    await imageService.setupImageObserver(page);
    
    // 导航到正常页面
    await page.goto('https://example.com');
    
    // 测试超时处理
    const result = await imageService.waitForImages(page, { defaultTimeout: 1000 });
    
    // 超时应该返回false但不抛出错误
    if (result === null || result === undefined) {
      throw new Error('超时处理不正确');
    }
    
    await pageManager.closePage('error-test');
    
  } finally {
    await cleanupTestEnvironment(browserPool, pageManager);
  }
}

async function testPerformanceMetrics() {
  const { browserPool, pageManager } = await setupTestEnvironment();
  
  try {
    const logger = createTestLogger('perf-test');
    const imageService = new ImageService({
      defaultTimeout: 8000,
      logger
    });
    
    const page = await pageManager.createPage('perf-test');
    
    // 测量观察器设置性能
    const setupStart = Date.now();
    await imageService.setupImageObserver(page);
    const setupTime = Date.now() - setupStart;
    
    if (setupTime > 1000) {
      throw new Error(`观察器设置太慢: ${setupTime}ms`);
    }
    
    // 测量页面处理性能
    await page.goto('https://example.com');
    
    const processStart = Date.now();
    const result = await imageService.processPageImages(page, {
      defaultTimeout: 5000
    });
    const processTime = Date.now() - processStart;
    
    if (processTime > 15000) {
      throw new Error(`图片处理太慢: ${processTime}ms`);
    }
    
    console.log(`    ⚡ 性能指标: 设置${setupTime}ms, 处理${processTime}ms`);
    
    // 验证统计信息
    const stats = imageService.getStats();
    if (typeof stats.averageLoadTime !== 'number') {
      throw new Error('平均加载时间计算错误');
    }
    
    await pageManager.closePage('perf-test');
    
  } finally {
    await cleanupTestEnvironment(browserPool, pageManager);
  }
}

async function testImageServiceWithRealWebsite() {
  const { browserPool, pageManager } = await setupTestEnvironment();
  
  try {
    const logger = createTestLogger('real-site-test');
    const imageService = new ImageService({
      defaultTimeout: 15000,
      maxScrollAttempts: 2,
      logger
    });
    
    const page = await pageManager.createPage('real-site-test');
    
    // 测试真实网站
    await page.goto('https://httpbin.org/html', { waitUntil: 'networkidle0' });
    
    // 完整处理流程
    const result = await imageService.processPageImages(page);
    
    const stats = imageService.getStats();
    
    console.log(`    🌐 真实网站测试: 成功=${result.success}, 图片${stats.imagesProcessed}张, 懒加载${stats.lazyImagesTriggered}张`);
    
    if (result.totalTime > 30000) {
      throw new Error('真实网站处理时间过长');
    }
    
    await pageManager.closePage('real-site-test');
    
  } finally {
    await cleanupTestEnvironment(browserPool, pageManager);
  }
}

// 主测试函数
async function runImageServiceTests() {
  console.log('🖼️  第五阶段图片处理层测试套件');
  console.log('='.repeat(60));
  
  const testSuite = new TestSuite();

  // 运行所有测试
  await testSuite.runTest('图片服务基础功能', testImageServiceBasics);
  await testSuite.runTest('图片观察器设置', testImageObserverSetup);
  await testSuite.runTest('图片加载等待', testImageLoadingWait);
  await testSuite.runTest('页面滚动功能', testPageScrolling);
  await testSuite.runTest('懒加载触发', testLazyLoadingTrigger);
  await testSuite.runTest('完整图片处理', testCompleteImageProcessing);
  await testSuite.runTest('事件系统测试', testImageServiceEvents);
  await testSuite.runTest('错误处理测试', testErrorHandling);
  await testSuite.runTest('性能指标测试', testPerformanceMetrics);
  await testSuite.runTest('真实网站测试', testImageServiceWithRealWebsite);

  testSuite.printSummary();
  
  if (testSuite.results.failed === 0) {
    console.log('🎉 所有测试通过！第五阶段图片处理层实现正确。');
    return true;
  } else {
    console.log('⚠️  有测试失败，请检查实现。');
    return false;
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  runImageServiceTests()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('\n💥 测试执行过程中发生未捕获的错误:', error);
      process.exit(1);
    });
}

export { runImageServiceTests };