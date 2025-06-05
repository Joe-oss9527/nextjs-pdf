// src/core/ServiceDefinitions.js
/**
 * 服务定义配置文件
 * 声明式定义所有应用服务及其依赖关系
 */

import { ServiceDefinition, ServiceType, ServicePriority } from './types/ServiceTypes.js';

// 导入服务实现
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
 * 应用服务定义列表
 * 按优先级和依赖关系组织
 */
export const serviceDefinitions = [
  // === 第1层：基础服务（优先级 CRITICAL） ===

  new ServiceDefinition({
    name: 'config',
    type: ServiceType.FACTORY,
    implementation: async () => {
      const configLoader = new ConfigLoader();
      const config = await configLoader.load();

      // 验证配置
      const validationResult = validateConfig(config);
      if (!validationResult.valid) {
        throw new Error(`配置验证失败: ${validationResult.errors?.join(', ') || '未知错误'}`);
      }

      return validationResult.config;
    },
    dependencies: [],
    priority: ServicePriority.CRITICAL,
    singleton: true,
    description: '应用程序配置服务 - 负责加载和验证所有配置',
    tags: {
      critical: true,
      layer: 'foundation',
      preload: true
    },
    timeout: 10000
  }),

  new ServiceDefinition({
    name: 'logger',
    type: ServiceType.FACTORY,
    implementation: () => createLogger('App'),
    dependencies: [],
    priority: ServicePriority.CRITICAL,
    singleton: true,
    description: '应用程序日志服务 - 提供结构化日志记录',
    tags: {
      critical: true,
      layer: 'foundation',
      preload: true
    }
  }),

  // === 第2层：核心业务服务（优先级 HIGH） ===

  new ServiceDefinition({
    name: 'fileService',
    type: ServiceType.CLASS,
    implementation: FileService,
    dependencies: ['logger'],
    priority: ServicePriority.HIGH,
    singleton: true,
    description: '文件系统操作服务 - 提供文件和目录的CRUD操作',
    tags: {
      critical: true,
      layer: 'filesystem',
      preload: true
    }
  }),

  new ServiceDefinition({
    name: 'pathService',
    type: ServiceType.CLASS,
    implementation: PathService,
    dependencies: ['config'],
    priority: ServicePriority.HIGH,
    singleton: true,
    description: '路径管理服务 - 生成和管理各种文件路径',
    tags: {
      critical: true,
      layer: 'filesystem',
      preload: true
    }
  }),

  // === 第3层：业务逻辑服务（优先级 NORMAL） ===

  new ServiceDefinition({
    name: 'metadataService',
    type: ServiceType.CLASS,
    implementation: MetadataService,
    dependencies: ['fileService', 'pathService', 'logger'],
    priority: ServicePriority.NORMAL,
    singleton: true,
    description: '元数据管理服务 - 管理爬虫相关的元数据信息',
    tags: {
      layer: 'business'
    }
  }),

  new ServiceDefinition({
    name: 'stateManager',
    type: ServiceType.CLASS,
    implementation: StateManager,
    dependencies: ['fileService', 'pathService', 'logger'],
    priority: ServicePriority.NORMAL,
    singleton: true,
    description: '状态管理服务 - 持久化和恢复爬虫运行状态',
    tags: {
      layer: 'business',
      hasInitializer: true
    }
  }),

  new ServiceDefinition({
    name: 'progressTracker',
    type: ServiceType.CLASS,
    implementation: ProgressTracker,
    dependencies: ['logger'],
    priority: ServicePriority.NORMAL,
    singleton: true,
    description: '进度追踪服务 - 跟踪和报告爬虫进度',
    tags: {
      layer: 'business'
    }
  }),

  new ServiceDefinition({
    name: 'queueManager',
    type: ServiceType.FACTORY,
    implementation: (config, logger) => {
      return new QueueManager({
        concurrency: config.concurrency || 5,
        interval: 1000,
        timeout: config.pageTimeout || 30000,
        logger
      });
    },
    dependencies: ['config', 'logger'],
    priority: ServicePriority.NORMAL,
    singleton: true,
    description: '队列管理服务 - 管理并发任务队列和调度',
    tags: {
      layer: 'business'
    }
  }),

  // === 第4层：浏览器管理服务（优先级 NORMAL） ===

  new ServiceDefinition({
    name: 'browserPool',
    type: ServiceType.FACTORY,
    implementation: async (config, logger) => {
      const browserPool = new BrowserPool({
        maxBrowsers: config.concurrency || 5,
        headless: config.browser?.headless !== false,
        launchOptions: {
          args: config.browser?.args || [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
          ],
          ...config.browser
        },
        logger
      });

      // 浏览器池需要异步初始化
      await browserPool.initialize();
      return browserPool;
    },
    dependencies: ['config', 'logger'],
    priority: ServicePriority.NORMAL,
    singleton: true,
    description: '浏览器池服务 - 管理和分配浏览器实例',
    tags: {
      layer: 'browser',
      resource: 'heavy',
      hasAsyncInit: true
    },
    timeout: 60000 // 浏览器初始化可能需要更长时间
  }),

  new ServiceDefinition({
    name: 'pageManager',
    type: ServiceType.FACTORY,
    implementation: (browserPool, logger) => {
      return new PageManager(browserPool, {
        logger,
        defaultTimeout: 30000,
        enableRequestInterception: true,
        blockedResourceTypes: ['font', 'stylesheet'],
        viewport: { width: 1920, height: 1080 }
      });
    },
    dependencies: ['browserPool', 'logger'],
    priority: ServicePriority.NORMAL,
    singleton: true,
    description: '页面管理服务 - 管理浏览器页面的生命周期',
    tags: {
      layer: 'browser'
    }
  }),

  // === 第5层：处理服务（优先级 NORMAL） ===

  new ServiceDefinition({
    name: 'imageService',
    type: ServiceType.FACTORY,
    implementation: (config, logger) => {
      return new ImageService({
        defaultTimeout: config.imageTimeout || 15000,
        scrollDelay: config.images?.scrollDelay || 500,
        maxScrollAttempts: config.images?.maxScrollAttempts || 10,
        enableIntersectionObserver: true,
        logger
      });
    },
    dependencies: ['config', 'logger'],
    priority: ServicePriority.NORMAL,
    singleton: true,
    description: '图片处理服务 - 处理页面图片加载和懒加载',
    tags: {
      layer: 'processing'
    }
  }),

  new ServiceDefinition({
    name: 'pythonMergeService',
    type: ServiceType.CLASS,
    implementation: PythonMergeService,
    dependencies: ['config', 'logger'],
    priority: ServicePriority.NORMAL,
    singleton: true,
    description: 'Python PDF合并服务 - 集成Python PDF处理功能',
    tags: {
      layer: 'processing',
      external: true
    }
  }),

  // === 第6层：核心应用服务（优先级 NORMAL） ===

  new ServiceDefinition({
    name: 'scraper',
    type: ServiceType.FACTORY,
    implementation: async (...dependencies) => {
      const [
        config, logger, browserPool, pageManager,
        fileService, pathService, metadataService,
        stateManager, progressTracker, queueManager, imageService
      ] = dependencies;

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

      // 爬虫服务可能需要异步初始化
      if (!scraper.isInitialized) {
        await scraper.initialize();
      }

      return scraper;
    },
    dependencies: [
      'config', 'logger', 'browserPool', 'pageManager',
      'fileService', 'pathService', 'metadataService',
      'stateManager', 'progressTracker', 'queueManager', 'imageService'
    ],
    priority: ServicePriority.NORMAL,
    singleton: true,
    description: '核心爬虫服务 - 统筹整个PDF爬取流程',
    tags: {
      layer: 'application',
      critical: true,
      hasAsyncInit: true
    },
    timeout: 45000 // 爬虫初始化可能需要较长时间
  })
];

