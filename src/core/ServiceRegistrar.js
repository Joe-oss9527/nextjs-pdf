// src/core/ServiceRegistrar.js
/**
 * 企业级服务注册器
 * 提供完整的服务注册、依赖管理和错误处理功能
 */

import { EventEmitter } from 'events';
import { ServiceFactory } from './factories/ServiceFactory.js';
import { DependencyResolver } from './resolvers/DependencyResolver.js';
import { RegistrationStats } from './types/ServiceTypes.js';

export class ServiceRegistrar extends EventEmitter {
  constructor(container, options = {}) {
    super();

    this.container = container;
    this.options = {
      // 核心配置
      validateDependencies: true,
      enableRetry: true,
      maxRetries: 3,
      retryDelay: 1000,
      retryBackoffMultiplier: 1.5,
      registrationTimeout: 60000,
      continueOnError: false,

      // 并发配置
      enableParallelRegistration: false,
      maxConcurrency: 3,

      // 监控配置
      enableBasicMetrics: true,
      enableHealthCheck: true,

      ...options
    };

    // 初始化组件
    this.logger = options.logger || this._createDefaultLogger();
    this.serviceFactory = new ServiceFactory(this.logger);
    this.dependencyResolver = new DependencyResolver(this.logger);
    this.stats = new RegistrationStats();

    // 状态管理
    this.registrationState = {
      phase: 'idle',
      currentService: null,
      startTime: null,
      endTime: null
    };

    this.serviceMetrics = new Map();
    this.registeredServices = new Set();
  }

  /**
   * 注册所有服务
   * @param {ServiceDefinition[]} definitions - 服务定义列表
   * @returns {Promise<Object>} 注册报告
   */
  async registerServices(definitions) {
    // 初始化注册过程
    this._initializeRegistration(definitions);

    try {
      this.logger.info('🚀 开始企业级服务注册', {
        totalServices: definitions.length,
        options: this._getSafeOptions()
      });

      // 阶段1：依赖解析
      this._updatePhase('dependency_resolution');
      const orderedDefinitions = this.dependencyResolver.resolveRegistrationOrder(definitions);

      // 阶段2：服务注册
      this._updatePhase('service_registration');
      if (this.options.enableParallelRegistration) {
        await this._registerInParallel(orderedDefinitions);
      } else {
        await this._registerSequentially(orderedDefinitions);
      }

      // 阶段3：后处理
      this._updatePhase('post_processing');
      await this._postRegistration();

      // 完成注册
      this._finalizeRegistration(true);

      const report = this._generateReport();
      this.logger.info('✅ 服务注册完成', report.summary);

      return report;

    } catch (error) {
      this._finalizeRegistration(false, error);

      this.logger.error('❌ 服务注册失败', {
        error: error.message,
        phase: this.registrationState.phase,
        currentService: this.registrationState.currentService,
        summary: this.stats.getSummary()
      });

      throw new ServiceRegistrationError(
        `服务注册失败: ${error.message}`,
        this.registrationState.phase,
        this.stats.getDetailedReport(),
        error
      );
    }
  }

  /**
   * 顺序注册服务
   * @private
   */
  async _registerSequentially(definitions) {
    for (const definition of definitions) {
      await this._registerServiceWithRetry(definition);
    }
  }

  /**
   * 并行注册服务（分层级）
   * @private
   */
  async _registerInParallel(definitions) {
    // 按优先级分组
    const priorityGroups = new Map();
    for (const def of definitions) {
      if (!priorityGroups.has(def.priority)) {
        priorityGroups.set(def.priority, []);
      }
      priorityGroups.get(def.priority).push(def);
    }

    // 按优先级顺序处理
    for (const [priority, groupDefs] of Array.from(priorityGroups.entries()).sort(([a], [b]) => a - b)) {
      this.logger.debug(`注册优先级 ${priority} 的服务`, {
        services: groupDefs.map(d => d.name)
      });

      // 并行注册同优先级服务
      const chunks = this._chunkArray(groupDefs, this.options.maxConcurrency);
      for (const chunk of chunks) {
        await Promise.all(
          chunk.map(def => this._registerServiceWithRetry(def))
        );
      }
    }
  }

