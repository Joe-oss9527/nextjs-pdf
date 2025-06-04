// test-stage4-optimized.js - 第四阶段浏览器管理层优化测试
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

// 工具函数：等待指定时间
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

async function testBrowserPoolBasics() {
  const logger = createTestLogger('browser-pool');
  const browserPool = new BrowserPool({
    maxBrowsers: 2,
    headless: true,
    logger
  });

  try {
    // 初始化
    await browserPool.initialize();
    
    const status = browserPool.getStatus();
    if (status.totalBrowsers !== 2) {
      throw new Error(`期望2个浏览器，实际${status.totalBrowsers}个`);
    }
    
    // 获取浏览器
    const browser1 = await browserPool.getBrowser();
    const browser2 = await browserPool.getBrowser();
    
    const busyStatus = browserPool.getStatus();
    if (busyStatus.availableBrowsers !== 0 || busyStatus.busyBrowsers !== 2) {
      throw new Error('浏览器分配状态不正确');
    }
    
    // 释放浏览器
    browserPool.releaseBrowser(browser1);
    browserPool.releaseBrowser(browser2);
    
    const finalStatus = browserPool.getStatus();
    if (finalStatus.availableBrowsers !== 2 || finalStatus.busyBrowsers !== 0) {
      throw new Error('浏览器释放状态不正确');
    }

  } finally {
    await browserPool.close();
  }
}

async function testPageManagerBasics() {
  const logger = createTestLogger('page-manager');
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

  try {
    // 创建页面
    const page = await pageManager.createPage('test-page');
    
    const pageInfo = pageManager.getPageInfo('test-page');
    if (!pageInfo || pageInfo.id !== 'test-page') {
      throw new Error('页面信息不正确');
    }
    
    // 测试页面导航
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
    const title = await page.title();
    
    if (!title || title.length === 0) {
      throw new Error('页面标题为空');
    }
    
    // 关闭页面
    await pageManager.closePage('test-page');
    
    const finalPageInfo = pageManager.getPageInfo('test-page');
    if (finalPageInfo) {
      throw new Error('页面未正确关闭');
    }

  } finally {
    await pageManager.closeAll();
    await browserPool.close();
  }
}

async function testResourceManagement() {
  const logger = createTestLogger('resource-mgmt');
  const browserPool = new BrowserPool({
    maxBrowsers: 1,
    headless: true,
    logger
  });

  await browserPool.initialize();
  
  const pageManager = new PageManager(browserPool, {
    defaultTimeout: 5000,
    logger
  });

  try {
    // 创建页面
    const page1 = await pageManager.createPage('page-1');
    
    // 确保第一个页面占用了浏览器
    const status1 = browserPool.getStatus();
    if (status1.busyBrowsers !== 1) {
      throw new Error('浏览器未正确分配');
    }
    
    // 尝试创建第二个页面（应该等待或失败）
    let secondPageFailed = false;
    try {
      await Promise.race([
        pageManager.createPage('page-2'),
        delay(2000).then(() => { throw new Error('超时'); })
      ]);
    } catch (error) {
      if (error.message.includes('超时') || error.message.includes('获取浏览器超时')) {
        secondPageFailed = true;
      }
    }
    
    if (!secondPageFailed) {
      throw new Error('应该因为资源不足而失败');
    }
    
    // 关闭第一个页面释放资源
    await pageManager.closePage('page-1');
    
    // 现在应该能创建新页面
    const page2 = await pageManager.createPage('page-2');
    if (!page2) {
      throw new Error('释放资源后应该能创建新页面');
    }
    
    await pageManager.closePage('page-2');

  } finally {
    await pageManager.closeAll();
    await browserPool.close();
  }
}

