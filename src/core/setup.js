// src/core/setup.js
import Container from './container.js';
import { services, getCriticalServices, getAllServiceNames, getServiceConfig } from './serviceConfig.js';
import { createLogger } from '../utils/logger.js';

/**
 * 验证服务配置的完整性和正确性
 * @param {Object} services - 服务配置对象
 * @param {Object} logger - 日志记录器
 */
function validateServiceConfig(services, logger) {
  const serviceNames = getAllServiceNames();
  const errors = [];

  logger.debug('开始验证服务配置', { serviceCount: serviceNames.length });

  for (const [name, config] of Object.entries(services)) {
    // 检查必需字段
    if (!config.factory && !config.class) {
      errors.push(`服务 ${name} 缺少 factory 或 class 定义`);
      continue;
    }

    // 检查factory和class不能同时存在
    if (config.factory && config.class) {
      errors.push(`服务 ${name} 不能同时定义 factory 和 class`);
      continue;
    }

    // 检查依赖是否存在
    if (config.deps && Array.isArray(config.deps)) {
      for (const dep of config.deps) {
        if (!serviceNames.includes(dep)) {
          errors.push(`服务 ${name} 的依赖 '${dep}' 不存在`);
        }
      }
    }

    // 检查优先级
    if (config.priority !== undefined && typeof config.priority !== 'number') {
      errors.push(`服务 ${name} 的优先级必须是数字`);
    }

    // 检查初始化方法名
    if (config.init && typeof config.init !== 'string') {
      errors.push(`服务 ${name} 的初始化方法名必须是字符串`);
    }
  }

  if (errors.length > 0) {
    const errorMessage = `服务配置验证失败:\n${errors.join('\n')}`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  logger.debug('服务配置验证通过');
}

/**
 * 检测简单的循环依赖
 * @param {Object} services - 服务配置对象
 * @param {Object} logger - 日志记录器
 */
function detectCircularDependencies(services, logger) {
  const serviceNames = Object.keys(services);

  function hasCircularDependency(serviceName, visited = new Set(), path = []) {
    if (path.includes(serviceName)) {
      return path.concat(serviceName);
    }

    if (visited.has(serviceName)) {
      return null;
    }

    visited.add(serviceName);
    const config = services[serviceName];

    if (config && config.deps) {
      for (const dep of config.deps) {
        const cycle = hasCircularDependency(dep, visited, path.concat(serviceName));
        if (cycle) {
          return cycle;
        }
      }
    }

    return null;
  }

  for (const serviceName of serviceNames) {
    const cycle = hasCircularDependency(serviceName);
    if (cycle) {
      const cycleString = cycle.join(' -> ');
      const errorMessage = `检测到循环依赖: ${cycleString}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  logger.debug('循环依赖检查通过');
}

/**
 * 自动注册所有服务到容器
 * @param {Container} container - 依赖注入容器
 * @param {Object} logger - 日志记录器
 */
async function registerServices(container, logger) {
  // 验证配置
  validateServiceConfig(services, logger);

  // 检测循环依赖
  detectCircularDependencies(services, logger);

  // 按优先级排序服务
  const sortedServices = Object.entries(services)
    .sort(([,a], [,b]) => (a.priority || 999) - (b.priority || 999));

  logger.info('开始注册服务', {
    serviceCount: sortedServices.length,
    order: sortedServices.map(([name, config]) => `${name}(${config.priority || 999})`)
  });

  for (const [name, config] of sortedServices) {
    try {
      logger.debug(`注册服务: ${name}`, {
        type: config.factory ? 'factory' : 'class',
        deps: config.deps || [],
        priority: config.priority || 999,
        hasInit: !!config.init,
        critical: !!config.critical
      });

      // 创建服务工厂函数
      let factory;

      if (config.factory) {
        // 使用提供的工厂函数
        factory = config.factory;
      } else if (config.class) {
        // 为类创建工厂函数
        factory = (...deps) => new config.class(...deps);
      } else {
        throw new Error(`服务 ${name} 缺少 factory 或 class 定义`);
      }

      // 如果有初始化方法，包装工厂函数
      if (config.init) {
        const originalFactory = factory;
        factory = async (...deps) => {
          try {
            // 确保异步一致性
            const instance = await Promise.resolve(originalFactory(...deps));

            if (!instance) {
              throw new Error(`工厂函数返回了空值`);
            }

            if (typeof instance[config.init] === 'function') {
              logger.debug(`调用 ${name}.${config.init}()`);
              await Promise.resolve(instance[config.init]());
              logger.debug(`${name}.${config.init}() 完成`);
            } else {
              logger.warn(`服务 ${name} 没有初始化方法: ${config.init}`);
            }

            return instance;
          } catch (error) {
            throw new Error(`服务 ${name} 初始化失败: ${error.message}`);
          }
        };
      }

      // 注册到容器
      container.register(name, factory, {
        dependencies: config.deps || [],
        singleton: config.singleton !== false, // 默认为单例
        lifecycle: 'singleton'
      });

      logger.debug(`✓ 服务注册成功: ${name}`);

    } catch (error) {
      const errorMessage = `注册服务 '${name}' 失败: ${error.message}`;
      logger.error(errorMessage, {
        serviceName: name,
        serviceConfig: {
          type: config.factory ? 'factory' : 'class',
          deps: config.deps || [],
          priority: config.priority
        },
        error: error.message
      });
      throw new Error(errorMessage);
    }
  }

  logger.info('所有服务注册完成');
}

/**
 * 预加载关键服务
 * @param {Container} container - 依赖注入容器
 * @param {Object} logger - 日志记录器
 */
async function preloadCriticalServices(container, logger) {
  const criticalServices = getCriticalServices();

  if (criticalServices.length === 0) {
    logger.debug('没有需要预加载的关键服务');
    return;
  }

  logger.info('预加载关键服务', { services: criticalServices });

  for (const serviceName of criticalServices) {
    try {
      const startTime = Date.now();
      const service = await container.get(serviceName);
      const duration = Date.now() - startTime;

      logger.debug(`✓ 预加载成功: ${serviceName}`, {
        duration: `${duration}ms`,
        hasService: !!service
      });
    } catch (error) {
      const errorMessage = `预加载关键服务 '${serviceName}' 失败: ${error.message}`;
      logger.error(errorMessage, {
        serviceName,
        error: error.message
      });
      throw new Error(errorMessage);
    }
  }

  logger.info('关键服务预加载完成');
}

/**
 * 创建和配置依赖注入容器
 * @param {Object} options - 配置选项
 * @param {boolean} options.preloadCritical - 是否预加载关键服务，默认 true
 * @param {boolean} options.validateConfig - 是否验证配置，默认 true
 * @returns {Promise<Container>} 配置好的容器实例
 */
export async function createContainer(options = {}) {
  const logger = createLogger('Setup');
  const container = new Container();

  // 设置默认选项
  const config = {
    preloadCritical: true,
    validateConfig: true,
    ...options
  };

  try {
    logger.info('🚀 初始化依赖注入容器', {
      mode: 'declarative',
      options: config
    });

    // 注册所有服务
    await registerServices(container, logger);

    // 验证容器的依赖关系
    if (config.validateConfig) {
      logger.debug('验证容器依赖关系');
      container.validateDependencies();
      logger.debug('容器依赖关系验证通过');
    }

    // 预加载关键服务
    if (config.preloadCritical) {
      await preloadCriticalServices(container, logger);
    }

    // 获取容器统计信息
    const stats = container.getStats();
    const health = container.getHealth();

    logger.info('✅ 容器初始化完成', {
      stats: {
        总服务数: stats.total,
        已创建: stats.created,
        单例数: stats.singletons,
        实例数: stats.instances
      },
      健康状态: health.status,
      预加载服务: config.preloadCritical ? getCriticalServices().length : 0
    });

    return container;

  } catch (error) {
    logger.error('❌ 容器初始化失败', {
      error: error.message,
      stack: error.stack
    });

    // 清理已创建的资源
    try {
      await container.dispose();
      logger.debug('容器清理完成');
    } catch (cleanupError) {
      logger.error('清理容器时发生错误', {
        error: cleanupError.message
      });
    }

    throw error;
  }
}

/**
 * 安全关闭容器并清理所有资源
 * @param {Container} container - 要关闭的容器实例
 */
export async function shutdownContainer(container) {
  if (!container) {
    return;
  }

  const logger = createLogger('Shutdown');

  try {
    logger.info('🛑 开始关闭容器');

    // 获取关闭前的统计信息
    const stats = container.getStats();
    logger.debug('关闭前容器状态', { stats });

    // 执行容器清理
    await container.dispose();

    logger.info('✅ 容器关闭完成');
  } catch (error) {
    logger.error('❌ 容器关闭失败', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * 获取容器健康状态
 * @param {Container} container - 容器实例
 * @returns {Object} 健康状态信息
 */
export function getContainerHealth(container) {
  if (!container) {
    return {
      status: 'unavailable',
      message: 'Container not initialized',
      timestamp: new Date().toISOString()
    };
  }

  try {
    const health = container.getHealth();
    return {
      ...health,
      timestamp: new Date().toISOString(),
      criticalServices: getCriticalServices()
    };
  } catch (error) {
    return {
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 获取服务注册报告
 * @param {Container} container - 容器实例
 * @returns {Object} 详细的服务报告
 */
export function getServiceReport(container) {
  if (!container) {
    return {
      available: false,
      message: 'Container not available'
    };
  }

  try {
    const stats = container.getStats();
    const health = container.getHealth();
    const criticalServices = getCriticalServices();

    return {
      available: true,
      summary: {
        totalServices: stats.total,
        createdServices: stats.created,
        singletonServices: stats.singletons,
        activeInstances: stats.instances
      },
      health: health,
      criticalServices: criticalServices,
      serviceGroups: Object.keys(services).reduce((groups, serviceName) => {
        const config = getServiceConfig(serviceName);
        const groupName = config.critical ? 'critical' :
                         config.priority <= 2 ? 'foundation' :
                         config.priority <= 4 ? 'infrastructure' : 'application';

        if (!groups[groupName]) {
          groups[groupName] = [];
        }
        groups[groupName].push(serviceName);
        return groups;
      }, {}),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      available: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// 保持向后兼容性
export { createContainer as setupContainer };
