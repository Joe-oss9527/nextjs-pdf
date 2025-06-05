// src/core/factories/ServiceFactory.js
/**
 * 企业级服务工厂 - 修复版本
 * 负责创建、初始化和生命周期管理服务实例
 */

import { ServiceType } from '../types/ServiceTypes.js';

export class ServiceFactory {
  constructor(logger) {
    this.logger = logger;
    this.creationStats = {
      total: 0,
      successful: 0,
      failed: 0,
      totalCreationTime: 0,
      byType: {
        [ServiceType.FACTORY]: { total: 0, successful: 0, failed: 0 },
        [ServiceType.CLASS]: { total: 0, successful: 0, failed: 0 },
        [ServiceType.VALUE]: { total: 0, successful: 0, failed: 0 }
      }
    };
  }

  /**
   * 创建服务实例
   * @param {ServiceDefinition} definition - 服务定义
   * @param {Array} dependencies - 依赖实例列表
   * @returns {Promise<any>} 服务实例
   */
  async createService(definition, dependencies = []) {
    const startTime = Date.now();
    this.creationStats.total++;
    this.creationStats.byType[definition.type].total++;

    try {
      this.logger.debug(`创建服务: ${definition.name}`, definition.getMetadata());

      // 1. 创建基础实例
      const instance = await this._createBaseInstance(definition, dependencies);

      // 2. 验证实例
      this._validateInstance(instance, definition);

      // 3. 应用生命周期管理
      const managedInstance = this._applyLifecycleManagement(instance, definition);

      // 4. 执行初始化（如果需要）
      if (this._hasInitializer(managedInstance, definition)) {
        await this._executeInitializer(managedInstance, definition);
      }

      // 5. 记录成功统计
      const duration = Date.now() - startTime;
      this.creationStats.successful++;
      this.creationStats.byType[definition.type].successful++;
      this.creationStats.totalCreationTime += duration;

      this.logger.debug(`服务创建成功: ${definition.name}`, {
        duration: `${duration}ms`,
        type: definition.type
      });

      return managedInstance;

    } catch (error) {
      // 记录失败统计
      const duration = Date.now() - startTime;
      this.creationStats.failed++;
      this.creationStats.byType[definition.type].failed++;
      this.creationStats.totalCreationTime += duration;

      this.logger.error(`服务创建失败: ${definition.name}`, {
        error: error.message,
        duration: `${duration}ms`,
        type: definition.type,
        dependencies: definition.dependencies
      });

      throw new ServiceCreationError(
        `服务 '${definition.name}' 创建失败: ${error.message}`,
        definition.name,
        definition.type,
        error
      );
    }
  }

  /**
   * 创建基础实例
   * @private
   */
  async _createBaseInstance(definition, dependencies) {
    switch (definition.type) {
      case ServiceType.FACTORY:
        return await this._createFromFactory(definition.implementation, dependencies, definition);

      case ServiceType.CLASS:
        return this._createFromClass(definition.implementation, dependencies, definition);

      case ServiceType.VALUE:
        return definition.implementation;

      default:
        throw new Error(`不支持的服务类型: ${definition.type}`);
    }
  }

  /**
   * 从工厂函数创建实例 - 🔧 增强版本
   * @private
   */
  async _createFromFactory(factory, dependencies, definition) {
    if (typeof factory !== 'function') {
      throw new Error('Factory 必须是函数');
    }

    try {
      // 🔧 增强：检测异步工厂函数
      const isAsync = this._isAsyncFunction(factory) || definition.isAsync();

      if (isAsync) {
        this.logger.debug(`执行异步工厂函数: ${definition.name}`);
      }

      // 支持同步和异步工厂函数
      const result = await Promise.resolve(factory(...dependencies));

      if (result === null || result === undefined) {
        throw new Error('Factory 函数返回了空值');
      }

      return result;
    } catch (error) {
      throw new Error(`Factory 函数执行失败: ${error.message}`);
    }
  }

  /**
   * 从类创建实例 - 🔧 增强版本
   * @private
   */
  _createFromClass(Constructor, dependencies, definition) {
    if (typeof Constructor !== 'function') {
      throw new Error('Constructor 必须是函数');
    }

    try {
      // 🔧 增强：检查构造函数类型
      if (Constructor.prototype === undefined) {
        throw new Error('提供的函数不是有效的构造函数');
      }

      const instance = new Constructor(...dependencies);

      // 🔧 增强：验证实例化结果
      if (instance.constructor !== Constructor) {
        this.logger.warn(`服务 ${definition.name} 的实例构造函数不匹配`);
      }

      return instance;
    } catch (error) {
      throw new Error(`类实例化失败: ${error.message}`);
    }
  }

  /**
   * 🔧 增强：检测异步函数
   * @private
   */
  _isAsyncFunction(func) {
    return func.constructor.name === 'AsyncFunction' ||
           func.toString().includes('async') ||
           func[Symbol.toStringTag] === 'AsyncFunction';
  }

