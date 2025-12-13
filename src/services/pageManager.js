// src/services/pageManager.js
import { EventEmitter } from 'events';
import { NetworkError } from '../utils/errors.js';

/**
 * 页面管理服务
 * 提供页面的创建、配置、生命周期管理功能
 */
export class PageManager extends EventEmitter {
  constructor(browserPool, options = {}) {
    super();

    this.browserPool = browserPool;
    this.options = {
      defaultTimeout: options.defaultTimeout || 30000,
      navigationTimeout: options.navigationTimeout || 30000,
      enableRequestInterception: options.enableRequestInterception !== false,
      blockedResourceTypes: options.blockedResourceTypes || [],
      userAgent: options.userAgent || null,
      viewport: options.viewport || { width: 1920, height: 1080 },
      ...options,
    };

    this.logger = options.logger;
    this.pages = new Map();
    this.isClosed = false;

    // 统计信息
    this.stats = {
      created: 0,
      closed: 0,
      errors: 0,
      active: 0,
      totalRequests: 0,
      blockedRequests: 0,
    };
  }

  /**
   * 创建新页面
   */
  async createPage(id, options = {}) {
    if (this.isClosed) {
      throw new Error('页面管理器已关闭');
    }

    if (this.pages.has(id)) {
      throw new Error(`页面 ${id} 已存在`);
    }

    let browser = null;
    let page = null;

    try {
      // 从浏览器池获取浏览器实例
      browser = await this.browserPool.getBrowser();
      this.stats.totalRequests++;

      // 创建新页面
      page = await browser.newPage();
      this.stats.created++;
      this.stats.active++;

      // 配置页面
      await this.configurePage(page, { ...this.options, ...options });

      // 设置页面事件监听
      this.setupPageEvents(page, id);

      // 存储页面信息
      const pageInfo = {
        id,
        page,
        browser,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        requestCount: 0,
        errorCount: 0,
      };

      this.pages.set(id, pageInfo);

      this.logger?.debug(`创建页面成功 [${id}]`, {
        totalPages: this.pages.size,
        activeBrowsers: this.browserPool.getStatus().busyBrowsers,
      });

      this.emit('page-created', { id, pageInfo });
      return page;
    } catch (error) {
      this.stats.errors++;

      // 如果页面创建失败，确保释放浏览器
      if (browser) {
        this.browserPool.releaseBrowser(browser);
      }

      this.logger?.error(`创建页面失败 [${id}]`, { error: error.message });
      throw new NetworkError(`页面创建失败: ${error.message}`, { cause: error });
    }
  }

