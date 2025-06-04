// test-stage4.js - 第四阶段浏览器管理层测试
import { BrowserPool } from './src/services/browserPool.js';
import { PageManager } from './src/services/pageManager.js';

// 创建简单的同步logger用于测试
function createTestLogger(name) {
  return {
    info: (msg, meta) => console.log(`[${name}] INFO:`, msg, meta || ''),
    warn: (msg, meta) => console.log(`[${name}] WARN:`, msg, meta || ''),
    error: (msg, meta) => console.log(`[${name}] ERROR:`, msg, meta || ''),
    debug: (msg, meta) => console.log(`[${name}] DEBUG:`, msg, meta || '')
  };
}

async function testBrowserPool() {
  console.log('\n🚀 测试 BrowserPool 功能...');
  
  const logger = createTestLogger('test');
  const browserPool = new BrowserPool({
    maxBrowsers: 2,
    headless: true,
    logger
  });

  try {
    // 测试初始化
    console.log('1. 测试浏览器池初始化...');
    await browserPool.initialize();
    
    const initialStatus = browserPool.getStatus();
    console.log('   初始状态:', {
      totalBrowsers: initialStatus.totalBrowsers,
      availableBrowsers: initialStatus.availableBrowsers,
      isInitialized: initialStatus.isInitialized
    });

    // 测试获取浏览器
    console.log('2. 测试获取浏览器实例...');
    const browser1 = await browserPool.getBrowser();
    const browser2 = await browserPool.getBrowser();
    
    const busyStatus = browserPool.getStatus();
    console.log('   使用中状态:', {
      availableBrowsers: busyStatus.availableBrowsers,
      busyBrowsers: busyStatus.busyBrowsers
    });

    // 测试释放浏览器
    console.log('3. 测试释放浏览器...');
    browserPool.releaseBrowser(browser1);
    
    const releasedStatus = browserPool.getStatus();
    console.log('   释放后状态:', {
      availableBrowsers: releasedStatus.availableBrowsers,
      busyBrowsers: releasedStatus.busyBrowsers
    });

    // 测试事件监听
    console.log('4. 测试事件监听...');
    browserPool.on('browser-acquired', (data) => {
      console.log('   事件: 浏览器被获取', data.browserId);
    });

    browserPool.on('browser-released', (data) => {
      console.log('   事件: 浏览器被释放', data.browserId);
    });

    const browser3 = await browserPool.getBrowser();
    browserPool.releaseBrowser(browser3);

    // 释放剩余浏览器
    browserPool.releaseBrowser(browser2);

    // 测试统计信息
    const finalStats = browserPool.getStatus();
    console.log('5. 最终统计信息:', finalStats.stats);

    // 关闭浏览器池
    await browserPool.close();
    console.log('✅ BrowserPool 测试完成');

  } catch (error) {
    console.error('❌ BrowserPool 测试失败:', error.message);
    await browserPool.close();
  }
}