  /**
   * 验证创建的实例
   * @private
   */
  _validateInstance(instance, definition) {
    // 基础验证：确保实例不为空
    if (instance === null || instance === undefined) {
      throw new Error(`服务实例创建失败，返回了 ${instance}`);
    }

    // 对于非原始类型，可以进行更多验证
    if (typeof instance === 'object' && instance !== null) {
      // 🔧 增强：验证期望的方法
      if (definition.tags.requiredMethods) {
        const requiredMethods = Array.isArray(definition.tags.requiredMethods)
          ? definition.tags.requiredMethods
          : [definition.tags.requiredMethods];

        for (const method of requiredMethods) {
          if (typeof instance[method] !== 'function') {
            throw new Error(`服务实例缺少必需的方法: ${method}`);
          }
        }
      }

      // 🔧 增强：验证期望的属性
      if (definition.tags.requiredProperties) {
        const requiredProperties = Array.isArray(definition.tags.requiredProperties)
          ? definition.tags.requiredProperties
          : [definition.tags.requiredProperties];

        for (const property of requiredProperties) {
          if (!(property in instance)) {
            throw new Error(`服务实例缺少必需的属性: ${property}`);
          }
        }
      }

      this.logger.debug(`服务实例验证通过: ${definition.name}`, {
        instanceType: typeof instance,
        hasDispose: typeof instance.dispose === 'function',
        hasInitialize: typeof instance.initialize === 'function',
        hasHealthCheck: typeof instance.healthCheck === 'function'
      });
    }
  }

  /**
   * 应用生命周期管理
   * @private
   */
  _applyLifecycleManagement(instance, definition) {
    // 只对对象实例应用生命周期管理
    if (!instance || typeof instance !== 'object') {
      return instance;
    }

    // 添加服务元信息（不可枚举）
    Object.defineProperty(instance, '_serviceInfo', {
      value: {
        name: definition.name,
        type: definition.type,
        createdAt: Date.now(),
        state: 'created'
      },
      writable: true,
      enumerable: false,
      configurable: false
    });

    // 增强 dispose 方法
    if (typeof instance.dispose === 'function') {
      const originalDispose = instance.dispose.bind(instance);

      instance.dispose = async () => {
        try {
          instance._serviceInfo.state = 'disposing';
          this.logger.debug(`开始销毁服务: ${definition.name}`);

          await Promise.resolve(originalDispose());

          instance._serviceInfo.state = 'disposed';
          this.logger.debug(`服务已销毁: ${definition.name}`);
        } catch (error) {
          instance._serviceInfo.state = 'dispose_failed';
          this.logger.error(`服务销毁失败: ${definition.name}`, {
            error: error.message
          });
          throw error;
        }
      };
    }

    // 🆕 增强 healthCheck 方法
    if (typeof instance.healthCheck === 'function') {
      const originalHealthCheck = instance.healthCheck.bind(instance);

      instance.healthCheck = async () => {
        try {
          const result = await Promise.resolve(originalHealthCheck());
          return {
            healthy: result === true || (result && result.healthy !== false),
            serviceName: definition.name,
            timestamp: Date.now(),
            ...(typeof result === 'object' ? result : {})
          };
        } catch (error) {
          return {
            healthy: false,
            serviceName: definition.name,
            error: error.message,
            timestamp: Date.now()
          };
        }
      };
    }

    return instance;
  }

  /**
   * 🔧 修复和增强：检查是否有初始化器
   * @private
   */
  _hasInitializer(instance, definition) {
    // 检查实例是否有 initialize 方法
    const hasInitMethod = instance &&
                         typeof instance === 'object' &&
                         typeof instance.initialize === 'function';

    // 检查定义中是否明确标记需要初始化
    const markedForInit = definition.tags.hasInitializer === true ||
                          definition.tags.hasAsyncInit === true;

    // 🔧 增强：检查是否为异步初始化
    if (hasInitMethod) {
      const isAsyncInit = this._isAsyncFunction(instance.initialize) ||
                          definition.tags.hasAsyncInit === true;

      if (isAsyncInit) {
        this.logger.debug(`检测到异步初始化方法: ${definition.name}`);
      }
    }

    return hasInitMethod || markedForInit;
  }

