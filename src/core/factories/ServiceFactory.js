// src/core/factories/ServiceFactory.js
/**
 * 企业级服务工厂
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
      totalCreationTime: 0
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

    try {
      this.logger.debug(`创建服务: ${definition.name}`, definition.getMetadata());

      // 1. 创建基础实例
      const instance = await this._createBaseInstance(definition, dependencies);

      // 2. 验证实例
      this._validateInstance(instance, definition);

      // 3. 应用生命周期管理
      const managedInstance = this._applyLifecycleManagement(instance, definition);

      // 4. 执行初始化（如果需要）
      if (this._hasInitializer(managedInstance)) {
        await this._executeInitializer(managedInstance, definition);
      }

      // 5. 记录成功统计
      const duration = Date.now() - startTime;
      this.creationStats.successful++;
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
        return await this._createFromFactory(definition.implementation, dependencies);

      case ServiceType.CLASS:
        return this._createFromClass(definition.implementation, dependencies);

      case ServiceType.VALUE:
        return definition.implementation;

      default:
        throw new Error(`不支持的服务类型: ${definition.type}`);
    }
  }

  /**
   * 从工厂函数创建实例
   * @private
   */
  async _createFromFactory(factory, dependencies) {
    if (typeof factory !== 'function') {
      throw new Error('Factory 必须是函数');
    }

    try {
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
   * 从类创建实例
   * @private
   */
  _createFromClass(Constructor, dependencies) {
    if (typeof Constructor !== 'function') {
      throw new Error('Constructor 必须是函数');
    }

    try {
      return new Constructor(...dependencies);
    } catch (error) {
      throw new Error(`类实例化失败: ${error.message}`);
    }
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
      // 可以在这里添加更多的实例验证逻辑
      // 例如检查必需的方法或属性
      this.logger.debug(`服务实例验证通过: ${definition.name}`, {
        instanceType: typeof instance,
        hasDispose: typeof instance.dispose === 'function',
        hasInitialize: typeof instance.initialize === 'function'
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

    return instance;
  }

  /**
   * 检查是否有初始化器
   * @private
   */
  _hasInitializer(instance) {
    return instance &&
           typeof instance === 'object' &&
           typeof instance.initialize === 'function';
  }

  /**
   * 执行初始化
   * @private
   */
  async _executeInitializer(instance, definition) {
    try {
      this.logger.debug(`初始化服务: ${definition.name}`);

      // 设置超时保护
      const initPromise = Promise.resolve(instance.initialize());
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('初始化超时')), definition.timeout)
      );

      await Promise.race([initPromise, timeoutPromise]);

      // 更新状态
      if (instance._serviceInfo) {
        instance._serviceInfo.state = 'initialized';
      }

      this.logger.debug(`服务初始化完成: ${definition.name}`);

    } catch (error) {
      // 更新状态
      if (instance._serviceInfo) {
        instance._serviceInfo.state = 'init_failed';
      }

      throw new Error(`服务 '${definition.name}' 初始化失败: ${error.message}`);
    }
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
        : 0
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
      totalCreationTime: 0
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
