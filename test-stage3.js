// test-stage3.js
import { StateManager } from './src/services/stateManager.js';
import { ProgressTracker } from './src/services/progressTracker.js';
import { QueueManager } from './src/services/queueManager.js';
import { FileService } from './src/services/fileService.js';
import { PathService } from './src/services/pathService.js';
import { ConfigLoader } from './src/config/loader.js';
import { createLogger } from './src/utils/logger.js';
import { delay } from './src/utils/common.js';

async function simulateTask(url, shouldFail = false) {
  await delay(Math.random() * 2000 + 500); // 0.5-2.5秒
  if (shouldFail) {
    throw new Error('模拟任务失败');
  }
  return `处理完成: ${url}`;
}

async function testStage3() {
  console.log('=== 测试第三阶段重构 ===\n');

  // 初始化依赖
  const configLoader = new ConfigLoader('./config.json');
  const config = await configLoader.load();
  const logger = await createLogger(config);
  const fileService = new FileService(logger);
  const pathService = new PathService(config);

  console.log('1. 测试StateManager...');

  const stateManager = new StateManager(fileService, pathService, logger);

  // 测试状态管理
  await stateManager.load();

  // 添加一些测试数据
  const testUrls = [
    'https://example.com/page1',
    'https://example.com/page2',
    'https://example.com/page3'
  ];

  testUrls.forEach((url, index) => {
    stateManager.setUrlIndex(url, index);
  });

  stateManager.markProcessed(testUrls[0]);
  stateManager.markFailed(testUrls[1], new Error('测试错误'));
  stateManager.setArticleTitle(0, '测试文章1');

  console.log('状态统计:', stateManager.getStats());

  // 保存状态
  await stateManager.save();
  console.log('✓ StateManager 测试完成');

  console.log('\n2. 测试ProgressTracker...');

  const progressTracker = new ProgressTracker(logger);

  // 模拟进度追踪
  progressTracker.start(10, { displayMode: 'simple' });

  for (let i = 0; i < 10; i++) {
    const url = `https://example.com/page${i}`;
    progressTracker.startUrl(url);

    await delay(500);

    if (i === 3) {
      progressTracker.failure(url, new Error('模拟失败'));
    } else if (i === 5) {
      progressTracker.skip(url, '已存在');
    } else {
      progressTracker.success(url);
    }
  }

  progressTracker.finish();
  console.log('✓ ProgressTracker 测试完成');

  console.log('\n3. 测试QueueManager...');

  const queueManager = new QueueManager({
    concurrency: 3,
    interval: 1000,
    intervalCap: 3
  });

  // 监听队列事件
  queueManager.on('task-success', ({ id, task }) => {
    console.log(`✓ 任务成功: ${id} (耗时: ${task.duration}ms)`);
  });

  queueManager.on('task-failure', ({ id, error }) => {
    console.log(`✗ 任务失败: ${id} - ${error.message}`);
  });

  // 添加任务
  const tasks = [
    { id: 'task1', fn: () => simulateTask('url1') },
    { id: 'task2', fn: () => simulateTask('url2', true) }, // 会失败
    { id: 'task3', fn: () => simulateTask('url3') },
    { id: 'task4', fn: () => simulateTask('url4') },
    { id: 'task5', fn: () => simulateTask('url5') }
  ];

  console.log('添加5个任务，并发数为3...');
  await queueManager.addBatch(tasks);

  // 等待完成
  await queueManager.waitForIdle();

  console.log('队列状态:', queueManager.getStatus());
  console.log('✓ QueueManager 测试完成');

  console.log('\n4. 测试集成场景...');

  // 模拟真实爬虫场景
  const urls = Array.from({ length: 5 }, (_, i) => `https://example.com/doc${i}`);
  const crawlStateManager = new StateManager(fileService, pathService, logger);
  const crawlProgressTracker = new ProgressTracker(logger);
  const crawlQueueManager = new QueueManager({ concurrency: 2 });

  await crawlStateManager.load();
  crawlStateManager.startAutoSave();
  crawlProgressTracker.start(urls.length);

  // 设置URL索引
  urls.forEach((url, index) => {
    crawlStateManager.setUrlIndex(url, index);
  });

  // 创建爬取任务
  const crawlTasks = urls.map((url, index) => ({
    id: url,
    fn: async () => {
      crawlProgressTracker.startUrl(url);

      // 跳过已处理的
      if (crawlStateManager.isProcessed(url)) {
        crawlProgressTracker.skip(url, '已处理');
        return;
      }

      try {
        await simulateTask(url, index === 2); // 第3个会失败
        crawlStateManager.markProcessed(url);
        crawlProgressTracker.success(url);
      } catch (error) {
        crawlStateManager.markFailed(url, error);
        crawlProgressTracker.failure(url, error);
      }
    }
  }));

  await crawlQueueManager.addBatch(crawlTasks);
  await crawlQueueManager.waitForIdle();

  crawlProgressTracker.finish();
  crawlStateManager.stopAutoSave();
  await crawlStateManager.save(true);

  console.log('最终状态:', crawlStateManager.getStats());
  console.log('✓ 集成测试完成');

  // 导出报告
  const reportPath = pathService.getMetadataPath('test-report');
  await crawlStateManager.exportReport(reportPath.replace('.json', '-state.json'));
  await crawlProgressTracker.exportDetailedReport(
    reportPath.replace('.json', '-progress.json'),
    fileService
  );

  console.log('\n=== 测试完成 ===');
}

testStage3().catch(console.error);
