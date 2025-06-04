// src/services/browserPool.js
import puppeteer from 'puppeteer';
import { EventEmitter } from 'events';
import { NetworkError } from '../utils/errors.js';

/**
 * 浏览器池管理服务
 * 提供浏览器实例的创建、管理、分配和释放功能
 */
export class BrowserPool extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      maxBrowsers: options.maxBrowsers || 1,
      headless: options.headless !== false,
      launchOptions: options.launchOptions || {},
      retryLimit: options.retryLimit || 3,
      retryDelay: options.retryDelay || 5000,
      ...options
    };

    this.logger = options.logger;
    this.browsers = [];
    this.availableBrowsers = [];
    this.busyBrowsers = [];
    this.isInitialized = false;
    this.isClosed = false;
    
    // 统计信息
    this.stats = {
      created: 0,
      disconnected: 0,
      errors: 0,
      totalRequests: 0,
      activeRequests: 0
    };
  }

  /**
   * 初始化浏览器池
   */
  async initialize() {
    if (this.isInitialized) {
      this.logger?.warn('浏览器池已经初始化');
      return;
    }

    try {
      this.logger?.info('开始初始化浏览器池', {
        maxBrowsers: this.options.maxBrowsers,
        headless: this.options.headless
      });

      // 创建初始浏览器实例
      for (let i = 0; i < this.options.maxBrowsers; i++) {
        try {
          const browser = await this.createBrowser();
          this.browsers.push(browser);
          this.availableBrowsers.push(browser);
        } catch (error) {
          this.logger?.error(`创建第 ${i + 1} 个浏览器实例失败`, {
            error: error.message
          });
          // 如果连一个浏览器都创建不了，抛出错误
          if (this.browsers.length === 0) {
            throw error;
          }
        }
      }

      this.isInitialized = true;
      this.logger?.info('浏览器池初始化完成', {
        totalBrowsers: this.browsers.length,
        availableBrowsers: this.availableBrowsers.length
      });

      this.emit('initialized', {
        totalBrowsers: this.browsers.length
      });

    } catch (error) {
      this.logger?.error('浏览器池初始化失败', { error: error.message });
      throw new NetworkError('浏览器池初始化失败', { cause: error });
    }
  }

  /**
   * 创建新的浏览器实例
   */
  async createBrowser() {
    try {
      const launchOptions = {
        headless: this.options.headless,
        defaultViewport: { width: 1920, height: 1080 },
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ],
        ...this.options.launchOptions
      };

      const browser = await puppeteer.launch(launchOptions);
      this.stats.created++;

      // 监听浏览器断开连接事件
      browser.on('disconnected', () => {
        this.handleBrowserDisconnect(browser);
      });

      // 监听浏览器目标变化
      browser.on('targetcreated', () => {
        this.emit('target-created');
      });

      browser.on('targetdestroyed', () => {
        this.emit('target-destroyed');
      });

      this.logger?.debug('创建了新的浏览器实例', {
        browserId: browser.process()?.pid || 'unknown'
      });

      this.emit('browser-created', { browser });
      return browser;

    } catch (error) {
      this.stats.errors++;
      this.logger?.error('创建浏览器失败', { error: error.message });
      throw new NetworkError('浏览器创建失败', { cause: error });
    }
  }

  /**
   * 获取可用的浏览器实例
   */
  async getBrowser() {
    if (!this.isInitialized) {
      throw new Error('浏览器池未初始化');
    }

    if (this.isClosed) {
      throw new Error('浏览器池已关闭');
    }

    this.stats.totalRequests++;
    this.stats.activeRequests++;

    // 如果有可用的浏览器，直接返回
    if (this.availableBrowsers.length > 0) {
      const browser = this.availableBrowsers.shift();
      this.busyBrowsers.push(browser);
      
      this.emit('browser-acquired', {
        browserId: browser.process()?.pid || 'unknown',
        available: this.availableBrowsers.length,
        busy: this.busyBrowsers.length
      });

      return browser;
    }

    // 等待有可用的浏览器
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stats.activeRequests--;
        reject(new Error('获取浏览器超时'));
      }, 30000); // 30秒超时

      const checkAvailable = () => {
        if (this.isClosed) {
          clearTimeout(timeout);
          this.stats.activeRequests--;
          reject(new Error('浏览器池已关闭'));
          return;
        }

        if (this.availableBrowsers.length > 0) {
          clearTimeout(timeout);
          const browser = this.availableBrowsers.shift();
          this.busyBrowsers.push(browser);
          
          this.emit('browser-acquired', {
            browserId: browser.process()?.pid || 'unknown',
            available: this.availableBrowsers.length,
            busy: this.busyBrowsers.length
          });

          resolve(browser);
        } else {
          // 继续等待
          setTimeout(checkAvailable, 100);
        }
      };

      checkAvailable();
    });
  }

  /**
   * 释放浏览器实例
   */
  releaseBrowser(browser) {
    if (!browser) {
      this.logger?.warn('尝试释放空的浏览器实例');
      return;
    }

    this.stats.activeRequests = Math.max(0, this.stats.activeRequests - 1);

    const busyIndex = this.busyBrowsers.indexOf(browser);
    if (busyIndex > -1) {
      this.busyBrowsers.splice(busyIndex, 1);
    }

    // 检查浏览器是否还连接
    if (browser.isConnected()) {
      this.availableBrowsers.push(browser);
      
      this.emit('browser-released', {
        browserId: browser.process()?.pid || 'unknown',
        available: this.availableBrowsers.length,
        busy: this.busyBrowsers.length
      });
    } else {
      this.logger?.warn('释放的浏览器已断开连接');
    }
  }

  /**
   * 处理浏览器断开连接
   */
  async handleBrowserDisconnect(browser) {
    this.stats.disconnected++;
    
    this.logger?.warn('浏览器断开连接', {
      browserId: browser.process()?.pid || 'unknown'
    });

    // 从所有数组中移除断开的浏览器
    const allIndex = this.browsers.indexOf(browser);
    if (allIndex > -1) {
      this.browsers.splice(allIndex, 1);
    }

    const availableIndex = this.availableBrowsers.indexOf(browser);
    if (availableIndex > -1) {
      this.availableBrowsers.splice(availableIndex, 1);
    }

    const busyIndex = this.busyBrowsers.indexOf(browser);
    if (busyIndex > -1) {
      this.busyBrowsers.splice(busyIndex, 1);
    }

    this.emit('browser-disconnected', {
      browserId: browser.process()?.pid || 'unknown',
      totalBrowsers: this.browsers.length
    });

    // 如果浏览器池还在运行，尝试创建新的浏览器实例替代
    if (!this.isClosed && this.browsers.length < this.options.maxBrowsers) {
      try {
        const newBrowser = await this.createBrowser();
        this.browsers.push(newBrowser);
        this.availableBrowsers.push(newBrowser);
        
        this.logger?.info('创建了新的浏览器实例替代断开的实例');
        
        this.emit('browser-replaced', {
          newBrowserId: newBrowser.process()?.pid || 'unknown'
        });

      } catch (error) {
        this.logger?.error('创建替代浏览器失败', { error: error.message });
        this.emit('browser-replace-failed', { error: error.message });
      }
    }
  }

  /**
   * 获取浏览器池状态
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isClosed: this.isClosed,
      totalBrowsers: this.browsers.length,
      availableBrowsers: this.availableBrowsers.length,
      busyBrowsers: this.busyBrowsers.length,
      maxBrowsers: this.options.maxBrowsers,
      stats: { ...this.stats }
    };
  }

  /**
   * 关闭浏览器池
   */
  async close() {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;
    this.logger?.info('开始关闭浏览器池');

    // 关闭所有浏览器实例
    const closePromises = this.browsers.map(async (browser) => {
      try {
        await browser.close();
      } catch (error) {
        this.logger?.warn('关闭浏览器时出错', { error: error.message });
      }
    });

    await Promise.all(closePromises);

    this.browsers = [];
    this.availableBrowsers = [];
    this.busyBrowsers = [];

    this.logger?.info('浏览器池已关闭', { stats: this.stats });
    this.emit('closed', { stats: this.stats });
  }

  /**
   * 清理无效的浏览器实例
   */
  async cleanup() {
    const invalidBrowsers = this.browsers.filter(browser => !browser.isConnected());
    
    if (invalidBrowsers.length > 0) {
      this.logger?.info(`清理 ${invalidBrowsers.length} 个无效浏览器实例`);
      
      invalidBrowsers.forEach(browser => {
        this.handleBrowserDisconnect(browser);
      });
    }
  }

  /**
   * 重启浏览器池
   */
  async restart() {
    this.logger?.info('重启浏览器池');
    await this.close();
    this.isClosed = false;
    this.isInitialized = false;
    await this.initialize();
  }
}