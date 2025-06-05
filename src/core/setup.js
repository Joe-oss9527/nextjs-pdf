// src/core/setup.js
/**
 * 企业级依赖注入容器设置
 * 提供简洁但功能完整的容器创建和管理功能
 */

import Container from './container.js';
import { ServiceRegistrar } from './ServiceRegistrar.js';
import { serviceDefinitions, getCriticalServices } from './ServiceDefinitions.js';
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

    // 创建服务注册器
    const registrar = new ServiceRegistrar(container, {
      logger,
      validateDependencies: true,
      enableRetry: true,
      maxRetries: 3,
      enableParallelRegistration: options.parallel || false,
      enableBasicMetrics: true,
      enableHealthCheck: true,
      continueOnError: false,
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

    // 返回增强的容器对象
    return new EnhancedContainer(container, registrar, report, logger);

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
 * 增强的容器类
 * 提供额外的企业级功能
 */
class EnhancedContainer {
  constructor(container, registrar, report, logger) {
    this.container = container;
    this.registrar = registrar;
    this.report = report;
    this.logger = logger;
    this.createdAt = Date.now();
  }

  /**
   * 获取服务实例
   */
  async get(serviceName) {
    try {
      return await this.container.get(serviceName);
    } catch (error) {
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
      uptime: Date.now() - this.createdAt
    };
  }

  /**
   * 获取服务指标
   */
  getServiceMetrics() {
    return this.registrar.getServiceMetrics();
  }

  /**
   * 执行健康检查
   */
  async performHealthCheck() {
    try {
      const results = await this.registrar._performHealthCheck();
      this.logger.info('健康检查完成', {
        totalServices: Object.keys(results).length,
        healthyServices: Object.values(results).filter(r => r.healthy).length
      });
      return results;
    } catch (error) {
      this.logger.error('健康检查失败', { error: error.message });
      throw error;
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
      uptime: Date.now() - this.createdAt
    };
  }

  /**
   * 清理资源
   */
  async dispose() {
    try {
      this.logger.info('开始清理容器资源');

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
    parallel: false,
    enableRetry: true,
    maxRetries: 5,
    continueOnError: false,
    enableHealthCheck: true,
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
