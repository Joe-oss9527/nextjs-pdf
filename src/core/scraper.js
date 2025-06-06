/**
 * 核心爬虫类 - 修复PDF文件命名使用数字索引
 */

import path from 'path';
import { EventEmitter } from 'events';
import { normalizeUrl, getUrlHash, validateUrl as utilValidateUrl } from '../utils/url.js';
import { NetworkError, ValidationError } from '../utils/errors.js';
import { retry, delay } from '../utils/common.js';

export class Scraper extends EventEmitter {
  constructor(dependencies) {
    super();

    // 依赖注入 - 集成前5阶段的所有服务
    this.config = dependencies.config;
    this.logger = dependencies.logger;
    this.browserPool = dependencies.browserPool;
    this.pageManager = dependencies.pageManager;
    this.fileService = dependencies.fileService;
    this.pathService = dependencies.pathService;
    this.metadataService = dependencies.metadataService;
    this.stateManager = dependencies.stateManager;
    this.progressTracker = dependencies.progressTracker;
    this.queueManager = dependencies.queueManager;
    this.imageService = dependencies.imageService;

    // 内部状态
    this.urlQueue = [];
    this.urlSet = new Set();
    this.isInitialized = false;
    this.isRunning = false;
    this.startTime = null;

    // 绑定事件处理
    this._bindEvents();
  }

  /**
   * 绑定事件处理器
   */
  _bindEvents() {
    // 监听状态管理器事件
    this.stateManager.on('stateLoaded', (state) => {
      this.logger.info('爬虫状态已加载', {
        processedCount: state.processedUrls.size,
        failedCount: state.failedUrls.size
      });
    });

    // 监听进度追踪器事件
    this.progressTracker.on('progress', (stats) => {
      this.emit('progress', stats);
    });

    // 监听队列管理器事件
    this.queueManager.on('taskCompleted', (task) => {
      this.logger.debug('任务完成', { url: task.url });
    });

    this.queueManager.on('taskFailed', (task, error) => {
      this.logger.warn('任务失败', { url: task.url, error: error.message });
    });
  }

