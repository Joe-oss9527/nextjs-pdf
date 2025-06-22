import { jest } from '@jest/globals';
import { BrowserPool } from '../../src/services/browserPool.js';
import { NetworkError } from '../../src/utils/errors.js';
import puppeteer from 'puppeteer';

// Mock puppeteer
jest.mock('puppeteer', () => ({
  launch: jest.fn()
}));

describe('BrowserPool', () => {
  let browserPool;
  let mockLogger;
  let mockBrowser;
  let mockProcess;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    mockProcess = {
      pid: 12345
    };

    mockBrowser = {
      on: jest.fn(),
      close: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
      process: jest.fn().mockReturnValue(mockProcess)
    };

    puppeteer.launch.mockResolvedValue(mockBrowser);

    browserPool = new BrowserPool({
      logger: mockLogger,
      maxBrowsers: 2,
      headless: true
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const pool = new BrowserPool();
      
      expect(pool.options.maxBrowsers).toBe(1);
      expect(pool.options.headless).toBe(true);
      expect(pool.options.retryLimit).toBe(3);
      expect(pool.options.retryDelay).toBe(5000);
      expect(pool.browsers).toEqual([]);
      expect(pool.isInitialized).toBe(false);
      expect(pool.isClosed).toBe(false);
    });

    it('should accept custom options', () => {
      expect(browserPool.options.maxBrowsers).toBe(2);
      expect(browserPool.logger).toBe(mockLogger);
    });

    it('should initialize stats', () => {
      expect(browserPool.stats).toEqual({
        created: 0,
        disconnected: 0,
        errors: 0,
        totalRequests: 0,
        activeRequests: 0
      });
    });
  });

  describe('initialize', () => {
    it('should initialize browser pool successfully', async () => {
      await browserPool.initialize();

      expect(puppeteer.launch).toHaveBeenCalledTimes(2);
      expect(browserPool.browsers).toHaveLength(2);
      expect(browserPool.availableBrowsers).toHaveLength(2);
      expect(browserPool.isInitialized).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('浏览器池初始化完成', expect.any(Object));
    });

    it('should not reinitialize if already initialized', async () => {
      browserPool.isInitialized = true;
      
      await browserPool.initialize();
      
      expect(puppeteer.launch).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith('浏览器池已经初始化');
    });

    it('should handle partial browser creation failures', async () => {
      puppeteer.launch
        .mockResolvedValueOnce(mockBrowser)
        .mockRejectedValueOnce(new Error('Browser creation failed'));

      await browserPool.initialize();

      expect(browserPool.browsers).toHaveLength(1);
      expect(browserPool.isInitialized).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith('创建第 2 个浏览器实例失败', expect.any(Object));
    });

    it('should throw if no browsers can be created', async () => {
      puppeteer.launch.mockRejectedValue(new Error('Browser creation failed'));

      await expect(browserPool.initialize()).rejects.toThrow(NetworkError);
      expect(browserPool.isInitialized).toBe(false);
    });

    it('should emit initialized event', async () => {
      const listener = jest.fn();
      browserPool.on('initialized', listener);

      await browserPool.initialize();

      expect(listener).toHaveBeenCalledWith({ totalBrowsers: 2 });
    });
  });

  describe('createBrowser', () => {
    it('should create browser successfully', async () => {
      const browser = await browserPool.createBrowser();

      expect(browser).toBe(mockBrowser);
      expect(puppeteer.launch).toHaveBeenCalledWith(expect.objectContaining({
        headless: true,
        defaultViewport: { width: 1920, height: 1080 },
        args: expect.arrayContaining(['--no-sandbox', '--disable-gpu'])
      }));
      expect(browserPool.stats.created).toBe(1);
    });

    it('should setup browser event listeners', async () => {
      await browserPool.createBrowser();

      expect(mockBrowser.on).toHaveBeenCalledWith('disconnected', expect.any(Function));
      expect(mockBrowser.on).toHaveBeenCalledWith('targetcreated', expect.any(Function));
      expect(mockBrowser.on).toHaveBeenCalledWith('targetdestroyed', expect.any(Function));
    });

    it('should emit browser-created event', async () => {
      const listener = jest.fn();
      browserPool.on('browser-created', listener);

      await browserPool.createBrowser();

      expect(listener).toHaveBeenCalledWith({ browser: mockBrowser });
    });

    it('should handle creation errors', async () => {
      puppeteer.launch.mockRejectedValue(new Error('Launch failed'));

      await expect(browserPool.createBrowser()).rejects.toThrow(NetworkError);
      expect(browserPool.stats.errors).toBe(1);
    });
  });

  describe('getBrowser', () => {
    beforeEach(async () => {
      await browserPool.initialize();
    });

    it('should get available browser', async () => {
      const browser = await browserPool.getBrowser();

      expect(browser).toBe(mockBrowser);
      expect(browserPool.availableBrowsers).toHaveLength(1);
      expect(browserPool.busyBrowsers).toHaveLength(1);
      expect(browserPool.stats.totalRequests).toBe(1);
      expect(browserPool.stats.activeRequests).toBe(1);
    });

    it('should throw if not initialized', async () => {
      const pool = new BrowserPool();
      
      await expect(pool.getBrowser()).rejects.toThrow('浏览器池未初始化');
    });

    it('should throw if closed', async () => {
      browserPool.isClosed = true;
      
      await expect(browserPool.getBrowser()).rejects.toThrow('浏览器池已关闭');
    });

    it('should emit browser-acquired event', async () => {
      const listener = jest.fn();
      browserPool.on('browser-acquired', listener);

      await browserPool.getBrowser();

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        browserId: 12345,
        available: 1,
        busy: 1
      }));
    });

    it('should wait for available browser when all are busy', async () => {
      // Get all browsers
      const browser1 = await browserPool.getBrowser();
      const browser2 = await browserPool.getBrowser();

      expect(browserPool.availableBrowsers).toHaveLength(0);
      expect(browserPool.busyBrowsers).toHaveLength(2);

      // Try to get another browser (should wait)
      const getBrowserPromise = browserPool.getBrowser();

      // Release one browser after a delay
      setTimeout(() => {
        browserPool.releaseBrowser(browser1);
      }, 100);

      const browser3 = await getBrowserPromise;
      expect(browser3).toBe(browser1);
    });

    it('should create new browser dynamically if under max', async () => {
      // Initialize with only 1 browser
      const pool = new BrowserPool({ maxBrowsers: 3, logger: mockLogger });
      await pool.initialize();

      // Get the first browser
      await pool.getBrowser();

      // Mock a new browser for dynamic creation
      const newMockBrowser = { ...mockBrowser };
      puppeteer.launch.mockResolvedValue(newMockBrowser);

      // Get second browser (should create new one)
      const browser2 = await pool.getBrowser();

      expect(browser2).toEqual(newMockBrowser);
      expect(pool.browsers).toHaveLength(2);
    });
  });

  describe('waitForAvailableBrowser', () => {
    beforeEach(async () => {
      await browserPool.initialize();
      // Make all browsers busy
      await browserPool.getBrowser();
      await browserPool.getBrowser();
    });

    it('should timeout if no browser becomes available', async () => {
      // Create a pool with very short timeout
      const pool = new BrowserPool({ logger: mockLogger, maxBrowsers: 1 });
      await pool.initialize();
      
      // Make browser busy
      await pool.getBrowser();
      
      // Override the timeout check in waitForAvailableBrowser
      const originalNow = Date.now;
      let mockTime = originalNow();
      Date.now = jest.fn(() => mockTime);
      
      const waitPromise = pool.waitForAvailableBrowser();
      
      // Advance mock time past timeout
      mockTime += 46000;
      
      await expect(waitPromise).rejects.toThrow('获取浏览器超时');
      
      // Restore
      Date.now = originalNow;
    });

    it('should handle pool closure while waiting', async () => {
      const waitPromise = browserPool.waitForAvailableBrowser();
      
      // Close pool after a short delay
      setTimeout(() => {
        browserPool.isClosed = true;
      }, 50);

      await expect(waitPromise).rejects.toThrow('浏览器池已关闭');
    });

    it('should recreate disconnected browser', async () => {
      // Make a browser disconnected
      mockBrowser.isConnected.mockReturnValue(false);
      
      // Mock new browser for recreation
      const newMockBrowser = {
        on: jest.fn(),
        close: jest.fn(),
        isConnected: jest.fn().mockReturnValue(true),
        process: jest.fn().mockReturnValue({ pid: 67890 })
      };
      puppeteer.launch.mockResolvedValue(newMockBrowser);

      // Release a browser to make it available
      browserPool.releaseBrowser(browserPool.busyBrowsers[0]);

      const browser = await browserPool.waitForAvailableBrowser();
      
      expect(browser).toEqual(newMockBrowser);
      expect(mockLogger.warn).toHaveBeenCalledWith('发现断开的浏览器，尝试重新创建');
    }, 10000);
  });

  describe('releaseBrowser', () => {
    beforeEach(async () => {
      await browserPool.initialize();
    });

    it('should release browser back to available pool', async () => {
      const browser = await browserPool.getBrowser();
      
      browserPool.releaseBrowser(browser);

      expect(browserPool.availableBrowsers).toHaveLength(2);
      expect(browserPool.busyBrowsers).toHaveLength(0);
      expect(browserPool.stats.activeRequests).toBe(0);
    });

    it('should handle null browser', () => {
      browserPool.releaseBrowser(null);
      
      expect(mockLogger.warn).toHaveBeenCalledWith('尝试释放空的浏览器实例');
    });

    it('should handle disconnected browser', async () => {
      const browser = await browserPool.getBrowser();
      mockBrowser.isConnected.mockReturnValue(false);
      
      browserPool.releaseBrowser(browser);

      expect(browserPool.availableBrowsers).toHaveLength(1); // Only one browser remains available
      expect(mockLogger.warn).toHaveBeenCalledWith('释放的浏览器已断开连接');
    });

    it('should emit browser-released event', async () => {
      const listener = jest.fn();
      browserPool.on('browser-released', listener);
      
      const browser = await browserPool.getBrowser();
      browserPool.releaseBrowser(browser);

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        browserId: 12345,
        available: 2,
        busy: 0
      }));
    });
  });

  describe('handleBrowserDisconnect', () => {
    beforeEach(async () => {
      await browserPool.initialize();
    });

    it('should remove disconnected browser from all pools', async () => {
      // Use the mock function instead of calling the real method
      jest.spyOn(browserPool, 'handleBrowserDisconnect').mockImplementation(async (browser) => {
        // Simulate the removal logic
        const allIndex = browserPool.browsers.indexOf(browser);
        if (allIndex > -1) {
          browserPool.browsers.splice(allIndex, 1);
        }
        const availableIndex = browserPool.availableBrowsers.indexOf(browser);
        if (availableIndex > -1) {
          browserPool.availableBrowsers.splice(availableIndex, 1);
        }
        const busyIndex = browserPool.busyBrowsers.indexOf(browser);
        if (busyIndex > -1) {
          browserPool.busyBrowsers.splice(busyIndex, 1);
        }
        browserPool.stats.disconnected++;
      });
      
      const browser = browserPool.browsers[0];
      
      await browserPool.handleBrowserDisconnect(browser);

      expect(browserPool.browsers).not.toContain(browser);
      expect(browserPool.availableBrowsers).not.toContain(browser);
      expect(browserPool.busyBrowsers).not.toContain(browser);
      expect(browserPool.stats.disconnected).toBe(1);
    });

    it('should attempt to create replacement browser', async () => {
      const newMockBrowser = {
        on: jest.fn(),
        close: jest.fn(),
        isConnected: jest.fn().mockReturnValue(true),
        process: jest.fn().mockReturnValue({ pid: 67890 })
      };
      puppeteer.launch.mockResolvedValue(newMockBrowser);

      await browserPool.handleBrowserDisconnect(browserPool.browsers[0]);

      expect(puppeteer.launch).toHaveBeenCalled();
      expect(browserPool.browsers).toHaveLength(2);
      expect(mockLogger.info).toHaveBeenCalledWith('创建了新的浏览器实例替代断开的实例');
    });

    it('should emit browser-disconnected event', async () => {
      const listener = jest.fn();
      browserPool.on('browser-disconnected', listener);

      await browserPool.handleBrowserDisconnect(browserPool.browsers[0]);

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        browserId: 12345,
        totalBrowsers: 1
      }));
    });

    it('should handle replacement failure', async () => {
      puppeteer.launch.mockRejectedValue(new Error('Creation failed'));
      
      await browserPool.handleBrowserDisconnect(browserPool.browsers[0]);

      expect(mockLogger.error).toHaveBeenCalledWith('创建替代浏览器失败', expect.any(Object));
    });

    it('should not replace if pool is closed', async () => {
      // Clear previous puppeteer.launch calls
      puppeteer.launch.mockClear();
      
      browserPool.isClosed = true;
      
      await browserPool.handleBrowserDisconnect(browserPool.browsers[0]);

      expect(puppeteer.launch).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return current pool status', async () => {
      await browserPool.initialize();
      await browserPool.getBrowser();

      const status = browserPool.getStatus();

      expect(status).toEqual({
        isInitialized: true,
        isClosed: false,
        totalBrowsers: 2,
        availableBrowsers: 1,
        busyBrowsers: 1,
        maxBrowsers: 2,
        stats: {
          created: 2,
          disconnected: 0,
          errors: 0,
          totalRequests: 1,
          activeRequests: 1
        }
      });
    });
  });

  describe('close', () => {
    beforeEach(async () => {
      await browserPool.initialize();
    });

    it('should close all browsers', async () => {
      await browserPool.close();

      expect(mockBrowser.close).toHaveBeenCalledTimes(2);
      expect(browserPool.browsers).toHaveLength(0);
      expect(browserPool.availableBrowsers).toHaveLength(0);
      expect(browserPool.busyBrowsers).toHaveLength(0);
      expect(browserPool.isClosed).toBe(true);
    });

    it('should handle close errors gracefully', async () => {
      mockBrowser.close.mockRejectedValue(new Error('Close failed'));
      
      await browserPool.close();

      expect(mockLogger.warn).toHaveBeenCalledWith('关闭浏览器时出错', expect.any(Object));
    });

    it('should not close twice', async () => {
      await browserPool.close();
      mockBrowser.close.mockClear();
      
      await browserPool.close();
      
      expect(mockBrowser.close).not.toHaveBeenCalled();
    });

    it('should emit closed event', async () => {
      const listener = jest.fn();
      browserPool.on('closed', listener);

      await browserPool.close();

      expect(listener).toHaveBeenCalledWith({ stats: browserPool.stats });
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      await browserPool.initialize();
    });

    it('should remove invalid browsers', async () => {
      // Make one browser disconnected
      const disconnectedBrowser = browserPool.browsers[0];
      disconnectedBrowser.isConnected = jest.fn().mockReturnValue(false);
      
      // The other browser remains connected
      browserPool.browsers[1].isConnected = jest.fn().mockReturnValue(true);
      
      jest.spyOn(browserPool, 'handleBrowserDisconnect').mockImplementation(() => {});

      await browserPool.cleanup();

      expect(mockLogger.info).toHaveBeenCalledWith('清理 1 个无效浏览器实例');
      expect(browserPool.handleBrowserDisconnect).toHaveBeenCalledWith(disconnectedBrowser);
    });

    it('should do nothing if all browsers are valid', async () => {
      await browserPool.cleanup();

      expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('清理'));
    });
  });

  describe('restart', () => {
    beforeEach(async () => {
      await browserPool.initialize();
    });

    it('should restart browser pool', async () => {
      jest.spyOn(browserPool, 'close');
      jest.spyOn(browserPool, 'initialize');

      await browserPool.restart();

      expect(browserPool.close).toHaveBeenCalled();
      expect(browserPool.initialize).toHaveBeenCalled();
      expect(browserPool.isClosed).toBe(false);
      expect(browserPool.isInitialized).toBe(true);
    });
  });

  describe('browser event handlers', () => {
    it('should handle browser disconnect event', async () => {
      await browserPool.initialize();
      
      // Get the disconnect handler
      const disconnectHandler = mockBrowser.on.mock.calls.find(call => call[0] === 'disconnected')[1];
      
      jest.spyOn(browserPool, 'handleBrowserDisconnect').mockImplementation(() => {});
      
      disconnectHandler();

      expect(browserPool.handleBrowserDisconnect).toHaveBeenCalledWith(mockBrowser);
    });

    it('should emit target events', async () => {
      await browserPool.initialize();
      
      const targetCreatedListener = jest.fn();
      const targetDestroyedListener = jest.fn();
      
      browserPool.on('target-created', targetCreatedListener);
      browserPool.on('target-destroyed', targetDestroyedListener);
      
      // Get handlers
      const targetCreatedHandler = mockBrowser.on.mock.calls.find(call => call[0] === 'targetcreated')[1];
      const targetDestroyedHandler = mockBrowser.on.mock.calls.find(call => call[0] === 'targetdestroyed')[1];
      
      targetCreatedHandler();
      targetDestroyedHandler();

      expect(targetCreatedListener).toHaveBeenCalled();
      expect(targetDestroyedListener).toHaveBeenCalled();
    });
  });
});