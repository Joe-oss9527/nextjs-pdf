// src/core/setup.js
/**
 * 企业级依赖注入容器设置 - 修复版本
 * 提供简洁但功能完整的容器创建和管理功能
 */

import Container from './container.js';
import { ServiceRegistrar } from './ServiceRegistrar.js';
import { 
  serviceDefinitions, 
  getCriticalServices, 
  getStartupConfig,
  generateStartupPlan,
  analyzeServiceDependencies
} from './ServiceDefinitions.js';
import { createLogger } from '../utils/logger.js';

/**
 * 创建企业级容器
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 增强的容器对象
 */
export async function createContainer(options = {}) {
  const logger = createLogger('Setup');
  const container = new Container();

  try {
    logger.info('🚀 初始化企业级依赖注入容器');

    // 🆕 获取环境配置
    const environment = options.environment || process.env.NODE_ENV || 'production';
    const startupConfig = getStartupConfig(environment);
    
    // 🆕 生成启动计划
    const startupPlan = generateStartupPlan(environment);
    logger.info('📋 启动计划生成完成', {
      environment,
      estimatedTime: `${startupPlan.estimatedTime}ms`,
      criticalServices: startupPlan.criticalServices.length,
      asyncServices: startupPlan.asyncServices.length
    });

    // 创建服务注册器
    const registrar = new ServiceRegistrar(container, {
      logger,
      validateDependencies: true,
      enableRetry: true,
      maxRetries: 3,
      enableParallelRegistration: options.parallel || startupConfig.enableParallelRegistration,
      enableBasicMetrics: true,
      enableHealthCheck: startupConfig.enableHealthCheck,
      continueOnError: startupConfig.continueOnError,
      ...startupConfig,
      ...options
    });

    // 监听注册事件（可选）
    if (options.verbose) {
      registrar.on('service-registered', (event) => {
        logger.debug(`✓ 服务已注册: ${event.serviceName}`, {
          duration: event.duration,
          critical: event.critical
        });
      });

      registrar.on('phase-changed', (event) => {
        logger.debug(`⚡ 进入阶段: ${event.phase}`);
      });

      // 🆕 监听健康检查事件
      registrar.on('health-check-completed', (results) => {
        const healthyCount = Object.values(results).filter(r => r.healthy).length;
        logger.debug(`🏥 健康检查完成: ${healthyCount}/${Object.keys(results).length} 服务健康`);
      });
    }

    // 执行服务注册
    const report = await registrar.registerServices(serviceDefinitions);

    // 输出注册结果
    logger.info('✅ 容器初始化完成', {
      services: `${report.summary.registered}/${report.summary.total}`,
      duration: report.summary.duration,
      successRate: report.summary.successRate,
      criticalServices: getCriticalServices().length
    });

    // 🆕 输出启动建议
    if (startupPlan.recommendations.length > 0) {
      logger.info('💡 启动建议:');
      startupPlan.recommendations.forEach(rec => {
        logger[rec.type](rec.message, { services: rec.services });
      });
    }

    // 返回增强的容器对象
    return new EnhancedContainer(container, registrar, report, logger, startupPlan);

  } catch (error) {
    logger.error('❌ 容器初始化失败', {
      error: error.message,
      phase: error.phase
    });

    // 清理资源
    try {
      await container.dispose();
    } catch (cleanupError) {
      logger.error('清理失败', { error: cleanupError.message });
    }

    throw error;
  }
}

/**
 * 增强的容器类 - 修复版本
 * 提供额外的企业级功能
 */
class EnhancedContainer {
  constructor(container, registrar, report, logger, startupPlan = null) {
    this.container = container;
    this.registrar = registrar;
    this.report = report;
    this.logger = logger;
    this.startupPlan = startupPlan;
    this.createdAt = Date.now();
    
    // 🆕 性能监控
    this.metrics = {
      requestCount: 0,
      errorCount: 0,
      averageResponseTime: 0,
      lastHealthCheck: null
    };
  }

