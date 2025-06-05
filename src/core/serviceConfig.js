// src/core/serviceConfig.js
import { ConfigLoader } from '../config/configLoader.js';
import { FileService } from '../services/fileService.js';
import { PathService } from '../services/pathService.js';
import { MetadataService } from '../services/metadataService.js';
import { StateManager } from '../services/stateManager.js';
import { ProgressTracker } from '../services/progressTracker.js';
import { QueueManager } from '../services/queueManager.js';
import { BrowserPool } from '../services/browserPool.js';
import { PageManager } from '../services/pageManager.js';
import { ImageService } from '../services/imageService.js';
import { Scraper } from './scraper.js';
import { PythonMergeService } from '../services/PythonMergeService.js';
import { createLogger } from '../utils/logger.js';
import { validateConfig } from '../config/configValidator.js';

/**
 * 声明式服务配置
 *
 * 配置格式说明：
 * - factory: 工厂函数，用于创建服务实例
 * - class: 类构造函数，将使用 new 操作符创建实例
 * - deps: 依赖服务列表，按顺序注入到工厂函数或构造函数
 * - init: 创建实例后调用的初始化方法名
 * - priority: 注册优先级，数字越小优先级越高
 * - singleton: 是否为单例，默认为 true
 * - critical: 是否为关键服务，需要预加载
 */
export const services = {
  // === 基础服务层（优先级 1） ===

  config: {
    factory: async () => {
      const configLoader = new ConfigLoader();
      const config = await configLoader.load();

      // 验证配置
      const validationResult = validateConfig(config);
      if (!validationResult.valid) {
        throw new Error(`配置验证失败: ${validationResult.errors?.join(', ') || '未知错误'}`);
      }

      return validationResult.config || config;
    },
    deps: [],
    priority: 1,
    critical: true
  },

  logger: {
    factory: () => createLogger('App'),
    deps: [],
    priority: 1,
    critical: true
  },

  // === 文件系统层（优先级 2） ===

  fileService: {
    class: FileService,
    deps: ['logger'],
    priority: 2,
    critical: true
  },

  pathService: {
    class: PathService,
    deps: ['config'],
    priority: 2,
    critical: true
  },

  // === 元数据和状态管理层（优先级 3） ===

  metadataService: {
    class: MetadataService,
    deps: ['fileService', 'pathService', 'logger'],
    priority: 3
  },

  stateManager: {
    class: StateManager,
    deps: ['fileService', 'pathService', 'logger'],
    init: 'load', // 创建后调用 load() 方法
    priority: 3
  },

  progressTracker: {
    class: ProgressTracker,
    deps: ['logger'],
    priority: 3
  },

  queueManager: {
    factory: (config, logger) => {
      return new QueueManager({
        concurrency: config.concurrency || 5,
        interval: 1000,
        timeout: config.pageTimeout || 30000,
        logger
      });
    },
    deps: ['config', 'logger'],
    priority: 3
  },

  // === 浏览器管理层（优先级 4-5） ===

  browserPool: {
    factory: async (config, logger) => {
      const browserPool = new BrowserPool({
        maxBrowsers: config.concurrency || 5,
        headless: config.browser?.headless !== false,
        launchOptions: config.browser || {},
        logger
      });

      // 初始化浏览器池
      await browserPool.initialize();
      return browserPool;
    },
    deps: ['config', 'logger'],
    priority: 4
  },

  pageManager: {
    factory: (browserPool, logger) => {
      return new PageManager(browserPool, {
        logger,
        defaultTimeout: 30000,
        enableRequestInterception: true
      });
    },
    deps: ['browserPool', 'logger'],
    priority: 5
  },

  // === 处理服务层（优先级 5） ===

  imageService: {
    factory: (config, logger) => {
      return new ImageService({
        defaultTimeout: config.imageTimeout || 15000,
        scrollDelay: config.images?.scrollDelay || 500,
        maxScrollAttempts: config.images?.maxScrollAttempts || 10,
        logger
      });
    },
    deps: ['config', 'logger'],
    priority: 5
  },

  pythonMergeService: {
    class: PythonMergeService,
    deps: ['config', 'logger'],
    priority: 5
  },

  // === 核心应用服务层（优先级 6） ===

  scraper: {
    factory: async (config, logger, browserPool, pageManager, fileService,
                   pathService, metadataService, stateManager, progressTracker,
                   queueManager, imageService) => {

      // 创建 Scraper 实例
      const scraper = new Scraper({
        config,
        logger,
        browserPool,
        pageManager,
        fileService,
        pathService,
        metadataService,
        stateManager,
        progressTracker,
        queueManager,
        imageService
      });

      // 如果尚未初始化，则进行初始化
      if (!scraper.isInitialized) {
        await scraper.initialize();
      }

      return scraper;
    },
    deps: [
      'config', 'logger', 'browserPool', 'pageManager', 'fileService',
      'pathService', 'metadataService', 'stateManager', 'progressTracker',
      'queueManager', 'imageService'
    ],
    priority: 6,
    critical: true
  }
};

/**
 * 获取关键服务列表（需要预加载的服务）
 */
export function getCriticalServices() {
  return Object.entries(services)
    .filter(([, config]) => config.critical === true)
    .map(([name]) => name);
}

/**
 * 获取所有服务名称
 */
export function getAllServiceNames() {
  return Object.keys(services);
}

/**
 * 获取服务配置
 */
export function getServiceConfig(serviceName) {
  const config = services[serviceName];
  if (!config) {
    throw new Error(`服务配置不存在: ${serviceName}`);
  }
  return config;
}

/**
 * 服务分组信息（用于理解和文档）
 */
export const serviceGroups = {
  foundation: {
    description: '基础服务层 - 提供核心基础功能',
    services: ['config', 'logger']
  },

  filesystem: {
    description: '文件系统层 - 处理文件和路径操作',
    services: ['fileService', 'pathService']
  },

  metadata: {
    description: '元数据层 - 管理应用元数据',
    services: ['metadataService']
  },

  state: {
    description: '状态管理层 - 处理状态和进度',
    services: ['stateManager', 'progressTracker', 'queueManager']
  },

  browser: {
    description: '浏览器管理层 - 管理浏览器资源',
    services: ['browserPool', 'pageManager']
  },

  processing: {
    description: '处理服务层 - 专门的处理功能',
    services: ['imageService', 'pythonMergeService']
  },

  application: {
    description: '应用服务层 - 核心业务逻辑',
    services: ['scraper']
  }
};