async function testPageManager() {
  console.log('\n📄 测试 PageManager 功能...');

  const logger = createTestLogger('test');
  const browserPool = new BrowserPool({
    maxBrowsers: 1,
    headless: true,
    logger
  });

  await browserPool.initialize();

  const pageManager = new PageManager(browserPool, {
    defaultTimeout: 10000,
    navigationTimeout: 15000,
    enableRequestInterception: true,
    blockedResourceTypes: ['image', 'font'],
    logger
  });

  try {
    // 测试创建页面
    console.log('1. 测试页面创建...');
    const page = await pageManager.createPage('test-page-1');
    
    const pageInfo = pageManager.getPageInfo('test-page-1');
    console.log('   页面信息:', {
      id: pageInfo.id,
      createdAt: new Date(pageInfo.createdAt).toISOString(),
      requestCount: pageInfo.requestCount
    });

    // 测试页面导航
    console.log('2. 测试页面导航...');
    await page.goto('https://example.com', { waitUntil: 'networkidle0' });
    
    const title = await page.title();
    console.log('   页面标题:', title);

    // 测试多页面创建
    console.log('3. 测试多页面管理...');
    const page2 = await pageManager.createPage('test-page-2');
    await page2.goto('https://httpbin.org/html');
    
    const status = pageManager.getStatus();
    console.log('   页面管理器状态:', {
      totalPages: status.totalPages,
      activeBrowsers: status.activeBrowsers,
      stats: status.stats
    });

    // 测试事件监听
    console.log('4. 测试事件监听...');
    pageManager.on('page-created', (data) => {
      console.log('   事件: 页面已创建', data.id);
    });

    pageManager.on('page-closed', (data) => {
      console.log('   事件: 页面已关闭', data.id);
    });

    pageManager.on('page-response', (data) => {
      console.log('   事件: 页面响应', data.url, data.status);
    });

    // 创建第三个页面触发事件
    const page3 = await pageManager.createPage('test-page-3');
    await page3.goto('https://httpbin.org/json');

    // 测试页面关闭
    console.log('5. 测试页面关闭...');
    await pageManager.closePage('test-page-2');
    
    const afterCloseStatus = pageManager.getStatus();
    console.log('   关闭后状态:', {
      totalPages: afterCloseStatus.totalPages,
      activeBrowsers: afterCloseStatus.activeBrowsers
    });

    // 测试批量关闭
    console.log('6. 测试批量关闭...');
    await pageManager.closeAll();
    
    const finalStatus = pageManager.getStatus();
    console.log('   最终状态:', {
      totalPages: finalStatus.totalPages,
      stats: finalStatus.stats
    });

    console.log('✅ PageManager 测试完成');

  } catch (error) {
    console.error('❌ PageManager 测试失败:', error.message);
    await pageManager.closeAll();
  } finally {
    await browserPool.close();
  }
}

