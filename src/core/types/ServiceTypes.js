// src/core/types/ServiceTypes.js
/**
 * 企业级服务类型定义 - 修复版本
 * 提供类型安全和清晰的服务分类
 */

export const ServiceType = Object.freeze({
  FACTORY: 'factory',
  CLASS: 'class',
  VALUE: 'value'
});

export const ServicePriority = Object.freeze({
  CRITICAL: 1,    // 基础服务：config, logger
  HIGH: 2,        // 核心业务：fileService, pathService
  NORMAL: 3,      // 一般业务：metadataService, stateManager
  LOW: 4          // 辅助服务：监控、缓存等
});

/**
 * 🆕 深冻结工具函数
 * 递归冻结对象的所有嵌套属性
 */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // 获取所有属性名（包括不可枚举的）
  Object.getOwnPropertyNames(obj).forEach(prop => {
    const value = obj[prop];
    if (value !== null && typeof value === 'object') {
      deepFreeze(value);
    }
  });

  return Object.freeze(obj);
}

/**
 * 🆕 增强的输入验证
 */
function validateServiceName(name) {
  if (!name || typeof name !== 'string') {
    return false;
  }

  // 更严格的服务名验证：字母开头，只允许字母、数字、下划线
  return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name);
}

function validateDependencies(dependencies) {
  if (!Array.isArray(dependencies)) {
    return false;
  }

  // 检查重复依赖
  const uniqueDeps = new Set(dependencies);
  if (uniqueDeps.size !== dependencies.length) {
    return false;
  }

  return dependencies.every(dep =>
    typeof dep === 'string' &&
    dep.trim() &&
    validateServiceName(dep)
  );
}

/**
 * 服务定义类
 * 不可变的服务描述符，包含所有服务元信息
 */
export class ServiceDefinition {
  constructor({
    name,
    type,
    implementation,
    dependencies = [],
    priority = ServicePriority.NORMAL,
    singleton = true,
    description = '',
    tags = {},
    timeout = 30000
  }) {
    // 🔧 增强的输入验证
    this._validateInputs(name, type, implementation, dependencies, priority, timeout);

    // 定义不可变属性 - 🔧 使用深冻结
    Object.defineProperties(this, {
      name: {
        value: name,
        writable: false,
        enumerable: true,
        configurable: false
      },
      type: {
        value: type,
        writable: false,
        enumerable: true,
        configurable: false
      },
      implementation: {
        value: implementation,
        writable: false,
        enumerable: true,
        configurable: false
      },
      dependencies: {
        value: deepFreeze([...dependencies]),
        writable: false,
        enumerable: true,
        configurable: false
      },
      priority: {
        value: priority,
        writable: false,
        enumerable: true,
        configurable: false
      },
      singleton: {
        value: Boolean(singleton),
        writable: false,
        enumerable: true,
        configurable: false
      },
      description: {
        value: description,
        writable: false,
        enumerable: true,
        configurable: false
      },
      tags: {
        value: deepFreeze({ ...tags }), // 🔧 修复：使用深冻结
        writable: false,
        enumerable: true,
        configurable: false
      },
      timeout: {
        value: timeout,
        writable: false,
        enumerable: true,
        configurable: false
      }
    });

    // 冻结对象防止修改
    Object.freeze(this);
  }