  /**
   * 获取服务实例
   */
  async get(serviceName) {
    const startTime = Date.now();
    this.metrics.requestCount++;

    try {
      const service = await this.container.get(serviceName);
      
      // 更新性能指标
      const responseTime = Date.now() - startTime;
      this.metrics.averageResponseTime = 
        (this.metrics.averageResponseTime * (this.metrics.requestCount - 1) + responseTime) / this.metrics.requestCount;
      
      return service;
    } catch (error) {
      this.metrics.errorCount++;
      this.logger.error(`获取服务失败: ${serviceName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 检查服务是否存在
   */
  has(serviceName) {
    return this.container.has(serviceName);
  }

  /**
   * 获取健康状态
   */
  getHealth() {
    return {
      status: 'healthy',
      uptime: Date.now() - this.createdAt,
      container: this.container.getHealth(),
      services: this.registrar.getServiceMetrics(),
      registration: this.report.summary,
      metrics: { ...this.metrics },
      lastHealthCheck: this.metrics.lastHealthCheck,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 获取完整报告
   */
  getReport() {
    return {
      ...this.report,
      currentHealth: this.getHealth(),
      uptime: Date.now() - this.createdAt,
      startupPlan: this.startupPlan,
      metrics: this.metrics
    };
  }

  /**
   * 获取服务指标
   */
  getServiceMetrics() {
    return this.registrar.getServiceMetrics();
  }

  /**
   * 🔧 修复：执行健康检查 - 使用公开方法
   */
  async performHealthCheck() {
    try {
      // 🔧 修复：调用公开的健康检查方法
      const results = await this.registrar.performHealthCheck();
      
      this.metrics.lastHealthCheck = Date.now();
      
      this.logger.info('健康检查完成', {
        totalServices: Object.keys(results).length,
        healthyServices: Object.values(results).filter(r => r.healthy).length,
        timestamp: new Date().toISOString()
      });
      
      return results;
    } catch (error) {
      this.metrics.errorCount++;
      this.logger.error('健康检查失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 🆕 自动健康检查
   */
  startAutoHealthCheck(interval = 300000) { // 5分钟间隔
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        this.logger.warn('自动健康检查失败', { error: error.message });
      }
    }, interval);

    this.logger.info('自动健康检查已启动', { interval: `${interval / 1000}秒` });
  }

  /**
   * 🆕 停止自动健康检查
   */
  stopAutoHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      this.logger.info('自动健康检查已停止');
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      container: this.container.getStats(),
      registration: this.registrar.getRegistrationStats(),
      factory: this.registrar.serviceFactory.getStats(),
      uptime: Date.now() - this.createdAt,
      metrics: this.metrics
    };
  }

  /**
   * 🆕 获取服务依赖图
   */
  getServiceDependencyGraph() {
    return this.registrar.getServiceDependencyGraph();
  }

  /**
   * 🆕 分析容器状态
   */
  analyzeContainerState() {
    const stats = this.getStats();
    const health = this.getHealth();
    const dependencies = analyzeServiceDependencies();

    return {
      overall: {
        status: health.status,
        uptime: health.uptime,
        totalServices: stats.container.total,
        healthyServices: Object.values(this.getServiceMetrics())
          .filter(m => m.state === 'registered').length
      },
      performance: {
        requestCount: this.metrics.requestCount,
        errorRate: this.metrics.requestCount > 0 
          ? (this.metrics.errorCount / this.metrics.requestCount * 100).toFixed(2) + '%'
          : '0%',
        averageResponseTime: Math.round(this.metrics.averageResponseTime) + 'ms'
      },
      dependencies: {
        totalDependencies: dependencies.totalServices,
        orphanServices: dependencies.orphans.length,
        heavyDependents: dependencies.heavyDependents.length
      },
      recommendations: this._generateContainerRecommendations(stats, health)
    };
  }

  /**
   * 🆕 生成容器建议
   * @private
   */
  _generateContainerRecommendations(stats, health) {
    const recommendations = [];

    // 性能建议
    if (this.metrics.averageResponseTime > 100) {
      recommendations.push({
        type: 'performance',
        message: '服务响应时间较慢，考虑优化服务实现或增加缓存',
        priority: 'medium'
      });
    }

    // 错误率建议
    const errorRate = this.metrics.requestCount > 0 
      ? this.metrics.errorCount / this.metrics.requestCount
      : 0;
    
    if (errorRate > 0.01) { // 1%错误率
      recommendations.push({
        type: 'reliability',
        message: '错误率较高，检查服务稳定性和错误处理',
        priority: 'high'
      });
    }

    // 内存建议
    const memoryUsage = process.memoryUsage();
    if (memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
      recommendations.push({
        type: 'memory',
        message: '内存使用量较高，检查是否存在内存泄漏',
        priority: 'medium'
      });
    }

    // 健康检查建议
    if (!this.metrics.lastHealthCheck) {
      recommendations.push({
        type: 'monitoring',
        message: '建议定期执行健康检查',
        priority: 'low'
      });
    }

    return recommendations;
  }

  /**
   * 🆕 重新启动失败的服务
   */
  async restartFailedServices() {
    return this.registrar.retryFailedServices();
  }

  /**
   * 清理资源
   */
  async dispose() {
    try {
      this.logger.info('开始清理容器资源');

      // 停止自动健康检查
      this.stopAutoHealthCheck();

      // 清理注册器
      this.registrar.dispose();

      // 清理容器
      await this.container.dispose();

      this.logger.info('容器资源清理完成');
    } catch (error) {
      this.logger.error('容器清理失败', { error: error.message });
      throw error;
    }
  }
}

/**
 * 快速创建开发环境容器
 */
export async function createDevContainer(options = {}) {
  return createContainer({
    environment: 'development',
    parallel: true,
    enableRetry: false,
    continueOnError: true,
    verbose: true,
    ...options
  });
}

/**
 * 创建生产环境容器
 */
export async function createProductionContainer(options = {}) {
  return createContainer({
    environment: 'production',
    parallel: false,
    enableRetry: true,
    maxRetries: 5,
    continueOnError: false,
    enableHealthCheck: true,
    ...options
  });
}

/**
 * 🆕 创建测试环境容器
 */
export async function createTestContainer(options = {}) {
  return createContainer({
    environment: 'testing',
    parallel: false,
    enableRetry: false,
    continueOnError: false,
    enableHealthCheck: false,
    verbose: false,
    ...options
  });
}

/**
 * 向后兼容的别名
 */
export { createContainer as setupContainer };

/**
 * 获取容器健康状态
 */
export function getContainerHealth(enhancedContainer) {
  if (!enhancedContainer || typeof enhancedContainer.getHealth !== 'function') {
    return {
      status: 'unavailable',
      message: 'Container not available or not properly initialized',
      timestamp: new Date().toISOString()
    };
  }

  try {
    return enhancedContainer.getHealth();
  } catch (error) {
    return {
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 安全关闭容器
 */
export async function shutdownContainer(enhancedContainer) {
  if (!enhancedContainer) {
    return;
  }

  const logger = createLogger('Shutdown');

  try {
    logger.info('🛑 开始关闭容器');

    if (typeof enhancedContainer.dispose === 'function') {
      await enhancedContainer.dispose();
    } else if (enhancedContainer.container && typeof enhancedContainer.container.dispose === 'function') {
      await enhancedContainer.container.dispose();
    }

    logger.info('✅ 容器关闭完成');
  } catch (error) {
    logger.error('❌ 容器关闭失败', { error: error.message });
    throw error;
  }
}

/**
 * 🆕 批量创建容器（用于测试或多实例场景）
 */
export async function createContainers(configs) {
  const containers = [];
  const errors = [];

  for (const config of configs) {
    try {
      const container = await createContainer(config);
      containers.push(container);
    } catch (error) {
      errors.push({ config, error });
    }
  }

  return { containers, errors };
}

/**
 * 🆕 监控容器性能
 */
export function monitorContainer(container, options = {}) {
  const interval = options.interval || 60000; // 1分钟
  const logger = options.logger || createLogger('ContainerMonitor');

  const monitor = setInterval(() => {
    try {
      const analysis = container.analyzeContainerState();
      
      logger.info('容器状态监控', {
        status: analysis.overall.status,
        uptime: Math.round(analysis.overall.uptime / 1000) + 's',
        services: analysis.overall.totalServices,
        errorRate: analysis.performance.errorRate,
        avgResponseTime: analysis.performance.averageResponseTime
      });

      // 输出高优先级建议
      const highPriorityRecs = analysis.recommendations
        .filter(rec => rec.priority === 'high');
      
      if (highPriorityRecs.length > 0) {
        logger.warn('检测到高优先级问题', {
          count: highPriorityRecs.length,
          issues: highPriorityRecs.map(rec => rec.message)
        });
      }

    } catch (error) {
      logger.error('容器监控失败', { error: error.message });
    }
  }, interval);

  return {
    stop: () => clearInterval(monitor),
    interval
  };
}