async function testIntegration() {
  console.log('\n🔗 测试集成功能...');

  const logger = createTestLogger('integration-test');
  const browserPool = new BrowserPool({
    maxBrowsers: 2,
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
    // 并发创建多个页面
    console.log('1. 测试并发页面操作...');
    const promises = [];
    
    for (let i = 0; i < 3; i++) {
      promises.push(
        pageManager.createPage(`concurrent-page-${i}`)
          .then(page => page.goto('https://httpbin.org/delay/1'))
      );
    }

    await Promise.all(promises);
    console.log('   并发页面创建和导航完成');

    // 测试资源拦截统计
    const stats = pageManager.getStatus();
    console.log('2. 资源拦截统计:', {
      blockedRequests: stats.stats.blockedRequests,
      totalRequests: stats.stats.totalRequests
    });

    // 测试页面信息详情
    console.log('3. 页面详细信息:');
    stats.pages.forEach(page => {
      console.log(`   页面 ${page.id}: 请求${page.requestCount}次, 错误${page.errorCount}次, 空闲${Math.round(page.idleTime/1000)}秒`);
    });

    // 测试清理功能
    console.log('4. 测试清理功能...');
    // 等待一段时间让页面进入空闲状态
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const cleanedCount = await pageManager.cleanup(500); // 0.5秒超时
    console.log(`   清理了 ${cleanedCount} 个超时页面`);

    console.log('✅ 集成测试完成');

  } catch (error) {
    console.error('❌ 集成测试失败:', error.message);
  } finally {
    await pageManager.closeAll();
    await browserPool.close();
  }
}

async function testErrorHandling() {
  console.log('\n⚠️  测试错误处理...');

  const logger = createTestLogger('error-test');
  const browserPool = new BrowserPool({
    maxBrowsers: 1,
    headless: true,
    logger
  });

  await browserPool.initialize();

  const pageManager = new PageManager(browserPool, { logger });

  try {
    // 测试重复创建页面
    console.log('1. 测试重复创建页面...');
    await pageManager.createPage('duplicate-test');
    
    try {
      await pageManager.createPage('duplicate-test');
      console.log('   ❌ 应该抛出错误');
    } catch (error) {
      console.log('   ✅ 正确捕获重复创建错误:', error.message);
    }

    // 测试关闭不存在的页面
    console.log('2. 测试关闭不存在的页面...');
    await pageManager.closePage('non-existent-page');
    console.log('   ✅ 优雅处理不存在的页面');

    // 测试无效URL导航
    console.log('3. 测试无效URL导航...');
    const page = pageManager.getPage('duplicate-test');
    
    try {
      await page.goto('invalid-url', { timeout: 5000 });
    } catch (error) {
      console.log('   ✅ 正确捕获导航错误:', error.message.substring(0, 50) + '...');
    }

    // 测试浏览器池资源管理
    console.log('4. 测试浏览器池资源管理...');
    const page2 = await pageManager.createPage('resource-test');
    
    // 此时浏览器池应该已满
    const poolStatus = browserPool.getStatus();
    console.log('   浏览器池状态:', {
      available: poolStatus.availableBrowsers,
      busy: poolStatus.busyBrowsers
    });

    console.log('✅ 错误处理测试完成');

  } catch (error) {
    console.error('❌ 错误处理测试失败:', error.message);
  } finally {
    await pageManager.closeAll();
    await browserPool.close();
  }
}

async function testPerformance() {
  console.log('\n⚡ 测试性能指标...');

  const logger = createTestLogger('performance-test');
  const browserPool = new BrowserPool({
    maxBrowsers: 1,
    headless: true,
    logger
  });

  await browserPool.initialize();

  const pageManager = new PageManager(browserPool, {
    enableRequestInterception: true,
    blockedResourceTypes: ['image', 'font', 'stylesheet', 'media'],
    logger
  });

  try {
    console.log('1. 测试页面创建性能...');
    const createStart = Date.now();
    const page = await pageManager.createPage('perf-test');
    const createTime = Date.now() - createStart;
    console.log(`   页面创建耗时: ${createTime}ms`);

    console.log('2. 测试页面导航性能...');
    const navStart = Date.now();
    await page.goto('https://httpbin.org/html', { waitUntil: 'domcontentloaded' });
    const navTime = Date.now() - navStart;
    console.log(`   页面导航耗时: ${navTime}ms`);

    console.log('3. 测试页面关闭性能...');
    const closeStart = Date.now();
    await pageManager.closePage('perf-test');
    const closeTime = Date.now() - closeStart;
    console.log(`   页面关闭耗时: ${closeTime}ms`);

    console.log('4. 性能统计:');
    const browserStats = browserPool.getStatus().stats;
    const pageStats = pageManager.getStatus().stats;
    
    console.log('   浏览器统计:', {
      创建: browserStats.created,
      断开: browserStats.disconnected,
      错误: browserStats.errors,
      总请求: browserStats.totalRequests
    });
    
    console.log('   页面统计:', {
      创建: pageStats.created,
      关闭: pageStats.closed,
      错误: pageStats.errors,
      阻止请求: pageStats.blockedRequests
    });

    console.log('✅ 性能测试完成');

  } catch (error) {
    console.error('❌ 性能测试失败:', error.message);
  } finally {
    await pageManager.closeAll();
    await browserPool.close();
  }
}

async function runAllTests() {
  console.log('🧪 开始第四阶段浏览器管理层测试\n');
  console.log('='.repeat(50));

  try {
    await testBrowserPool();
    await testPageManager();
    await testIntegration();
    await testErrorHandling();
    await testPerformance();

    console.log('\n' + '='.repeat(50));
    console.log('🎉 所有测试完成！');
    
  } catch (error) {
    console.error('\n💥 测试过程中发生未捕获的错误:', error);
    process.exit(1);
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests()
    .then(() => {
      console.log('\n✨ 测试执行完毕');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 测试执行失败:', error);
      process.exit(1);
    });
}

export {
  testBrowserPool,
  testPageManager,
  testIntegration,
  testErrorHandling,
  testPerformance
};