  /**
   * 配置页面
   */
  async configurePage(page, options) {
    try {
      // 设置超时时间
      page.setDefaultTimeout(options.defaultTimeout);
      page.setDefaultNavigationTimeout(options.navigationTimeout);

      // 设置视口
      if (options.viewport) {
        await page.setViewport(options.viewport);
      }

      // 设置用户代理
      if (options.userAgent) {
        await page.setUserAgent(options.userAgent);
      }

      // 启用请求拦截以优化性能
      if (options.enableRequestInterception) {
        await page.setRequestInterception(true);

        page.on('request', (request) => {
          const resourceType = request.resourceType();
          const url = request.url();

          // 阻止不必要的资源类型
          if (options.blockedResourceTypes.includes(resourceType)) {
            this.stats.blockedRequests++;
            request.abort();
            return;
          }

          // 可以添加更多的过滤逻辑
          // 例如：阻止特定域名、广告、分析脚本等
          if (this.shouldBlockRequest(url, resourceType)) {
            this.stats.blockedRequests++;
            request.abort();
            return;
          }

          request.continue();
        });
      }

      // 设置额外的页面配置 - 增强反检测
      await page.evaluateOnNewDocument(() => {
        // 隐藏 webdriver 特征
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });

        // 覆盖自动化控制标志
        delete navigator.__proto__.webdriver;

        // 模拟真实浏览器的 plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [
            {
              0: {
                type: 'application/x-google-chrome-pdf',
                suffixes: 'pdf',
                description: 'Portable Document Format',
              },
              description: 'Portable Document Format',
              filename: 'internal-pdf-viewer',
              length: 1,
              name: 'Chrome PDF Plugin',
            },
            {
              0: {
                type: 'application/pdf',
                suffixes: 'pdf',
                description: 'Portable Document Format',
              },
              description: 'Portable Document Format',
              filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
              length: 1,
              name: 'Chrome PDF Viewer',
            },
          ],
        });

        // 设置更真实的语言列表
        Object.defineProperty(navigator, 'languages', {
          get: () => ['zh-CN', 'zh', 'en-US', 'en'],
        });

        // 覆盖 permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => {
          if (parameters.name === 'notifications') {
            const permission =
              typeof Notification !== 'undefined' ? Notification.permission : 'default';
            return Promise.resolve({ state: permission });
          }
          return originalQuery(parameters);
        };

        // Provide Notification API fallback so site scripts don't crash
        if (typeof window.Notification === 'undefined') {
          class FakeNotification {
            constructor(title, options) {
              this.title = title;
              this.options = options;
            }
            static async requestPermission() {
              return 'default';
            }
          }
          FakeNotification.permission = 'default';
          window.Notification = FakeNotification;
        }

        if (typeof window.Notification.requestPermission !== 'function') {
          window.Notification.requestPermission = async () => {
            return window.Notification.permission || 'default';
          };
        }

        // 伪装 Chrome 运行时
        window.chrome = {
          runtime: {},
        };

        // 覆盖 toString 以防止检测
        const originalToString = Function.prototype.toString;
        Function.prototype.toString = function () {
          if (this === window.navigator.permissions.query) {
            return 'function query() { [native code] }';
          }
          return originalToString.call(this);
        };

        // 模拟真实的 connection 属性
        Object.defineProperty(navigator, 'connection', {
          get: () => ({
            effectiveType: '4g',
            rtt: 50,
            downlink: 10,
            saveData: false,
          }),
        });

        // 伪装 hardwareConcurrency
        Object.defineProperty(navigator, 'hardwareConcurrency', {
          get: () => 8,
        });

        // 伪装 deviceMemory
        Object.defineProperty(navigator, 'deviceMemory', {
          get: () => 8,
        });
      });
    } catch (error) {
      throw new NetworkError(`页面配置失败: ${error.message}`, { cause: error });
    }
  }

  /**
   * 设置页面事件监听
   */
  setupPageEvents(page, id) {
    // 页面错误
    page.on('error', (error) => {
      this.stats.errors++;
      const pageInfo = this.pages.get(id);
      if (pageInfo) {
        pageInfo.errorCount++;
      }

      this.logger?.error(`页面错误 [${id}]`, { error: error.message });
      this.emit('page-error', { id, error });
    });

    // 页面JS错误
    page.on('pageerror', (error) => {
      const pageInfo = this.pages.get(id);
      if (pageInfo) {
        pageInfo.errorCount++;
      }

      // 过滤掉已知的Next.js路由错误
      if (this.isIgnorableJSError(error)) {
        this.logger?.debug(`忽略的JS错误 [${id}]`, { error: error.message });
        return;
      }

      this.logger?.warn(`页面JS错误 [${id}]`, { error: error.message });
      this.emit('page-js-error', { id, error });
    });

    // 页面崩溃
    page.on('crash', () => {
      this.logger?.error(`页面崩溃 [${id}]`);
      this.emit('page-crash', { id });
      // 自动清理崩溃的页面
      this.closePage(id).catch(() => {});
    });

    // 请求事件
    page.on('request', () => {
      const pageInfo = this.pages.get(id);
      if (pageInfo) {
        pageInfo.requestCount++;
        pageInfo.lastActivity = Date.now();
      }
    });

    // 响应事件
    page.on('response', (response) => {
      this.emit('page-response', {
        id,
        url: response.url(),
        status: response.status(),
      });
    });

    // 控制台消息
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        this.logger?.debug(`页面控制台错误 [${id}]`, { message: msg.text() });
      }
    });
  }

  /**
   * 判断是否为可忽略的JS错误
   */
  isIgnorableJSError(error) {
    const message = error.message || '';

    // Next.js路由相关错误
    const nextjsErrors = [
      'Invariant: attempted to hard navigate to the same URL',
      'Navigation cancelled by a newer navigation',
      'AbortError: The operation was aborted',
      'ResizeObserver loop limit exceeded',
    ];

    // 第三方脚本错误
    const thirdPartyErrors = [
      'Script error.',
      'Non-Error promise rejection captured',
      'TypeError: Cannot read properties of null',
      'TypeError: Cannot read properties of undefined',
      // 常见但无害的客户端环境差异
      'Notification is not defined',
      'ReferenceError: Notification is not defined',
      'require is not defined',
      'ReferenceError: require is not defined',
      'exports is not defined in ES module scope',
    ];

    // 检查是否为已知的可忽略错误
    return (
      nextjsErrors.some((pattern) => message.includes(pattern)) ||
      thirdPartyErrors.some((pattern) => message.includes(pattern))
    );
  }

  /**
   * 判断是否应该阻止请求
   */
  shouldBlockRequest(url, resourceType) {
    // 阻止常见的广告和分析域名
    const blockedDomains = [
      'googletagmanager.com',
      'google-analytics.com',
      'googlesyndication.com',
      'doubleclick.net',
      'facebook.com/tr',
      'connect.facebook.net',
    ];

    const shouldBlockByType = ['media'].includes(resourceType);
    const shouldBlockByDomain = blockedDomains.some((domain) => url.includes(domain));

    return shouldBlockByType || shouldBlockByDomain;
  }

  /**
   * 获取页面实例
   */
  getPage(id) {
    const pageInfo = this.pages.get(id);
    return pageInfo ? pageInfo.page : null;
  }

  /**
   * 获取页面信息
   */
  getPageInfo(id) {
    return this.pages.get(id);
  }

  /**
   * 关闭指定页面
   */
  async closePage(id) {
    const pageInfo = this.pages.get(id);
    if (!pageInfo) {
      this.logger?.warn(`页面 [${id}] 不存在，无法关闭`);
      return;
    }

    try {
      // 关闭页面
      if (pageInfo.page && !pageInfo.page.isClosed()) {
        await pageInfo.page.close();
      }

      this.stats.closed++;
      this.stats.active = Math.max(0, this.stats.active - 1);
    } catch (error) {
      this.logger?.warn(`关闭页面失败 [${id}]`, { error: error.message });
    } finally {
      // 释放浏览器回池中
      if (pageInfo.browser) {
        this.browserPool.releaseBrowser(pageInfo.browser);
      }

      // 从映射中移除
      this.pages.delete(id);

      this.logger?.debug(`页面已关闭 [${id}]`, {
        totalPages: this.pages.size,
        duration: Date.now() - pageInfo.createdAt,
      });

      this.emit('page-closed', { id, pageInfo });
    }
  }

  /**
   * 关闭所有页面
   */
  async closeAll() {
    const pageIds = Array.from(this.pages.keys());
    this.logger?.info(`开始关闭所有页面 (${pageIds.length} 个)`);

    const closePromises = pageIds.map((id) =>
      this.closePage(id).catch((error) =>
        this.logger?.error(`关闭页面 [${id}] 时出错`, { error: error.message })
      )
    );

    await Promise.all(closePromises);
    this.logger?.info('所有页面已关闭');
  }

  /**
   * 清理超时或无效的页面
   */
  async cleanup(maxIdleTime = 300000) {
    // 5分钟超时
    const now = Date.now();
    const toCleanup = [];

    for (const [id, pageInfo] of this.pages) {
      const idleTime = now - pageInfo.lastActivity;

      // 检查页面是否超时或已关闭
      if (idleTime > maxIdleTime || pageInfo.page.isClosed()) {
        toCleanup.push(id);
      }
    }

    if (toCleanup.length > 0) {
      this.logger?.info(`清理 ${toCleanup.length} 个超时页面`);

      const cleanupPromises = toCleanup.map((id) => this.closePage(id));
      await Promise.all(cleanupPromises);
    }

    return toCleanup.length;
  }

  /**
   * 获取页面管理器状态
   */
  getStatus() {
    const pages = Array.from(this.pages.values());

    return {
      isClosed: this.isClosed,
      totalPages: this.pages.size,
      activeBrowsers: this.browserPool.getStatus().busyBrowsers,
      stats: { ...this.stats },
      pages: pages.map((p) => ({
        id: p.id,
        createdAt: p.createdAt,
        lastActivity: p.lastActivity,
        requestCount: p.requestCount,
        errorCount: p.errorCount,
        idleTime: Date.now() - p.lastActivity,
      })),
    };
  }

  /**
   * 关闭页面管理器
   */
  async close() {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;
    this.logger?.info('开始关闭页面管理器');

    await this.closeAll();

    this.logger?.info('页面管理器已关闭', { stats: this.stats });
    this.emit('closed', { stats: this.stats });
  }

  /**
   * 批量创建页面
   */
  async createPages(pageConfigs) {
    const results = [];

    for (const config of pageConfigs) {
      try {
        const page = await this.createPage(config.id, config.options);
        results.push({ success: true, id: config.id, page });
      } catch (error) {
        results.push({ success: false, id: config.id, error });
      }
    }

    return results;
  }

  /**
   * 重启指定页面
   */
  async restartPage(id, options = {}) {
    const oldPageInfo = this.pages.get(id);
    if (!oldPageInfo) {
      throw new Error(`页面 ${id} 不存在`);
    }

    // 保存原有配置
    const pageOptions = { ...this.options, ...options };

    // 关闭旧页面
    await this.closePage(id);

    // 创建新页面
    return this.createPage(id, pageOptions);
  }
}