  /**
   * 执行初始化 - 🔧 增强版本
   * @private
   */
  async _executeInitializer(instance, definition) {
    try {
      this.logger.debug(`初始化服务: ${definition.name}`);

      // 🔧 增强：支持多种初始化方式
      let initPromise;

      if (typeof instance.initialize === 'function') {
        // 标准的 initialize 方法
        initPromise = Promise.resolve(instance.initialize());
      } else if (definition.tags.customInitializer) {
        // 自定义初始化器
        const customInit = definition.tags.customInitializer;
        if (typeof customInit === 'function') {
          initPromise = Promise.resolve(customInit(instance));
        } else {
          throw new Error('自定义初始化器必须是函数');
        }
      } else {
        // 标记为需要初始化但没有方法，可能是配置错误
        this.logger.warn(`服务 ${definition.name} 标记为需要初始化但没有 initialize 方法`);
        return;
      }

      // 设置超时保护
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('初始化超时')), definition.timeout)
      );

      await Promise.race([initPromise, timeoutPromise]);

      // 更新状态
      if (instance._serviceInfo) {
        instance._serviceInfo.state = 'initialized';
        instance._serviceInfo.initializedAt = Date.now();
      }

      this.logger.debug(`服务初始化完成: ${definition.name}`);

    } catch (error) {
      // 更新状态
      if (instance._serviceInfo) {
        instance._serviceInfo.state = 'init_failed';
        instance._serviceInfo.initError = error.message;
      }

      throw new Error(`服务 '${definition.name}' 初始化失败: ${error.message}`);
    }
  }

  /**
   * 🆕 批量创建服务
   */
  async createServices(definitions, dependencyMap = new Map()) {
    const results = new Map();
    const errors = new Map();

    for (const definition of definitions) {
      try {
        const dependencies = definition.dependencies.map(depName => {
          if (!dependencyMap.has(depName)) {
            throw new Error(`依赖 '${depName}' 不可用`);
          }
          return dependencyMap.get(depName);
        });

        const instance = await this.createService(definition, dependencies);
        results.set(definition.name, instance);
      } catch (error) {
        errors.set(definition.name, error);
        this.logger.error(`批量创建服务失败: ${definition.name}`, {
          error: error.message
        });
      }
    }

    return {
      successful: results,
      failed: errors,
      successCount: results.size,
      failureCount: errors.size
    };
  }

  /**
   * 销毁服务实例
   */
  async destroyService(instance, serviceName) {
    if (!instance || typeof instance.dispose !== 'function') {
      this.logger.debug(`服务 ${serviceName} 无需销毁或没有 dispose 方法`);
      return;
    }

    try {
      await instance.dispose();
      this.logger.debug(`服务销毁成功: ${serviceName}`);
    } catch (error) {
      this.logger.error(`服务销毁失败: ${serviceName}`, {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 🆕 批量销毁服务
   */
  async destroyServices(serviceInstances) {
    const results = [];

    for (const [name, instance] of serviceInstances) {
      try {
        await this.destroyService(instance, name);
        results.push({ name, success: true });
      } catch (error) {
        results.push({ name, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * 🆕 健康检查所有服务
   */
  async performHealthChecks(serviceInstances) {
    const results = new Map();

    for (const [name, instance] of serviceInstances) {
      try {
        if (instance && typeof instance.healthCheck === 'function') {
          const result = await instance.healthCheck();
          results.set(name, result);
        } else {
          results.set(name, {
            healthy: true,
            serviceName: name,
            message: '服务可用但没有健康检查方法',
            timestamp: Date.now()
          });
        }
      } catch (error) {
        results.set(name, {
          healthy: false,
          serviceName: name,
          error: error.message,
          timestamp: Date.now()
        });
      }
    }

    return results;
  }

  /**
   * 获取创建统计信息
   */
  getStats() {
    return {
      ...this.creationStats,
      averageCreationTime: this.creationStats.total > 0
        ? Math.round(this.creationStats.totalCreationTime / this.creationStats.total)
        : 0,
      successRate: this.creationStats.total > 0
        ? ((this.creationStats.successful / this.creationStats.total) * 100).toFixed(1)
        : 0,
      byType: Object.fromEntries(
        Object.entries(this.creationStats.byType).map(([type, stats]) => [
          type,
          {
            ...stats,
            successRate: stats.total > 0
              ? ((stats.successful / stats.total) * 100).toFixed(1)
              : 0
          }
        ])
      )
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.creationStats = {
      total: 0,
      successful: 0,
      failed: 0,
      totalCreationTime: 0,
      byType: {
        [ServiceType.FACTORY]: { total: 0, successful: 0, failed: 0 },
        [ServiceType.CLASS]: { total: 0, successful: 0, failed: 0 },
        [ServiceType.VALUE]: { total: 0, successful: 0, failed: 0 }
      }
    };
  }

  /**
   * 🆕 获取详细诊断信息
   */
  getDiagnostics() {
    return {
      stats: this.getStats(),
      memoryUsage: process.memoryUsage(),
      timestamp: Date.now(),
      supportedTypes: Object.values(ServiceType),
      capabilities: {
        asyncFactory: true,
        lifecycle: true,
        healthCheck: true,
        batchOperations: true,
        diagnostics: true
      }
    };
  }
}

/**
 * 服务创建错误类
 */
export class ServiceCreationError extends Error {
  constructor(message, serviceName, serviceType, originalError) {
    super(message);
    this.name = 'ServiceCreationError';
    this.serviceName = serviceName;
    this.serviceType = serviceType;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();

    // 保持原型链
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ServiceCreationError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      serviceName: this.serviceName,
      serviceType: this.serviceType,
      originalError: this.originalError?.message,
      timestamp: this.timestamp
    };
  }
}