async function testSequentialPageOperations() {
  const logger = createTestLogger('sequential');
  const browserPool = new BrowserPool({
    maxBrowsers: 1,
    headless: true,
    logger
  });

  await browserPool.initialize();
  
  const pageManager = new PageManager(browserPool, {
    defaultTimeout: 8000,
    enableRequestInterception: true,
    blockedResourceTypes: ['image', 'font'],
    logger
  });

  try {
    const urls = [
      'https://example.com',
      'https://httpbin.org/html',
      'https://httpbin.org/json'
    ];
    
    for (let i = 0; i < urls.length; i++) {
      const pageId = `seq-page-${i}`;
      
      // 创建页面
      const page = await pageManager.createPage(pageId);
      
      // 导航到URL
      await page.goto(urls[i], { waitUntil: 'domcontentloaded' });
      
      // 验证页面加载
      const title = await page.title().catch(() => 'No Title');
      if (title.length === 0) {
        throw new Error(`页面 ${pageId} 标题为空`);
      }
      
      // 关闭页面释放资源
      await pageManager.closePage(pageId);
      
      // 短暂等待确保资源完全释放
      await delay(100);
    }
    
    const finalStatus = pageManager.getStatus();
    if (finalStatus.totalPages !== 0) {
      throw new Error('所有页面应该已关闭');
    }

  } finally {
    await pageManager.closeAll();
    await browserPool.close();
  }
}

async function testErrorHandlingAndRecovery() {
  const logger = createTestLogger('error-handling');
  const browserPool = new BrowserPool({
    maxBrowsers: 1,
    headless: true,
    logger
  });

  await browserPool.initialize();
  
  const pageManager = new PageManager(browserPool, {
    defaultTimeout: 5000,
    logger
  });

  try {
    // 测试重复创建页面
    await pageManager.createPage('duplicate-test');
    
    let duplicateError = false;
    try {
      await pageManager.createPage('duplicate-test');
    } catch (error) {
      if (error.message.includes('已存在')) {
        duplicateError = true;
      }
    }
    
    if (!duplicateError) {
      throw new Error('应该抛出重复创建错误');
    }
    
    // 测试关闭不存在的页面（应该优雅处理）
    await pageManager.closePage('non-existent');
    
    // 测试无效URL导航
    const page = pageManager.getPage('duplicate-test');
    let navigationError = false;
    
    try {
      await page.goto('invalid-url-format', { timeout: 3000 });
    } catch (error) {
      navigationError = true;
    }
    
    if (!navigationError) {
      throw new Error('应该抛出导航错误');
    }
    
    // 页面应该仍然可用于其他操作
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
    const title = await page.title();
    
    if (!title || title.length === 0) {
      throw new Error('错误恢复后页面应该仍然可用');
    }

  } finally {
    await pageManager.closeAll();
    await browserPool.close();
  }
}

async function testPerformanceMetrics() {
  const logger = createTestLogger('performance');
  const browserPool = new BrowserPool({
    maxBrowsers: 1,
    headless: true,
    logger
  });

  await browserPool.initialize();
  
  const pageManager = new PageManager(browserPool, {
    enableRequestInterception: true,
    blockedResourceTypes: ['image', 'font', 'stylesheet'],
    logger
  });

  try {
    // 测量页面创建时间
    const createStart = Date.now();
    const page = await pageManager.createPage('perf-test');
    const createTime = Date.now() - createStart;
    
    if (createTime > 2000) {
      throw new Error(`页面创建太慢: ${createTime}ms`);
    }
    
    // 测量导航时间
    const navStart = Date.now();
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
    const navTime = Date.now() - navStart;
    
    if (navTime > 10000) {
      throw new Error(`页面导航太慢: ${navTime}ms`);
    }
    
    // 测量关闭时间
    const closeStart = Date.now();
    await pageManager.closePage('perf-test');
    const closeTime = Date.now() - closeStart;
    
    if (closeTime > 1000) {
      throw new Error(`页面关闭太慢: ${closeTime}ms`);
    }
    
    console.log(`    📊 性能指标: 创建${createTime}ms, 导航${navTime}ms, 关闭${closeTime}ms`);
    
    // 验证统计信息
    const browserStats = browserPool.getStatus().stats;
    const pageStats = pageManager.getStatus().stats;
    
    if (browserStats.created === 0 || pageStats.created === 0) {
      throw new Error('统计信息不正确');
    }

  } finally {
    await pageManager.closeAll();
    await browserPool.close();
  }
}