/**
 * 服务分组定义
 * 按功能层级组织服务，便于理解和管理
 */
export const serviceGroups = {
  foundation: {
    description: '基础服务层 - 提供核心基础功能',
    services: ['config', 'logger'],
    priority: ServicePriority.CRITICAL
  },

  filesystem: {
    description: '文件系统层 - 处理文件和路径操作',
    services: ['fileService', 'pathService'],
    priority: ServicePriority.HIGH
  },

  business: {
    description: '业务逻辑层 - 核心业务服务',
    services: ['metadataService', 'stateManager', 'progressTracker', 'queueManager'],
    priority: ServicePriority.NORMAL
  },

  browser: {
    description: '浏览器管理层 - 管理浏览器资源',
    services: ['browserPool', 'pageManager'],
    priority: ServicePriority.NORMAL
  },

  processing: {
    description: '处理服务层 - 专门的数据处理',
    services: ['imageService', 'pythonMergeService'],
    priority: ServicePriority.NORMAL
  },

  application: {
    description: '应用服务层 - 核心应用逻辑',
    services: ['scraper'],
    priority: ServicePriority.NORMAL
  }
};

/**
 * 获取关键服务列表
 */
export function getCriticalServices() {
  return serviceDefinitions
    .filter(def => def.isCritical())
    .map(def => def.name);
}

/**
 * 按层级获取服务
 */
export function getServicesByLayer(layer) {
  return serviceDefinitions
    .filter(def => def.tags.layer === layer)
    .map(def => def.name);
}

/**
 * 按优先级获取服务
 */
export function getServicesByPriority(priority) {
  return serviceDefinitions
    .filter(def => def.priority === priority)
    .map(def => def.name);
}

/**
 * 获取服务分组
 */
export function getServicesByGroup(groupName) {
  const group = serviceGroups[groupName];
  return group ? group.services : [];
}

/**
 * 获取服务定义
 */
export function getServiceDefinition(serviceName) {
  return serviceDefinitions.find(def => def.name === serviceName);
}

/**
 * 验证所有服务定义
 */
export function validateServiceDefinitions() {
  const errors = [];
  const serviceNames = new Set();

  // 检查重复和基本验证
  for (const definition of serviceDefinitions) {
    if (serviceNames.has(definition.name)) {
      errors.push(`重复的服务名称: ${definition.name}`);
    }
    serviceNames.add(definition.name);
  }

  // 检查依赖完整性
  for (const definition of serviceDefinitions) {
    for (const dep of definition.dependencies) {
      if (!serviceNames.has(dep)) {
        errors.push(`服务 '${definition.name}' 依赖不存在的服务 '${dep}'`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`服务定义验证失败:\n${errors.join('\n')}`);
  }

  return true;
}

// 执行验证以确保配置正确
validateServiceDefinitions();