  /**
   * 🔧 增强的验证输入参数
   * @private
   */
  _validateInputs(name, type, implementation, dependencies, priority, timeout) {
    // 服务名称验证
    if (!validateServiceName(name)) {
      throw new ServiceDefinitionError(`无效的服务名称: ${name}. 必须以字母开头，只能包含字母、数字和下划线`);
    }

    // 服务类型验证
    if (!Object.values(ServiceType).includes(type)) {
      throw new ServiceDefinitionError(`无效的服务类型: ${type}. 支持的类型: ${Object.values(ServiceType).join(', ')}`);
    }

    // 实现验证
    if (implementation === null || implementation === undefined) {
      throw new ServiceDefinitionError('服务实现不能为空');
    }

    // 类型特定验证
    if ((type === ServiceType.FACTORY || type === ServiceType.CLASS) &&
        typeof implementation !== 'function') {
      throw new ServiceDefinitionError(`${type} 类型必须提供函数实现`);
    }

    // 🔧 增强的依赖验证
    if (!validateDependencies(dependencies)) {
      throw new ServiceDefinitionError(`依赖列表验证失败: ${JSON.stringify(dependencies)}. 必须是唯一的有效服务名称数组`);
    }

    // 优先级验证
    if (!Object.values(ServicePriority).includes(priority)) {
      throw new ServiceDefinitionError(`无效的优先级: ${priority}. 支持的优先级: ${Object.values(ServicePriority).join(', ')}`);
    }

    // 超时验证
    if (typeof timeout !== 'number' || timeout < 0) {
      throw new ServiceDefinitionError(`无效的超时设置: ${timeout}. 必须是非负数`);
    }

    // 🆕 循环依赖检查（单个服务不能依赖自己）
    if (dependencies.includes(name)) {
      throw new ServiceDefinitionError(`服务 '${name}' 不能依赖自己`);
    }
  }

  /**
   * 检查是否为关键服务
   */
  isCritical() {
    return this.priority === ServicePriority.CRITICAL || this.tags.critical === true;
  }

  /**
   * 🆕 检查是否为异步服务
   */
  isAsync() {
    if (this.type === ServiceType.VALUE) {
      return false;
    }

    if (this.type === ServiceType.FACTORY) {
      return this.implementation.constructor.name === 'AsyncFunction' ||
             this.implementation.toString().includes('async') ||
             this.tags.async === true;
    }

    return this.tags.async === true;
  }

  /**
   * 🆕 检查是否需要初始化
   */
  requiresInitialization() {
    return this.tags.hasInitializer === true ||
           this.tags.hasAsyncInit === true;
  }

  /**
   * 🆕 获取估计的初始化时间
   */
  getEstimatedInitTime() {
    if (this.tags.estimatedInitTime) {
      return this.tags.estimatedInitTime;
    }

    // 基于服务类型的默认估计
    const defaults = {
      [ServiceType.VALUE]: 0,
      [ServiceType.CLASS]: 100,
      [ServiceType.FACTORY]: 200
    };

    let baseTime = defaults[this.type] || 100;

    // 如果是异步服务，增加时间
    if (this.isAsync()) {
      baseTime *= 2;
    }

    // 如果需要初始化，增加时间
    if (this.requiresInitialization()) {
      baseTime += 1000;
    }

    return baseTime;
  }

  /**
   * 获取安全的元数据（用于日志）
   */
  getMetadata() {
    return {
      name: this.name,
      type: this.type,
      dependencies: this.dependencies,
      priority: this.priority,
      singleton: this.singleton,
      critical: this.isCritical(),
      async: this.isAsync(),
      requiresInit: this.requiresInitialization(),
      estimatedInitTime: this.getEstimatedInitTime(),
      description: this.description,
      tags: this.tags,
      timeout: this.timeout
    };
  }

  /**
   * 🆕 比较两个服务定义是否相等
   */
  equals(other) {
    if (!(other instanceof ServiceDefinition)) {
      return false;
    }

    return this.name === other.name &&
           this.type === other.type &&
           this.priority === other.priority &&
           this.singleton === other.singleton &&
           JSON.stringify(this.dependencies) === JSON.stringify(other.dependencies) &&
           JSON.stringify(this.tags) === JSON.stringify(other.tags);
  }

  /**
   * 🆕 创建服务定义的副本（用于测试）
   */
  clone(overrides = {}) {
    return new ServiceDefinition({
      name: this.name,
      type: this.type,
      implementation: this.implementation,
      dependencies: [...this.dependencies],
      priority: this.priority,
      singleton: this.singleton,
      description: this.description,
      tags: { ...this.tags },
      timeout: this.timeout,
      ...overrides
    });
  }

  /**
   * 转换为JSON
   */
  toJSON() {
    return this.getMetadata();
  }

  /**
   * 🆕 转换为字符串表示
   */
  toString() {
    return `ServiceDefinition(${this.name}:${this.type}:P${this.priority})`;
  }
}

