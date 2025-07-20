import { createLogger } from '../utils/logger.js';

/**
 * 依赖注入容器
 * 管理所有服务的生命周期和依赖关系
 */
class Container {
    constructor() {
        this.services = new Map();
        this.instances = new Map();
        this.logger = createLogger('Container');
    }

    /**
     * 注册服务
     * @param {string} name - 服务名称
     * @param {Function|Object} factory - 服务工厂函数或配置对象
     * @param {Object} options - 选项
     */
    register(name, factory, options = {}) {
        const {
            singleton = true,
            dependencies = [],
            lifecycle = 'singleton'
        } = options;

        this.services.set(name, {
            factory,
            singleton,
            dependencies,
            lifecycle,
            created: false
        });

        this.logger.debug(`Registered service: ${name}`, {
            singleton,
            dependencies,
            lifecycle
        });
    }

    /**
     * 获取服务实例
     * @param {string} name - 服务名称
     * @returns {Promise<any>} 服务实例
     */
    async get(name) {
        // 如果是单例且已创建，直接返回
        if (this.instances.has(name)) {
            return this.instances.get(name);
        }

        const serviceConfig = this.services.get(name);
        if (!serviceConfig) {
            throw new Error(`Service '${name}' not found`);
        }

        // 解析依赖
        const dependencies = await this.resolveDependencies(serviceConfig.dependencies);
        
        let instance;
        
        // 创建实例
        if (typeof serviceConfig.factory === 'function') {
            // 检查是否是类构造函数
            if (serviceConfig.factory.prototype && serviceConfig.factory.prototype.constructor === serviceConfig.factory) {
                // 构造函数
                instance = new serviceConfig.factory(...dependencies);
            } else {
                // 工厂函数
                instance = serviceConfig.factory(...dependencies);
            }
        } else {
            // 直接对象或值
            instance = serviceConfig.factory;
        }

        // 如果返回Promise，等待解析
        if (instance && typeof instance.then === 'function') {
            instance = await instance;
        }

        // 如果是单例，缓存实例
        if (serviceConfig.singleton) {
            this.instances.set(name, instance);
        }

        serviceConfig.created = true;
        
        this.logger.debug(`Created service instance: ${name}`);
        return instance;
    }

    /**
     * 解析依赖关系
     * @param {string[]} dependencies - 依赖列表
     * @returns {Promise<any[]>} 依赖实例数组
     */
    async resolveDependencies(dependencies) {
        const resolved = [];
        
        for (const dep of dependencies) {
            resolved.push(await this.get(dep));
        }
        
        return resolved;
    }

    /**
     * 检查是否存在循环依赖
     * @param {string} name - 服务名称
     * @param {Set} visited - 已访问的服务
     * @param {Set} visiting - 正在访问的服务
     */
    checkCircularDependency(name, visited = new Set(), visiting = new Set()) {
        if (visiting.has(name)) {
            throw new Error(`Circular dependency detected: ${Array.from(visiting).join(' -> ')} -> ${name}`);
        }

        if (visited.has(name)) {
            return;
        }

        const serviceConfig = this.services.get(name);
        if (!serviceConfig) {
            return;
        }

        visiting.add(name);

        for (const dep of serviceConfig.dependencies) {
            this.checkCircularDependency(dep, visited, visiting);
        }

        visiting.delete(name);
        visited.add(name);
    }

    /**
     * 验证所有依赖关系
     */
    validateDependencies() {
        for (const [name] of this.services) {
            this.checkCircularDependency(name);
        }
        this.logger.info('All dependencies validated successfully');
    }

    /**
     * 获取服务统计信息
     */
    getStats() {
        const total = this.services.size;
        const created = Array.from(this.services.values()).filter(s => s.created).length;
        const singletons = Array.from(this.services.values()).filter(s => s.singleton).length;

        return {
            total,
            created,
            singletons,
            instances: this.instances.size
        };
    }

    /**
     * 清理资源
     */
    async dispose() {
        this.logger.info('Disposing container resources...');

        // 按相反顺序清理实例
        const instances = Array.from(this.instances.entries()).reverse();
        
        for (const [name, instance] of instances) {
            try {
                // 如果实例有dispose方法，调用它
                if (instance && typeof instance.dispose === 'function') {
                    await instance.dispose();
                    this.logger.debug(`Disposed service: ${name}`);
                }
                // 如果实例有close方法，调用它
                else if (instance && typeof instance.close === 'function') {
                    await instance.close();
                    this.logger.debug(`Closed service: ${name}`);
                }
                // 如果实例有cleanup方法，调用它
                else if (instance && typeof instance.cleanup === 'function') {
                    await instance.cleanup();
                    this.logger.debug(`Cleaned up service: ${name}`);
                }
            } catch (error) {
                this.logger.error(`Error disposing service ${name}:`, error);
            }
        }

        // 清空容器
        this.instances.clear();
        this.services.clear();
        
        this.logger.info('Container disposed successfully');
    }

    /**
     * 列出所有注册的服务
     */
    listServices() {
        const services = [];
        for (const [name, config] of this.services) {
            services.push({
                name,
                singleton: config.singleton,
                dependencies: config.dependencies,
                lifecycle: config.lifecycle,
                created: config.created,
                hasInstance: this.instances.has(name)
            });
        }
        return services;
    }

    /**
     * 检查服务是否存在
     * @param {string} name - 服务名称
     */
    has(name) {
        return this.services.has(name);
    }

    /**
     * 获取容器健康状态
     */
    getHealth() {
        const stats = this.getStats();
        const services = this.listServices();
        
        return {
            status: 'healthy',
            stats,
            services: services.map(s => ({
                name: s.name,
                status: s.created ? 'created' : 'registered',
                hasInstance: s.hasInstance
            }))
        };
    }
}

export default Container;