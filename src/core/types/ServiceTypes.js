// src/core/types/ServiceTypes.js
/**
 * 企业级服务类型定义
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
    // 输入验证
    this._validateInputs(name, type, implementation, dependencies);

    // 定义不可变属性
    Object.defineProperties(this, {
      name: { value: name, writable: false, enumerable: true },
      type: { value: type, writable: false, enumerable: true },
      implementation: { value: implementation, writable: false, enumerable: true },
      dependencies: { value: Object.freeze([...dependencies]), writable: false, enumerable: true },
      priority: { value: priority, writable: false, enumerable: true },
      singleton: { value: Boolean(singleton), writable: false, enumerable: true },
      description: { value: description, writable: false, enumerable: true },
      tags: { value: Object.freeze({ ...tags }), writable: false, enumerable: true },
      timeout: { value: timeout, writable: false, enumerable: true }
    });

    // 冻结对象防止修改
    Object.freeze(this);
  }

  /**
   * 验证输入参数
   * @private
   */
  _validateInputs(name, type, implementation, dependencies) {
    // 服务名称验证
    if (!name || typeof name !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
      throw new ServiceDefinitionError(`无效的服务名称: ${name}`);
    }

    // 服务类型验证
    if (!Object.values(ServiceType).includes(type)) {
      throw new ServiceDefinitionError(`无效的服务类型: ${type}`);
    }

    // 实现验证
    if (!implementation) {
      throw new ServiceDefinitionError('服务实现不能为空');
    }

    // 类型特定验证
    if ((type === ServiceType.FACTORY || type === ServiceType.CLASS) &&
        typeof implementation !== 'function') {
      throw new ServiceDefinitionError(`${type} 类型必须提供函数实现`);
    }

    // 依赖验证
    if (!Array.isArray(dependencies)) {
      throw new ServiceDefinitionError('依赖列表必须是数组');
    }

    if (dependencies.some(dep => typeof dep !== 'string' || !dep.trim())) {
      throw new ServiceDefinitionError('所有依赖必须是非空字符串');
    }
  }

  /**
   * 检查是否为关键服务
   */
  isCritical() {
    return this.priority === ServicePriority.CRITICAL || this.tags.critical === true;
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
      description: this.description,
      tags: this.tags,
      timeout: this.timeout
    };
  }

  /**
   * 转换为JSON
   */
  toJSON() {
    return this.getMetadata();
  }
}

/**
 * 服务定义错误类
 */
export class ServiceDefinitionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ServiceDefinitionError';
    this.timestamp = new Date().toISOString();
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