  /**
   * 带重试的服务注册
   * @private
   */
  async _registerServiceWithRetry(definition) {
    let lastError;
    const maxRetries = this.options.enableRetry ? this.options.maxRetries : 1;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this._registerSingleService(definition, attempt);
        return; // 注册成功，退出重试循环
      } catch (error) {
        lastError = error;

        if (attempt < maxRetries) {
          const delay = this.options.retryDelay * Math.pow(this.options.retryBackoffMultiplier, attempt - 1);

          this.logger.warn(`服务注册失败，准备重试: ${definition.name}`, {
            attempt,
            maxRetries,
            retryDelay: delay,
            error: error.message
          });

          await this._delay(delay);
        }
      }
    }

    // 所有重试都失败了
    this.stats.recordFailure(definition.name, lastError);

    // 记录详细的失败指标
    this.serviceMetrics.set(definition.name, {
      state: 'failed',
      error: lastError.message,
      attempts: maxRetries,
      registrationTime: null
    });

    if (!this.options.continueOnError) {
      throw lastError;
    }

    this.logger.error(`服务注册最终失败: ${definition.name}`, {
      attempts: maxRetries,
      error: lastError.message
    });
  }

  /**
   * 注册单个服务
   * @private
   */
  async _registerSingleService(definition, attempt = 1) {
    const startTime = Date.now();
    this.registrationState.currentService = definition.name;

    try {
      // 设置注册超时
      const registrationPromise = this._doRegisterService(definition);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('注册超时')), this.options.registrationTimeout)
      );

      await Promise.race([registrationPromise, timeoutPromise]);

      // 记录成功
      const duration = Date.now() - startTime;
      this.stats.recordSuccess();
      this.registeredServices.add(definition.name);

      // 记录服务指标
      this.serviceMetrics.set(definition.name, {
        state: 'registered',
        registrationTime: duration,
        registeredAt: Date.now(),
        attempts: attempt,
        critical: definition.isCritical()
      });

      this.emit('service-registered', {
        serviceName: definition.name,
        duration,
        attempt,
        critical: definition.isCritical()
      });

      this.logger.debug(`服务注册成功: ${definition.name}`, {
        duration: `${duration}ms`,
        attempt: attempt > 1 ? attempt : undefined
      });

    } catch (error) {
      const duration = Date.now() - startTime;

      this.serviceMetrics.set(definition.name, {
        state: 'failed',
        registrationTime: duration,
        error: error.message,
        attempts: attempt
      });

      throw error;
    } finally {
      this.registrationState.currentService = null;
    }
  }

  /**
   * 执行服务注册核心逻辑
   * @private
   */
  async _doRegisterService(definition) {
    // 1. 解析依赖
    const dependencies = [];
    for (const depName of definition.dependencies) {
      if (!this.registeredServices.has(depName)) {
        throw new Error(`依赖服务 '${depName}' 尚未注册`);
      }

      const dependency = await this.container.get(depName);
      dependencies.push(dependency);
    }

    // 2. 创建服务实例
    const service = await this.serviceFactory.createService(definition, dependencies);

    // 3. 注册到容器
    this.container.register(
      definition.name,
      () => service,
      {
        singleton: definition.singleton,
        dependencies: definition.dependencies,
        lifecycle: 'singleton'
      }
    );
  }

  /**
   * 后处理阶段
   * @private
   */
  async _postRegistration() {
    // 验证容器状态
    this.container.validateDependencies();

    // 执行基础健康检查
    if (this.options.enableHealthCheck) {
      await this._performHealthCheck();
    }

    // 预加载关键服务
    await this._preloadCriticalServices();
  }

  /**
   * 执行健康检查
   * @private
   */
  async _performHealthCheck() {
    this.logger.debug('执行服务健康检查');

    const healthResults = {};

    for (const serviceName of this.registeredServices) {
      try {
        const service = await this.container.get(serviceName);

        // 如果服务有健康检查方法，调用它
        if (service && typeof service.healthCheck === 'function') {
          const result = await Promise.race([
            Promise.resolve(service.healthCheck()),
            new Promise((_, reject) => setTimeout(() => reject(new Error('健康检查超时')), 5000))
          ]);

          healthResults[serviceName] = {
            healthy: result === true || (result && result.healthy !== false),
            details: typeof result === 'object' ? result : {}
          };
        } else {
          // 基础健康检查：服务能否正常获取
          healthResults[serviceName] = {
            healthy: true,
            details: { message: '服务可正常访问' }
          };
        }
      } catch (error) {
        healthResults[serviceName] = {
          healthy: false,
          error: error.message
        };

        this.logger.warn(`健康检查失败: ${serviceName}`, {
          error: error.message
        });
      }
    }

    this.emit('health-check-completed', healthResults);
    return healthResults;
  }

  /**
   * 预加载关键服务
   * @private
   */
  async _preloadCriticalServices() {
    const criticalServices = Array.from(this.serviceMetrics.entries())
      .filter(([name, metrics]) => metrics.critical)
      .map(([name]) => name);

    if (criticalServices.length === 0) {
      return;
    }

    this.logger.info('预加载关键服务', { services: criticalServices });

    for (const serviceName of criticalServices) {
      try {
        await this.container.get(serviceName);
        this.logger.debug(`关键服务预加载成功: ${serviceName}`);
      } catch (error) {
        this.logger.error(`关键服务预加载失败: ${serviceName}`, {
          error: error.message
        });

        if (!this.options.continueOnError) {
          throw error;
        }
      }
    }
  }

  /**
   * 初始化注册过程
   * @private
   */
  _initializeRegistration(definitions) {
    this.stats.reset();
    this.stats.start(definitions.length);

    this.registrationState = {
      phase: 'initializing',
      currentService: null,
      startTime: Date.now(),
      endTime: null
    };

    this.serviceMetrics.clear();
    this.registeredServices.clear();

    this.emit('registration-started', {
      totalServices: definitions.length,
      timestamp: Date.now()
    });
  }

  /**
   * 更新注册阶段
   * @private
   */
  _updatePhase(phase) {
    this.registrationState.phase = phase;
    this.emit('phase-changed', { phase, timestamp: Date.now() });
  }

  /**
   * 完成注册过程
   * @private
   */
  _finalizeRegistration(success, error = null) {
    this.stats.finish();
    this.registrationState.endTime = Date.now();
    this.registrationState.phase = success ? 'completed' : 'failed';

    this.emit('registration-completed', {
      success,
      summary: this.stats.getSummary(),
      error: error?.message,
      timestamp: Date.now()
    });
  }

  /**
   * 生成完整报告
   * @private
   */
  _generateReport() {
    return {
      summary: this.stats.getSummary(),
      serviceMetrics: Object.fromEntries(this.serviceMetrics),
      factoryStats: this.serviceFactory.getStats(),
      containerHealth: this.container.getHealth(),
      registrationState: {
        phase: this.registrationState.phase,
        duration: this.registrationState.endTime - this.registrationState.startTime
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 获取安全的选项（用于日志）
   * @private
   */
  _getSafeOptions() {
    return {
      validateDependencies: this.options.validateDependencies,
      enableRetry: this.options.enableRetry,
      maxRetries: this.options.maxRetries,
      enableParallelRegistration: this.options.enableParallelRegistration,
      maxConcurrency: this.options.maxConcurrency,
      continueOnError: this.options.continueOnError
    };
  }

  /**
   * 数组分块
   * @private
   */
  _chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * 延迟函数
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 创建默认日志器
   * @private
   */
  _createDefaultLogger() {
    return {
      debug: (...args) => console.debug('[ServiceRegistrar]', ...args),
      info: (...args) => console.info('[ServiceRegistrar]', ...args),
      warn: (...args) => console.warn('[ServiceRegistrar]', ...args),
      error: (...args) => console.error('[ServiceRegistrar]', ...args)
    };
  }

  /**
   * 获取服务指标
   */
  getServiceMetrics() {
    return Object.fromEntries(this.serviceMetrics);
  }

  /**
   * 获取注册统计
   */
  getRegistrationStats() {
    return this.stats.getSummary();
  }

  /**
   * 清理资源
   */
  dispose() {
    this.removeAllListeners();
    this.serviceMetrics.clear();
    this.registeredServices.clear();
    this.logger.info('服务注册器已清理');
  }
}

/**
 * 服务注册错误类
 */
export class ServiceRegistrationError extends Error {
  constructor(message, phase, report, originalError) {
    super(message);
    this.name = 'ServiceRegistrationError';
    this.phase = phase;
    this.report = report;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      phase: this.phase,
      report: this.report,
      originalError: this.originalError?.message,
      timestamp: this.timestamp
    };
  }
}
