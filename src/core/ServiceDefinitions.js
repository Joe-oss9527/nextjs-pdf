// src/core/ServiceDefinitions.js
/**
 * 服务定义配置文件 - 修复版本
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
      preload: true,
      async: true // 🔧 明确标记为异步
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
    // 🔧 修复：返回Promise而不是在函数内部await
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

      // 🔧 修复：返回Promise，让ServiceFactory处理异步
      return browserPool.initialize().then(() => browserPool);
    },
    dependencies: ['config', 'logger'],
    priority: ServicePriority.NORMAL,
    singleton: true,
    description: '浏览器池服务 - 管理和分配浏览器实例',
    tags: {
      layer: 'browser',
      resource: 'heavy',
      hasAsyncInit: true, // 🔧 修复：正确标记异步初始化
      async: true // 🔧 添加：标记为异步服务
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
    // 🔧 修复：优化异步处理
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

      // 🔧 修复：确保异步初始化被正确处理
      if (scraper.initialize && typeof scraper.initialize === 'function') {
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
      hasAsyncInit: true, // 🔧 修复：正确标记异步初始化
      async: true, // 🔧 添加：标记为异步服务
      requiredMethods: ['run', 'getStatus', 'cleanup'] // 🆕 添加：期望的方法
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
 * 🆕 服务启动配置
 * 定义不同环境下的服务启动策略
 */
export const serviceStartupConfigs = {
  development: {
    enableParallelRegistration: false,
    continueOnError: true,
    enableRetry: true,
    maxRetries: 2,
    enableHealthCheck: true,
    preloadCritical: true
  },

  production: {
    enableParallelRegistration: true,
    continueOnError: false,
    enableRetry: true,
    maxRetries: 5,
    enableHealthCheck: true,
    preloadCritical: true
  },

  testing: {
    enableParallelRegistration: false,
    continueOnError: false,
    enableRetry: false,
    maxRetries: 1,
    enableHealthCheck: false,
    preloadCritical: false
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
 * 🆕 获取异步服务列表
 */
export function getAsyncServices() {
  return serviceDefinitions
    .filter(def => def.isAsync())
    .map(def => def.name);
}

/**
 * 🆕 获取需要初始化的服务列表
 */
export function getInitializationServices() {
  return serviceDefinitions
    .filter(def => def.requiresInitialization())
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
 * 🆕 获取启动配置
 */
export function getStartupConfig(environment = 'production') {
  return serviceStartupConfigs[environment] || serviceStartupConfigs.production;
}

/**
 * 🆕 分析服务依赖关系
 */
export function analyzeServiceDependencies() {
  const analysis = {
    totalServices: serviceDefinitions.length,
    dependencyGraph: new Map(),
    levels: new Map(),
    orphans: [],
    heavyDependents: [],
    circularRisks: []
  };

  // 构建依赖图
  serviceDefinitions.forEach(def => {
    analysis.dependencyGraph.set(def.name, {
      dependencies: def.dependencies,
      dependents: [],
      level: 0,
      async: def.isAsync(),
      critical: def.isCritical()
    });
  });

  // 计算依赖关系
  serviceDefinitions.forEach(def => {
    def.dependencies.forEach(depName => {
      const depNode = analysis.dependencyGraph.get(depName);
      if (depNode) {
        depNode.dependents.push(def.name);
      }
    });
  });

  // 分析孤立服务
  analysis.dependencyGraph.forEach((node, name) => {
    if (node.dependencies.length === 0 && node.dependents.length === 0) {
      analysis.orphans.push(name);
    }
  });

  // 分析重度依赖服务
  analysis.dependencyGraph.forEach((node, name) => {
    if (node.dependents.length > 3) {
      analysis.heavyDependents.push({
        name,
        dependentCount: node.dependents.length,
        dependents: node.dependents
      });
    }
  });

  return analysis;
}

/**
 * 验证所有服务定义
 */
export function validateServiceDefinitions() {
  const errors = [];
  const warnings = [];
  const serviceNames = new Set();

  // 检查重复和基本验证
  for (const definition of serviceDefinitions) {
    if (serviceNames.has(definition.name)) {
      errors.push(`重复的服务名称: ${definition.name}`);
    }
    serviceNames.add(definition.name);

    // 🆕 检查异步服务的标记一致性
    if (definition.isAsync() && definition.type === ServiceType.FACTORY) {
      if (!definition.tags.async) {
        warnings.push(`服务 '${definition.name}' 是异步工厂但没有 async 标记`);
      }
    }

    // 🆕 检查初始化配置一致性
    if (definition.requiresInitialization() && definition.type === ServiceType.VALUE) {
      warnings.push(`值类型服务 '${definition.name}' 不应该需要初始化`);
    }
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

  return { valid: true, warnings };
}

/**
 * 🆕 生成服务启动计划
 */
export function generateStartupPlan(environment = 'production') {
  const config = getStartupConfig(environment);
  const analysis = analyzeServiceDependencies();

  return {
    config,
    analysis,
    estimatedTime: serviceDefinitions.reduce((total, def) =>
      total + def.getEstimatedInitTime(), 0),
    criticalServices: getCriticalServices(),
    asyncServices: getAsyncServices(),
    initializationServices: getInitializationServices(),
    recommendations: generateStartupRecommendations(analysis)
  };
}

/**
 * 🆕 生成启动建议
 */
function generateStartupRecommendations(analysis) {
  const recommendations = [];

  if (analysis.orphans.length > 0) {
    recommendations.push({
      type: 'warning',
      message: `发现 ${analysis.orphans.length} 个孤立服务，考虑是否需要移除`,
      services: analysis.orphans
    });
  }

  if (analysis.heavyDependents.length > 0) {
    recommendations.push({
      type: 'info',
      message: '以下服务被多个其他服务依赖，确保它们稳定可靠',
      services: analysis.heavyDependents.map(h => h.name)
    });
  }

  const asyncServices = getAsyncServices();
  if (asyncServices.length > 0) {
    recommendations.push({
      type: 'info',
      message: '建议为异步服务增加超时和错误处理',
      services: asyncServices
    });
  }

  return recommendations;
}

// 执行验证以确保配置正确
const validation = validateServiceDefinitions();
if (validation.warnings.length > 0) {
  console.warn('服务定义验证警告:', validation.warnings);
}