  /**
   * 初始化爬虫
   */
  async initialize() {
    if (this.isInitialized) {
      this.logger.warn('爬虫已经初始化');
      return;
    }

    try {
      this.logger.info('开始初始化爬虫...');

      // 初始化浏览器池（如果还没有初始化）
      if (!this.browserPool.isInitialized) {
        await this.browserPool.initialize();
      }

      // 加载状态（如果还没有加载）
      if (this.stateManager && typeof this.stateManager.load === 'function') {
        await this.stateManager.load();
      }

      // 配置队列管理器
      this.queueManager.setConcurrency(this.config.concurrency || 3);

      // 确保输出目录存在
      await this.fileService.ensureDirectory(this.config.pdfDir);

      // 确保元数据目录存在
      const metadataDir = path.join(this.config.pdfDir, 'metadata');
      await this.fileService.ensureDirectory(metadataDir);

      this.isInitialized = true;
      this.logger.info('爬虫初始化完成');
      this.emit('initialized');

    } catch (error) {
      this.logger.error('爬虫初始化失败', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * 收集URL
   */
  async collectUrls() {
    if (!this.isInitialized) {
      throw new ValidationError('爬虫尚未初始化');
    }

    this.logger.info('开始收集URL', { rootURL: this.config.rootURL });

    let page = null;
    try {
      // 创建页面
      page = await this.pageManager.createPage('url-collector');

      // 导航到根页面
      await retry(
        () => page.goto(this.config.rootURL, {
          waitUntil: 'networkidle0',
          timeout: this.config.pageTimeout || 30000
        }),
        {
          maxAttempts: this.config.maxRetries || 3,
          delay: 2000,
          onRetry: (attempt, error) => {
            this.logger.warn(`URL收集页面加载重试 ${attempt}次`, {
              url: this.config.rootURL,
              error: error.message
            });
          }
        }
      );

      // 等待导航链接加载
      try {
        await page.waitForSelector(this.config.navLinksSelector, {
          timeout: 10000
        });
      } catch (error) {
        this.logger.warn('导航链接选择器等待超时', {
          selector: this.config.navLinksSelector,
          error: error.message
        });
      }

      // 提取URL
      const rawUrls = await page.evaluate((selector) => {
        const elements = document.querySelectorAll(selector);
        return Array.from(elements)
          .map(el => {
            const href = el.href || el.getAttribute('href');
            return href ? href.trim() : null;
          })
          .filter(href => href && !href.startsWith('#') && !href.startsWith('javascript:'));
      }, this.config.navLinksSelector);

      this.logger.info(`提取到 ${rawUrls.length} 个原始URL`);

      // URL去重和规范化
      const normalizedUrls = new Map();
      const duplicates = new Set();

      rawUrls.forEach((url, index) => {
        try {
          const normalized = normalizeUrl(url);
          const hash = getUrlHash(normalized);

          if (normalizedUrls.has(hash)) {
            duplicates.add(url);
            return;
          }

          if (!this.isIgnored(normalized) && this.validateUrl(normalized)) {
            normalizedUrls.set(hash, {
              original: url,
              normalized: normalized,
              index: index
            });
          }
        } catch (error) {
          this.logger.warn('URL规范化失败', { url, error: error.message });
        }
      });

      // 构建最终URL队列
      this.urlQueue = Array.from(normalizedUrls.values()).map(item => item.normalized);
      this.urlQueue.forEach(url => this.urlSet.add(url));

      // 记录统计信息
      this.logger.info('URL收集完成', {
        原始数量: rawUrls.length,
        去重后数量: this.urlQueue.length,
        重复数量: duplicates.size,
        被忽略数量: rawUrls.length - normalizedUrls.size - duplicates.size
      });

      if (duplicates.size > 0) {
        this.logger.debug('发现重复URL', {
          count: duplicates.size,
          examples: Array.from(duplicates).slice(0, 5)
        });
      }

      this.emit('urlsCollected', {
        totalUrls: this.urlQueue.length,
        duplicates: duplicates.size
      });

      return this.urlQueue;

    } catch (error) {
      this.logger.error('URL收集失败', {
        error: error.message,
        stack: error.stack
      });
      throw new NetworkError('URL收集失败', this.config.rootURL, error);

    } finally {
      if (page) {
        // 🔧 修复：在关闭页面前清理图片服务
        try {
          await this.imageService.cleanupPage(page);
        } catch (cleanupError) {
          this.logger?.debug('URL收集页面的图片服务清理失败（非致命错误）', {
            error: cleanupError.message
          });
        }
        await this.pageManager.closePage('url-collector');
      }
    }
  }

  /**
   * 检查URL是否应被忽略
   */
  isIgnored(url) {
    if (!this.config.ignoreURLs || !Array.isArray(this.config.ignoreURLs)) {
      return false;
    }

    return this.config.ignoreURLs.some(pattern => {
      if (typeof pattern === 'string') {
        return url.includes(pattern);
      }
      if (pattern instanceof RegExp) {
        return pattern.test(url);
      }
      return false;
    });
  }

  /**
   * 验证URL是否有效
   */
  validateUrl(url) {
    try {
      // 基础URL验证
      if (!utilValidateUrl(url, this.config.allowedDomains)) {
        return false;
      }

      const parsedUrl = new URL(url);

      // 检查允许的域名
      if (this.config.allowedDomains && this.config.allowedDomains.length > 0) {
        const isAllowed = this.config.allowedDomains.some(domain => {
          return parsedUrl.hostname === domain || parsedUrl.hostname.endsWith('.' + domain);
        });
        if (!isAllowed) {
          return false;
        }
      }

      // 检查协议
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return false;
      }

      return true;

    } catch (error) {
      this.logger.debug('URL验证失败', { url, error: error.message });
      return false;
    }
  }

  /**
   * 渐进式导航策略 - 从快到慢尝试不同的等待策略
   */
  async navigateWithFallback(page, url) {
    const strategies = [
      // 1. 快速策略 - 适合简单页面
      {
        name: 'domcontentloaded',
        options: { waitUntil: 'domcontentloaded', timeout: 15000 }
      },
      // 2. 标准策略 - 等待网络空闲
      {
        name: 'networkidle2',
        options: { waitUntil: 'networkidle2', timeout: 30000 }
      },
      // 3. 完整策略 - 等待所有资源
      {
        name: 'networkidle0',
        options: { waitUntil: 'networkidle0', timeout: 45000 }
      },
      // 4. 最大容忍策略 - 仅等待页面加载
      {
        name: 'load',
        options: { waitUntil: 'load', timeout: 60000 }
      }
    ];

    let lastError = null;

    for (const strategy of strategies) {
      try {
        this.logger.debug(`尝试导航策略: ${strategy.name}`, { url });
        
        const response = await page.goto(url, strategy.options);
        
        // 检查响应状态
        if (response && response.status() >= 400) {
          throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
        }

        this.logger.debug(`导航成功使用策略: ${strategy.name}`, { url });
        return { success: true, strategy: strategy.name };

      } catch (error) {
        lastError = error;
        this.logger.warn(`导航策略 ${strategy.name} 失败`, {
          url,
          error: error.message
        });

        // 如果是超时错误，继续尝试下一个策略
        if (error.message.includes('timeout') || error.message.includes('Navigation timeout')) {
          continue;
        }

        // 如果是其他错误，根据错误类型决定是否继续
        if (error.message.includes('net::ERR_ABORTED') || 
            error.message.includes('net::ERR_FAILED')) {
          // 网络错误，尝试等待一下再重试
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }

        // 其他类型的错误直接失败
        break;
      }
    }

    return { success: false, error: lastError?.message || 'All navigation strategies failed' };
  }

  /**
   * 爬取单个页面 - 关键修改：使用数字索引命名
   */
  async scrapePage(url, index) {
    // 检查是否已处理
    if (this.stateManager.isProcessed(url)) {
      this.logger.debug(`跳过已处理的URL: ${url}`);
      this.progressTracker.skip(url);
      return { status: 'skipped', reason: 'already_processed' };
    }

    const pageId = `scraper-page-${index}`;
    let page = null;

    try {
      this.logger.info(`开始爬取页面 [${index + 1}/${this.urlQueue.length}]: ${url}`);

      // 创建页面
      page = await this.pageManager.createPage(pageId);

      // 设置图片观察器
      await this.imageService.setupImageObserver(page);

      // 访问页面 - 使用渐进式超时策略
      const navigationResult = await this.navigateWithFallback(page, url);
      if (!navigationResult.success) {
        throw new Error(`导航失败: ${navigationResult.error}`);
      }

      // 等待内容加载
      let contentFound = false;
      try {
        await page.waitForSelector(this.config.contentSelector, {
          timeout: 10000
        });
        contentFound = true;
      } catch (error) {
        this.logger.warn('内容选择器等待超时', {
          url,
          selector: this.config.contentSelector,
          error: error.message
        });
      }

      if (!contentFound) {
        throw new ValidationError('页面内容未找到');
      }

      // 提取页面标题
      const title = await page.evaluate((selector) => {
        const contentElement = document.querySelector(selector);
        if (!contentElement) return '';

        // 尝试多种标题提取方式
        const h1 = contentElement.querySelector('h1');
        const title = contentElement.querySelector('title, .title, .page-title');
        const heading = contentElement.querySelector('h2, h3');

        return (h1?.innerText || title?.innerText || heading?.innerText || '').trim();
      }, this.config.contentSelector);

      // 处理懒加载图片
      let imagesLoaded = false;
      try {
        imagesLoaded = await this.imageService.triggerLazyLoading(page);
        if (!imagesLoaded) {
          this.logger.warn(`部分图片未能加载: ${url}`);
          await this.metadataService.logImageLoadFailure(url, index);
        }
      } catch (error) {
        this.logger.warn('图片加载处理失败', { url, error: error.message });
        await this.metadataService.logImageLoadFailure(url, index);
      }

      // 清理页面内容
      await page.evaluate((selector) => {
        const contentElement = document.querySelector(selector);
        if (contentElement) {
          // 移除不需要的元素
          const elementsToRemove = [
            'script', 'noscript', 'style',
            'button', 'input', 'textarea', 'select',
            '.advertisement', '.ads', '.sidebar',
            '.navigation', '.nav', '.menu',
            '.comments', '.comment-section'
          ];

          elementsToRemove.forEach(sel => {
            contentElement.querySelectorAll(sel).forEach(el => el.remove());
          });

          // 设置为页面唯一内容
          document.body.innerHTML = contentElement.outerHTML;

          // 添加基础样式
          const style = document.createElement('style');
          style.textContent = `
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              margin: 20px;
              color: #333;
            }
            img {
              max-width: 100%;
              height: auto;
            }
          `;
          document.head.appendChild(style);
        }
      }, this.config.contentSelector);

      // 🔥 关键修改：生成PDF时使用数字索引而不是哈希
      const pdfPath = this.pathService.getPdfPath(url, {
        useHash: false,  // 使用索引而不是哈希
        index: index
      });

      await this.fileService.ensureDirectory(path.dirname(pdfPath));

      await page.pdf({
        path: pdfPath,
        format: 'A4',
        margin: {
          top: '1cm',
          right: '1cm',
          bottom: '1cm',
          left: '1cm'
        },
        printBackground: true,
        preferCSSPageSize: false
      });

      this.logger.info(`PDF已保存: ${pdfPath}`);

      // 保存URL到索引的映射，用于追溯和调试
      this.stateManager.setUrlIndex(url, index);

      // 标记为已处理
      this.stateManager.markProcessed(url, pdfPath);
      this.progressTracker.success(url);

      // 如果有标题，保存标题映射（使用字符串索引以匹配Python期望）
      if (title) {
        await this.metadataService.saveArticleTitle(String(index), title);
        this.logger.debug(`提取到标题 [${index}]: ${title}`);
      }

      // 定期保存状态
      const processedCount = this.progressTracker.getStats().processed;
      if (processedCount % 10 === 0) {
        await this.stateManager.save();
        this.logger.debug('状态已保存', { processedCount });
      }

      this.emit('pageScraped', {
        url,
        index,
        title,
        pdfPath,
        imagesLoaded
      });

      return {
        status: 'success',
        title,
        pdfPath,
        imagesLoaded
      };

    } catch (error) {
      this.logger.error(`页面爬取失败 [${index + 1}]: ${url}`, {
        error: error.message,
        stack: error.stack
      });

      // 记录失败
      this.stateManager.markFailed(url, error);
      this.progressTracker.failure(url, error);

      this.emit('pageScrapeFailed', {
        url,
        index,
        error: error.message
      });

      throw new NetworkError(`页面爬取失败: ${url}`, url, error);

    } finally {
      // 🔧 修复：正确的清理顺序
      if (page) {
        try {
          // 1. 先清理页面相关的图片服务资源
          await this.imageService.cleanupPage(page);
        } catch (cleanupError) {
          this.logger?.debug('图片服务页面清理失败（非致命错误）', {
            error: cleanupError.message
          });
        }

        // 2. 然后关闭页面
        await this.pageManager.closePage(pageId);
      }
    }
  }

  /**
   * 重试失败的URL
   */
  async retryFailedUrls() {
    const failedUrls = this.stateManager.getFailedUrls();
    if (failedUrls.length === 0) {
      this.logger.info('没有需要重试的失败URL');
      return;
    }

    this.logger.info(`开始重试 ${failedUrls.length} 个失败的URL`);

    let retrySuccessCount = 0;
    let retryFailCount = 0;

    for (const [url, errorInfo] of failedUrls) {
      try {
        this.logger.info(`重试失败的URL: ${url}`);

        // 清除失败状态
        this.stateManager.state.failedUrls.delete(url);
        this.stateManager.state.processedUrls.delete(url);

        // 重新爬取
        const index = this.urlQueue.indexOf(url);
        const realIndex = index >= 0 ? index : this.urlQueue.length;

        await this.scrapePage(url, realIndex);
        retrySuccessCount++;

        // 重试间隔
        await delay(this.config.retryDelay || 2000);

      } catch (retryError) {
        retryFailCount++;
        this.logger.error(`重试失败: ${url}`, {
          原始错误: errorInfo?.message || 'Unknown',
          重试错误: retryError.message
        });

        // 重新标记为失败
        this.stateManager.markFailed(url, retryError);
      }
    }

    this.logger.info('重试完成', {
      成功: retrySuccessCount,
      失败: retryFailCount
    });

    this.emit('retryCompleted', {
      successCount: retrySuccessCount,
      failCount: retryFailCount
    });
  }

  /**
   * 运行爬虫
   */
  async run() {
    if (this.isRunning) {
      throw new ValidationError('爬虫已在运行中');
    }

    this.isRunning = true;
    this.startTime = Date.now();

    try {
      this.logger.info('=== 开始运行爬虫（使用数字索引命名）===');

      // 初始化
      await this.initialize();

      // 收集URL
      const urls = await this.collectUrls();
      if (urls.length === 0) {
        this.logger.warn('没有找到可爬取的URL');
        return;
      }

      // 开始进度追踪
      this.progressTracker.start(urls.length);

      // 添加任务到队列
      urls.forEach((url, index) => {
        this.queueManager.addTask(`scrape-${index}`, async () => {
          try {
            await this.scrapePage(url, index);
          } catch (error) {
            // 错误已经被记录，这里只是防止队列中断
            this.logger.debug('队列任务失败，但已处理', { url, error: error.message });
          }
        }, {
          url: url,
          priority: 0
        });
      });

      // 等待所有任务完成
      await this.queueManager.waitForIdle();

      // 保存最终状态
      await this.stateManager.save();

      // 重试失败的URL
      if (this.config.retryFailedUrls !== false) {
        await this.retryFailedUrls();
        await this.stateManager.save();
      }

      // 完成
      this.progressTracker.finish();

      const duration = Date.now() - this.startTime;
      const stats = this.progressTracker.getStats();

      this.logger.info('=== 爬虫运行完成 ===', {
        总URL数: urls.length,
        成功数: stats.processed,
        失败数: stats.failed,
        跳过数: stats.skipped,
        耗时: `${Math.round(duration / 1000)}秒`,
        成功率: `${((stats.processed / urls.length) * 100).toFixed(1)}%`
      });

      this.emit('completed', {
        totalUrls: urls.length,
        stats: stats,
        duration: duration
      });

    } catch (error) {
      this.logger.error('爬虫运行失败', {
        error: error.message,
        stack: error.stack
      });

      this.emit('error', error);
      throw error;

    } finally {
      this.isRunning = false;

      // 清理资源
      try {
        await this.cleanup();
      } catch (cleanupError) {
        this.logger.error('资源清理失败', {
          error: cleanupError.message
        });
      }
    }
  }

  /**
   * 暂停爬虫
   */
  async pause() {
    if (!this.isRunning) {
      this.logger.warn('爬虫未在运行，无法暂停');
      return;
    }

    this.logger.info('暂停爬虫...');
    await this.queueManager.pause();
    this.emit('paused');
  }

  /**
   * 恢复爬虫
   */
  async resume() {
    if (!this.isRunning) {
      this.logger.warn('爬虫未在运行，无法恢复');
      return;
    }

    this.logger.info('恢复爬虫...');
    await this.queueManager.resume();
    this.emit('resumed');
  }

  /**
   * 停止爬虫
   */
  async stop() {
    if (!this.isRunning) {
      this.logger.warn('爬虫未在运行');
      return;
    }

    this.logger.info('停止爬虫...');
    this.isRunning = false;

    await this.queueManager.clear();
    await this.cleanup();

    this.emit('stopped');
  }

  /**
   * 清理资源 - 🔧 修复版本
   */
  async cleanup() {
    this.logger.info('开始清理资源...');

    try {
      // 1. 暂停并清理队列管理器
      if (this.queueManager) {
        this.queueManager.pause();
        this.queueManager.clear();
      }

      // 2. 🔧 修复：图片服务的全局清理将由容器自动调用 dispose()
      // 这里不需要手动调用，避免重复清理

      // 3. 清理页面管理器（这会关闭所有页面）
      if (this.pageManager) {
        await this.pageManager.closeAll();
      }

      // 4. 清理浏览器池
      if (this.browserPool) {
        await this.browserPool.close();
      }

      // 5. 保存最终状态
      if (this.stateManager) {
        await this.stateManager.save();
      }

      this.logger.info('资源清理完成');
      this.emit('cleanup');

    } catch (error) {
      this.logger.error('资源清理失败', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * 获取爬虫状态
   */
  getStatus() {
    const stats = this.progressTracker.getStats();
    const queueStats = this.queueManager.getStatus();

    return {
      isInitialized: this.isInitialized,
      isRunning: this.isRunning,
      startTime: this.startTime,
      totalUrls: this.urlQueue.length,
      progress: stats,
      queue: queueStats,
      uptime: this.startTime ? Date.now() - this.startTime : 0
    };
  }
}

export default Scraper;