async function testConcurrentOperationsWithProperCleanup() {
  const logger = createTestLogger('concurrent');
  const browserPool = new BrowserPool({
    maxBrowsers: 2,
    headless: true,
    logger
  });

  await browserPool.initialize();
  
  const pageManager = new PageManager(browserPool, {
    defaultTimeout: 8000,
    logger
  });

  try {
    const operations = [];
    
    // 创建两个并发操作
    for (let i = 0; i < 2; i++) {
      operations.push(
        (async () => {
          const pageId = `concurrent-${i}`;
          const page = await pageManager.createPage(pageId);
          await page.goto('https://httpbin.org/delay/1', { waitUntil: 'domcontentloaded' });
          const title = await page.title();
          await pageManager.closePage(pageId);
          return { pageId, title };
        })()
      );
    }
    
    const results = await Promise.all(operations);
    
    if (results.length !== 2) {
      throw new Error('并发操作数量不正确');
    }
    
    results.forEach((result, index) => {
      if (!result.pageId || !result.title) {
        throw new Error(`并发操作 ${index} 结果不完整`);
      }
    });
    
    // 验证所有页面都已正确关闭
    const finalStatus = pageManager.getStatus();
    if (finalStatus.totalPages !== 0) {
      throw new Error('并发操作后页面未正确清理');
    }

  } finally {
    await pageManager.closeAll();
    await browserPool.close();
  }
}

async function testBrowserPoolEvents() {
  const logger = createTestLogger('events');
  const browserPool = new BrowserPool({
    maxBrowsers: 1,
    headless: true,
    logger
  });

  let eventsReceived = {
    initialized: false,
    browserAcquired: false,
    browserReleased: false,
    closed: false
  };

  // 设置事件监听器
  browserPool.once('initialized', () => {
    eventsReceived.initialized = true;
  });
  
  browserPool.once('browser-acquired', () => {
    eventsReceived.browserAcquired = true;
  });
  
  browserPool.once('browser-released', () => {
    eventsReceived.browserReleased = true;
  });
  
  browserPool.once('closed', () => {
    eventsReceived.closed = true;
  });

  try {
    await browserPool.initialize();
    
    const browser = await browserPool.getBrowser();
    browserPool.releaseBrowser(browser);
    
    await browserPool.close();
    
    // 验证所有事件都被触发
    Object.entries(eventsReceived).forEach(([event, received]) => {
      if (!received) {
        throw new Error(`事件 ${event} 未被触发`);
      }
    });

  } catch (error) {
    await browserPool.close();
    throw error;
  }
}

// 主测试函数
async function runOptimizedTests() {
  console.log('🚀 第四阶段浏览器管理层 - 优化测试套件');
  console.log('='.repeat(60));
  
  const testSuite = new TestSuite();

  // 运行所有测试
  await testSuite.runTest('浏览器池基础功能', testBrowserPoolBasics);
  await testSuite.runTest('页面管理器基础功能', testPageManagerBasics);
  await testSuite.runTest('资源管理测试', testResourceManagement);
  await testSuite.runTest('顺序页面操作', testSequentialPageOperations);
  await testSuite.runTest('错误处理与恢复', testErrorHandlingAndRecovery);
  await testSuite.runTest('性能指标测试', testPerformanceMetrics);
  await testSuite.runTest('并发操作与清理', testConcurrentOperationsWithProperCleanup);
  await testSuite.runTest('浏览器池事件测试', testBrowserPoolEvents);

  testSuite.printSummary();
  
  if (testSuite.results.failed === 0) {
    console.log('🎉 所有测试通过！第四阶段浏览器管理层实现正确。');
    return true;
  } else {
    console.log('⚠️  有测试失败，请检查实现。');
    return false;
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  runOptimizedTests()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('\n💥 测试执行过程中发生未捕获的错误:', error);
      process.exit(1);
    });
}

export { runOptimizedTests };