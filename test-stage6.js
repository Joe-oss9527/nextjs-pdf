/**
 * 第六阶段测试：核心爬虫逻辑
 * 测试Scraper类的完整功能
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { Scraper } from './src/core/scraper.js';

// 模拟依赖
const mockDependencies = {
  config: {
    rootURL: 'https://example.com',
    navLinksSelector: 'a.nav-link',
    contentSelector: '.content',
    outputDir: './output',
    pageTimeout: 30000,
    maxRetries: 3,
    concurrency: 2,
    requestInterval: 1000,
    ignoreURLs: ['admin', 'login'],
    allowedDomains: ['example.com'],
    retryFailedUrls: true,
    retryDelay: 1000
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  },
  browserPool: {
    initialize: jest.fn().mockResolvedValue(),
    close: jest.fn().mockResolvedValue()
  },
  pageManager: {
    createPage: jest.fn(),
    closePage: jest.fn().mockResolvedValue(),
    closeAll: jest.fn().mockResolvedValue()
  },
  fileService: {
    ensureDirectory: jest.fn().mockResolvedValue()
  },
  pathService: {
    getPdfPath: jest.fn().mockReturnValue('./output/test.pdf'),
    getMetadataDir: jest.fn().mockReturnValue('./metadata')
  },
  metadataService: {
    setArticleTitle: jest.fn().mockResolvedValue(),
    recordImageLoadFailure: jest.fn().mockResolvedValue()
  },
  stateManager: new (class extends EventEmitter {
    constructor() {
      super();
      this.state = {
        processedUrls: new Set(),
        failedUrls: new Map(),
        articleTitles: new Map()
      };
    }
    load = jest.fn().mockResolvedValue();
    save = jest.fn().mockResolvedValue();
    isProcessed = jest.fn().mockReturnValue(false);
    markProcessed = jest.fn();
    markFailed = jest.fn();
    getFailedUrls = jest.fn().mockReturnValue([]);
  })(),
  progressTracker: new (class extends EventEmitter {
    constructor() {
      super();
      this.stats = { processed: 0, failed: 0, skipped: 0 };
    }
    start = jest.fn();
    success = jest.fn();
    failure = jest.fn();
    skip = jest.fn();
    finish = jest.fn();
    getStats = jest.fn().mockReturnValue(this.stats);
  })(),
  queueManager: new (class extends EventEmitter {
    constructor() {
      super();
      this.tasks = [];
    }
    initialize = jest.fn().mockResolvedValue();
    configure = jest.fn();
    addTask = jest.fn((task, options) => {
      this.tasks.push({ task, options });
    });
    waitForCompletion = jest.fn().mockResolvedValue();
    pause = jest.fn().mockResolvedValue();
    resume = jest.fn().mockResolvedValue();
    clear = jest.fn().mockResolvedValue();
    dispose = jest.fn().mockResolvedValue();
    getStats = jest.fn().mockReturnValue({ pending: 0, running: 0, completed: 0 });
  })(),
  imageService: {
    setupImageObserver: jest.fn().mockResolvedValue(),
    triggerLazyLoading: jest.fn().mockResolvedValue(true)
  }
};

// 模拟页面对象
const createMockPage = () => ({
  goto: jest.fn().mockResolvedValue(),
  waitForSelector: jest.fn().mockResolvedValue(),
  evaluate: jest.fn(),
  pdf: jest.fn().mockResolvedValue()
});

describe('第六阶段：核心爬虫逻辑测试', () => {
  let scraper;

  beforeEach(() => {
    // 重置所有模拟
    jest.clearAllMocks();
    
    // 创建新的爬虫实例
    scraper = new Scraper(mockDependencies);
  });

  afterEach(async () => {
    // 清理爬虫实例
    if (scraper && scraper.isRunning) {
      await scraper.stop();
    }
  });

  describe('1. 爬虫初始化', () => {
    it('应该成功初始化爬虫', async () => {
      await scraper.initialize();

      expect(scraper.isInitialized).toBe(true);
      expect(mockDependencies.browserPool.initialize).toHaveBeenCalled();
      expect(mockDependencies.stateManager.load).toHaveBeenCalled();
      expect(mockDependencies.queueManager.initialize).toHaveBeenCalled();
      expect(mockDependencies.fileService.ensureDirectory).toHaveBeenCalledWith('./output');
    });

    it('应该防止重复初始化', async () => {
      await scraper.initialize();
      await scraper.initialize(); // 第二次初始化

      expect(mockDependencies.browserPool.initialize).toHaveBeenCalledTimes(1);
      expect(mockDependencies.logger.warn).toHaveBeenCalledWith('爬虫已经初始化');
    });

    it('应该处理初始化失败', async () => {
      mockDependencies.browserPool.initialize.mockRejectedValue(new Error('浏览器初始化失败'));

      await expect(scraper.initialize()).rejects.toThrow('浏览器初始化失败');
      expect(scraper.isInitialized).toBe(false);
    });
  });

  describe('2. URL收集功能', () => {
    beforeEach(async () => {
      await scraper.initialize();
    });

    it('应该成功收集URL', async () => {
      const mockPage = createMockPage();
      mockPage.evaluate.mockResolvedValue([
        'https://example.com/page1',
        'https://example.com/page2',
        'https://example.com/page3'
      ]);

      mockDependencies.pageManager.createPage.mockResolvedValue(mockPage);

      const urls = await scraper.collectUrls();

      expect(urls).toHaveLength(3);
      expect(urls).toContain('https://example.com/page1');
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({ waitUntil: 'networkidle0' })
      );
      expect(mockDependencies.pageManager.closePage).toHaveBeenCalledWith('url-collector');
    });

    it('应该正确去重URL', async () => {
      const mockPage = createMockPage();
      mockPage.evaluate.mockResolvedValue([
        'https://example.com/page1',
        'https://example.com/page1/', // 重复 (尾部斜杠)
        'https://example.com/page1?utm=test', // 重复 (查询参数)
        'https://example.com/page2'
      ]);

      mockDependencies.pageManager.createPage.mockResolvedValue(mockPage);

      const urls = await scraper.collectUrls();

      expect(urls).toHaveLength(2);
      expect(mockDependencies.logger.info).toHaveBeenCalledWith(
        'URL收集完成',
        expect.objectContaining({
          原始数量: 4,
          去重后数量: 2
        })
      );
    });

    it('应该忽略配置的URL', async () => {
      const mockPage = createMockPage();
      mockPage.evaluate.mockResolvedValue([
        'https://example.com/page1',
        'https://example.com/admin/dashboard', // 应被忽略
        'https://example.com/login', // 应被忽略
        'https://example.com/page2'
      ]);

      mockDependencies.pageManager.createPage.mockResolvedValue(mockPage);

      const urls = await scraper.collectUrls();

      expect(urls).toHaveLength(2);
      expect(urls).not.toContain('https://example.com/admin/dashboard');
      expect(urls).not.toContain('https://example.com/login');
    });

    it('应该处理页面加载失败', async () => {
      const mockPage = createMockPage();
      mockPage.goto.mockRejectedValue(new Error('页面加载失败'));
      mockDependencies.pageManager.createPage.mockResolvedValue(mockPage);

      await expect(scraper.collectUrls()).rejects.toThrow('URL收集失败');
      expect(mockDependencies.pageManager.closePage).toHaveBeenCalled();
    });
  });

  describe('3. 页面爬取功能', () => {
    beforeEach(async () => {
      await scraper.initialize();
      scraper.urlQueue = ['https://example.com/page1'];
    });

    it('应该成功爬取页面', async () => {
      const mockPage = createMockPage();
      mockPage.evaluate
        .mockResolvedValueOnce('测试页面标题') // 标题提取
        .mockResolvedValueOnce(); // 页面清理

      mockDependencies.pageManager.createPage.mockResolvedValue(mockPage);
      mockDependencies.imageService.triggerLazyLoading.mockResolvedValue(true);

      const result = await scraper.scrapePage('https://example.com/page1', 0);

      expect(result.status).toBe('success');
      expect(result.title).toBe('测试页面标题');
      expect(mockPage.pdf).toHaveBeenCalled();
      expect(mockDependencies.stateManager.markProcessed).toHaveBeenCalledWith('https://example.com/page1');
      expect(mockDependencies.progressTracker.success).toHaveBeenCalled();
    });

    it('应该跳过已处理的URL', async () => {
      mockDependencies.stateManager.isProcessed.mockReturnValue(true);

      const result = await scraper.scrapePage('https://example.com/page1', 0);

      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('already_processed');
      expect(mockDependencies.progressTracker.skip).toHaveBeenCalled();
      expect(mockDependencies.pageManager.createPage).not.toHaveBeenCalled();
    });

    it('应该处理图片加载失败', async () => {
      const mockPage = createMockPage();
      mockPage.evaluate
        .mockResolvedValueOnce('测试标题')
        .mockResolvedValueOnce();

      mockDependencies.pageManager.createPage.mockResolvedValue(mockPage);
      mockDependencies.imageService.triggerLazyLoading.mockResolvedValue(false);

      await scraper.scrapePage('https://example.com/page1', 0);

      expect(mockDependencies.metadataService.recordImageLoadFailure)
        .toHaveBeenCalledWith('https://example.com/page1');
    });

    it('应该处理页面爬取失败', async () => {
      const mockPage = createMockPage();
      mockPage.goto.mockRejectedValue(new Error('网络错误'));
      mockDependencies.pageManager.createPage.mockResolvedValue(mockPage);

      await expect(scraper.scrapePage('https://example.com/page1', 0))
        .rejects.toThrow('页面爬取失败');

      expect(mockDependencies.stateManager.markFailed).toHaveBeenCalled();
      expect(mockDependencies.progressTracker.failure).toHaveBeenCalled();
      expect(mockDependencies.pageManager.closePage).toHaveBeenCalled();
    });

    it('应该定期保存状态', async () => {
      const mockPage = createMockPage();
      mockPage.evaluate.mockResolvedValue('标题').mockResolvedValueOnce();
      mockDependencies.pageManager.createPage.mockResolvedValue(mockPage);
      
      // 模拟已处理10个页面
      mockDependencies.progressTracker.getStats.mockReturnValue({ processed: 10 });

      await scraper.scrapePage('https://example.com/page1', 0);

      expect(mockDependencies.stateManager.save).toHaveBeenCalled();
    });
  });

  describe('4. 重试机制', () => {
    beforeEach(async () => {
      await scraper.initialize();
    });

    it('应该重试失败的URL', async () => {
      const failedUrls = [
        ['https://example.com/failed1', { message: '原始错误' }],
        ['https://example.com/failed2', { message: '另一个错误' }]
      ];
      
      mockDependencies.stateManager.getFailedUrls.mockReturnValue(failedUrls);
      scraper.urlQueue = ['https://example.com/failed1', 'https://example.com/failed2'];

      // 模拟页面爬取
      const mockPage = createMockPage();
      mockPage.evaluate.mockResolvedValue('重试标题').mockResolvedValueOnce();
      mockDependencies.pageManager.createPage.mockResolvedValue(mockPage);

      await scraper.retryFailedUrls();

      expect(mockDependencies.logger.info).toHaveBeenCalledWith(
        '开始重试 2 个失败的URL'
      );
      expect(mockDependencies.stateManager.state.failedUrls.delete).toHaveBeenCalledTimes(2);
    });

    it('应该处理没有失败URL的情况', async () => {
      mockDependencies.stateManager.getFailedUrls.mockReturnValue([]);

      await scraper.retryFailedUrls();

      expect(mockDependencies.logger.info).toHaveBeenCalledWith(
        '没有需要重试的失败URL'
      );
    });
  });

  describe('5. 爬虫运行控制', () => {
    it('应该完整运行爬虫流程', async () => {
      const mockPage = createMockPage();
      mockPage.evaluate
        .mockResolvedValueOnce(['https://example.com/page1', 'https://example.com/page2']) // URL收集
        .mockResolvedValue('页面标题') // 标题提取
        .mockResolvedValue(); // 页面清理

      mockDependencies.pageManager.createPage.mockResolvedValue(mockPage);

      await scraper.run();

      expect(scraper.isInitialized).toBe(true);
      expect(mockDependencies.progressTracker.start).toHaveBeenCalled();
      expect(mockDependencies.queueManager.addTask).toHaveBeenCalledTimes(2);
      expect(mockDependencies.queueManager.waitForCompletion).toHaveBeenCalled();
      expect(mockDependencies.stateManager.save).toHaveBeenCalled();
      expect(mockDependencies.progressTracker.finish).toHaveBeenCalled();
    });

    it('应该防止重复运行', async () => {
      scraper.isRunning = true;

      await expect(scraper.run()).rejects.toThrow('爬虫已在运行中');
    });

    it('应该暂停和恢复爬虫', async () => {
      scraper.isRunning = true;

      await scraper.pause();
      expect(mockDependencies.queueManager.pause).toHaveBeenCalled();

      await scraper.resume();
      expect(mockDependencies.queueManager.resume).toHaveBeenCalled();
    });

    it('应该停止爬虫', async () => {
      scraper.isRunning = true;

      await scraper.stop();

      expect(scraper.isRunning).toBe(false);
      expect(mockDependencies.queueManager.clear).toHaveBeenCalled();
    });
  });

  describe('6. 资源管理', () => {
    it('应该正确清理资源', async () => {
      await scraper.cleanup();

      expect(mockDependencies.queueManager.dispose).toHaveBeenCalled();
      expect(mockDependencies.pageManager.closeAll).toHaveBeenCalled();
      expect(mockDependencies.browserPool.close).toHaveBeenCalled();
      expect(mockDependencies.stateManager.save).toHaveBeenCalled();
    });

    it('应该处理清理失败', async () => {
      mockDependencies.queueManager.dispose.mockRejectedValue(new Error('清理失败'));

      await expect(scraper.cleanup()).rejects.toThrow('清理失败');
    });
  });

  describe('7. 事件系统', () => {
    it('应该触发正确的事件', async () => {
      const initSpy = jest.fn();
      const progressSpy = jest.fn();
      const completedSpy = jest.fn();

      scraper.on('initialized', initSpy);
      scraper.on('progress', progressSpy);
      scraper.on('completed', completedSpy);

      // 模拟简单的运行流程
      const mockPage = createMockPage();
      mockPage.evaluate.mockResolvedValueOnce([]).mockResolvedValue();
      mockDependencies.pageManager.createPage.mockResolvedValue(mockPage);

      await scraper.run();

      expect(initSpy).toHaveBeenCalled();
      expect(completedSpy).toHaveBeenCalled();
    });
  });

  describe('8. 状态查询', () => {
    it('应该返回正确的状态信息', () => {
      scraper.isInitialized = true;
      scraper.isRunning = true;
      scraper.startTime = Date.now() - 5000;
      scraper.urlQueue = ['url1', 'url2', 'url3'];

      const status = scraper.getStatus();

      expect(status.isInitialized).toBe(true);
      expect(status.isRunning).toBe(true);
      expect(status.totalUrls).toBe(3);
      expect(status.uptime).toBeGreaterThan(4000);
      expect(status.progress).toBeDefined();
      expect(status.queue).toBeDefined();
    });
  });

  describe('9. URL验证', () => {
    it('应该正确验证URL', () => {
      expect(scraper.validateUrl('https://example.com/page1')).toBe(true);
      expect(scraper.validateUrl('http://example.com/page1')).toBe(true);
      expect(scraper.validateUrl('ftp://example.com/file')).toBe(false);
      expect(scraper.validateUrl('invalid-url')).toBe(false);
      expect(scraper.validateUrl('https://other-domain.com/page')).toBe(false);
    });

    it('应该正确识别忽略的URL', () => {
      expect(scraper.isIgnored('https://example.com/admin/page')).toBe(true);
      expect(scraper.isIgnored('https://example.com/login')).toBe(true);
      expect(scraper.isIgnored('https://example.com/normal-page')).toBe(false);
    });
  });

  describe('10. 错误处理', () => {
    it('应该处理未初始化的操作', async () => {
      const uninitializedScraper = new Scraper(mockDependencies);

      await expect(uninitializedScraper.collectUrls())
        .rejects.toThrow('爬虫尚未初始化');
    });

    it('应该处理网络错误', async () => {
      await scraper.initialize();
      
      const mockPage = createMockPage();
      mockPage.goto.mockRejectedValue(new Error('网络连接失败'));
      mockDependencies.pageManager.createPage.mockResolvedValue(mockPage);

      await expect(scraper.collectUrls()).rejects.toThrow('URL收集失败');
    });
  });
});

console.log('🚀 第六阶段核心爬虫逻辑测试文件已创建');
console.log('📋 测试覆盖范围：');
console.log('  ✅ 爬虫初始化');
console.log('  ✅ URL收集和去重');
console.log('  ✅ 页面爬取流程');
console.log('  ✅ 重试机制');
console.log('  ✅ 运行控制（暂停/恢复/停止）');
console.log('  ✅ 资源管理和清理');
console.log('  ✅ 事件系统');
console.log('  ✅ 状态查询');
console.log('  ✅ URL验证和过滤');
console.log('  ✅ 错误处理');
console.log('');
console.log('💡 运行测试命令: npm test test-stage6.js');