/**
 * 服务定义错误类
 */
export class ServiceDefinitionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ServiceDefinitionError';
    this.details = details;
    this.timestamp = new Date().toISOString();

    // 保持原型链
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ServiceDefinitionError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}

/**
 * 服务注册统计类
 */
export class RegistrationStats {
  constructor() {
    this.reset();
  }

  reset() {
    this.total = 0;
    this.registered = 0;
    this.failed = 0;
    this.startTime = null;
    this.endTime = null;
    this.errors = [];
  }

  start(total) {
    this.total = total;
    this.startTime = Date.now();
  }

  recordSuccess() {
    this.registered++;
  }

  recordFailure(serviceName, error) {
    this.failed++;
    this.errors.push({
      service: serviceName,
      error: error.message,
      timestamp: Date.now()
    });
  }

  finish() {
    this.endTime = Date.now();
  }

  get duration() {
    return this.endTime && this.startTime ? this.endTime - this.startTime : null;
  }

  get successRate() {
    return this.total > 0 ? ((this.registered / this.total) * 100).toFixed(1) : 0;
  }

  getSummary() {
    return {
      total: this.total,
      registered: this.registered,
      failed: this.failed,
      successRate: this.successRate + '%',
      duration: this.duration ? `${this.duration}ms` : null,
      errorCount: this.errors.length
    };
  }

  getDetailedReport() {
    return {
      summary: this.getSummary(),
      errors: this.errors,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 🆕 服务定义构建器（Builder模式）
 * 提供更流畅的API来构建服务定义
 */
export class ServiceDefinitionBuilder {
  constructor(name) {
    this.config = {
      name,
      type: ServiceType.FACTORY,
      implementation: null,
      dependencies: [],
      priority: ServicePriority.NORMAL,
      singleton: true,
      description: '',
      tags: {},
      timeout: 30000
    };
  }

  factory(implementation) {
    this.config.type = ServiceType.FACTORY;
    this.config.implementation = implementation;
    return this;
  }

  class(implementation) {
    this.config.type = ServiceType.CLASS;
    this.config.implementation = implementation;
    return this;
  }

  value(implementation) {
    this.config.type = ServiceType.VALUE;
    this.config.implementation = implementation;
    return this;
  }

  dependsOn(...dependencies) {
    this.config.dependencies = [...dependencies];
    return this;
  }

  priority(priority) {
    this.config.priority = priority;
    return this;
  }

  critical() {
    this.config.priority = ServicePriority.CRITICAL;
    this.config.tags.critical = true;
    return this;
  }

  singleton(isSingleton = true) {
    this.config.singleton = isSingleton;
    return this;
  }

  transient() {
    this.config.singleton = false;
    return this;
  }

  description(description) {
    this.config.description = description;
    return this;
  }

  tag(key, value) {
    this.config.tags[key] = value;
    return this;
  }

  timeout(timeout) {
    this.config.timeout = timeout;
    return this;
  }

  async() {
    this.config.tags.async = true;
    return this;
  }

  requiresInit() {
    this.config.tags.hasInitializer = true;
    return this;
  }

  build() {
    return new ServiceDefinition(this.config);
  }
}

/**
 * 🆕 便捷函数：创建服务定义构建器
 */
export function defineService(name) {
  return new ServiceDefinitionBuilder(name);
}

/**
 * 🆕 便捷函数：快速创建值服务
 */
export function valueService(name, value, options = {}) {
  return new ServiceDefinition({
    name,
    type: ServiceType.VALUE,
    implementation: value,
    ...options
  });
}

/**
 * 🆕 便捷函数：快速创建工厂服务
 */
export function factoryService(name, factory, dependencies = [], options = {}) {
  return new ServiceDefinition({
    name,
    type: ServiceType.FACTORY,
    implementation: factory,
    dependencies,
    ...options
  });
}

/**
 * 🆕 便捷函数：快速创建类服务
 */
export function classService(name, constructor, dependencies = [], options = {}) {
  return new ServiceDefinition({
    name,
    type: ServiceType.CLASS,
    implementation: constructor,
    dependencies,
    ...options
  });
}
