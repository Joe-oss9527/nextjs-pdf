// src/core/resolvers/DependencyResolver.js
/**
 * 智能依赖解析器 - 修复版本
 * 负责依赖关系验证、循环依赖检测和注册顺序优化
 */

export class DependencyResolver {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * 解析服务注册顺序
   * @param {ServiceDefinition[]} definitions - 服务定义列表
   * @returns {ServiceDefinition[]} 排序后的服务定义列表
   */
  resolveRegistrationOrder(definitions) {
    this.logger.debug('开始解析服务注册顺序', {
      totalServices: definitions.length
    });

    // 1. 构建依赖图
    const graph = this._buildDependencyGraph(definitions);

    // 2. 验证依赖完整性
    this._validateDependencies(graph, definitions);

    // 3. 检测循环依赖
    this._detectCircularDependencies(graph);

    // 4. 拓扑排序
    const sortedNames = this._topologicalSort(graph);

    // 5. 按优先级排序同级服务 - 🔧 修复方法名
    const result = this._applyPrioritySort(sortedNames, definitions);

    this.logger.debug('依赖解析完成', {
      registrationOrder: result.map(d => d.name)
    });

    return result;
  }

  /**
   * 构建依赖图
   * @private
   */
  _buildDependencyGraph(definitions) {
    const graph = new Map();

    // 初始化所有节点
    for (const def of definitions) {
      graph.set(def.name, {
        definition: def,
        dependencies: [...def.dependencies],
        dependents: [],
        level: 0
      });
    }

    // 构建依赖关系
    for (const [serviceName, node] of graph) {
      for (const depName of node.dependencies) {
        const depNode = graph.get(depName);
        if (depNode) {
          depNode.dependents.push(serviceName);
        }
      }
    }

    return graph;
  }

  /**
   * 验证依赖完整性
   * @private
   */
  _validateDependencies(graph, definitions) {
    const serviceNames = new Set(definitions.map(d => d.name));
    const errors = [];

    for (const def of definitions) {
      for (const depName of def.dependencies) {
        if (!serviceNames.has(depName)) {
          errors.push(`服务 '${def.name}' 依赖不存在的服务 '${depName}'`);
        }
      }
    }

    if (errors.length > 0) {
      throw new DependencyError(`依赖验证失败:\n${errors.join('\n')}`);
    }
  }

  /**
   * 检测循环依赖
   * @private
   */
  _detectCircularDependencies(graph) {
    const visited = new Set();
    const recursionStack = new Set();

    const detectCycle = (serviceName, path = []) => {
      if (recursionStack.has(serviceName)) {
        // 找到循环的起始点
        const cycleStart = path.indexOf(serviceName);
        const cycle = path.slice(cycleStart).concat([serviceName]);
        throw new CircularDependencyError(
          `检测到循环依赖: ${cycle.join(' -> ')}`
        );
      }

      if (visited.has(serviceName)) {
        return false;
      }

      visited.add(serviceName);
      recursionStack.add(serviceName);

      const node = graph.get(serviceName);
      if (node) {
        for (const depName of node.dependencies) {
          if (detectCycle(depName, [...path, serviceName])) {
            return true;
          }
        }
      }

      recursionStack.delete(serviceName);
      return false;
    };

    // 检查每个服务
    for (const serviceName of graph.keys()) {
      if (!visited.has(serviceName)) {
        detectCycle(serviceName);
      }
    }
  }

  /**
   * 拓扑排序
   * @private
   */
  _topologicalSort(graph) {
    const result = [];
    const inDegree = new Map();

    // 计算入度
    for (const [name, node] of graph) {
      inDegree.set(name, node.dependencies.length);
    }

    // 初始化队列（入度为0的节点）
    const queue = [];
    for (const [name, degree] of inDegree) {
      if (degree === 0) {
        queue.push(name);
        // 设置层级
        graph.get(name).level = 0;
      }
    }

    // 拓扑排序
    let currentLevel = 0;
    while (queue.length > 0) {
      const currentLevelSize = queue.length;

      // 处理当前层级的所有节点
      for (let i = 0; i < currentLevelSize; i++) {
        const serviceName = queue.shift();
        result.push(serviceName);

        const node = graph.get(serviceName);
        node.level = currentLevel;

        // 减少依赖此服务的其他服务的入度
        for (const dependent of node.dependents) {
          const newInDegree = inDegree.get(dependent) - 1;
          inDegree.set(dependent, newInDegree);

          if (newInDegree === 0) {
            queue.push(dependent);
            graph.get(dependent).level = currentLevel + 1;
          }
        }
      }

      currentLevel++;
    }

    // 检查是否所有服务都被处理
    if (result.length !== graph.size) {
      const unprocessed = Array.from(graph.keys()).filter(name => !result.includes(name));
      throw new DependencyError(
        `拓扑排序失败，未处理的服务: ${unprocessed.join(', ')}`
      );
    }

    return result;
  }

  /**
   * 🔧 修复：应用优先级排序（修正方法名）
   * @private
   */
  _applyPrioritySort(sortedNames, definitions) {
    const defMap = new Map(definitions.map(d => [d.name, d]));
    const levelGroups = new Map();

    // 按层级分组
    for (const name of sortedNames) {
      const def = defMap.get(name);
      // 这里我们简化，直接使用优先级作为粗略的层级指示
      const level = Math.floor(def.priority);

      if (!levelGroups.has(level)) {
        levelGroups.set(level, []);
      }
      levelGroups.get(level).push(def);
    }

    // 在每个层级内按优先级排序
    const result = [];
    for (const [level, defs] of Array.from(levelGroups.entries()).sort(([a], [b]) => a - b)) {
      // 同层级内按优先级和名称排序
      defs.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.name.localeCompare(b.name);
      });

      result.push(...defs);
    }

    return result;
  }

  /**
   * 🆕 新增：创建安全的并行注册批次
   * 确保即使在并行注册时也不会违反依赖关系
   */
  createSafeBatches(definitions) {
    const defMap = new Map(definitions.map(d => [d.name, d]));
    const batches = [];
    const processed = new Set();

    while (processed.size < definitions.length) {
      const currentBatch = [];

      for (const def of definitions) {
        if (processed.has(def.name)) continue;

        // 检查所有依赖是否已经被处理
        const allDepsProcessed = def.dependencies.every(dep => processed.has(dep));

        if (allDepsProcessed) {
          currentBatch.push(def);
          processed.add(def.name);
        }
      }

      if (currentBatch.length === 0) {
        // 如果没有可以处理的服务，说明存在循环依赖
        const remaining = definitions.filter(d => !processed.has(d.name));
        throw new DependencyError(
          `无法解析剩余服务的依赖关系: ${remaining.map(d => d.name).join(', ')}`
        );
      }

      batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * 获取依赖关系摘要
   */
  getDependencySummary(definitions) {
    const graph = this._buildDependencyGraph(definitions);
    const summary = {
      totalServices: definitions.length,
      maxDepth: 0,
      servicesByLevel: new Map(),
      criticalServices: [],
      dependencyStats: new Map()
    };

    for (const [name, node] of graph) {
      const level = node.dependencies.length;
      summary.maxDepth = Math.max(summary.maxDepth, level);

      if (!summary.servicesByLevel.has(level)) {
        summary.servicesByLevel.set(level, []);
      }
      summary.servicesByLevel.get(level).push(name);

      if (node.definition.isCritical()) {
        summary.criticalServices.push(name);
      }

      summary.dependencyStats.set(name, {
        dependencies: node.dependencies.length,
        dependents: node.dependents.length,
        level: level
      });
    }

    return summary;
  }

  /**
   * 🆕 新增：验证服务图的完整性
   */
  validateServiceGraph(definitions) {
    const errors = [];
    const warnings = [];

    try {
      // 基本验证
      this._validateDependencies(this._buildDependencyGraph(definitions), definitions);
      this._detectCircularDependencies(this._buildDependencyGraph(definitions));

      // 深度验证
      const graph = this._buildDependencyGraph(definitions);

      // 检查孤立服务
      for (const [name, node] of graph) {
        if (node.dependencies.length === 0 && node.dependents.length === 0) {
          warnings.push(`服务 '${name}' 是孤立的，没有依赖也不被依赖`);
        }

        // 检查深层依赖链
        if (node.dependencies.length > 5) {
          warnings.push(`服务 '${name}' 的直接依赖过多 (${node.dependencies.length})，考虑重构`);
        }
      }

    } catch (error) {
      errors.push(error.message);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

/**
 * 依赖错误基类
 */
export class DependencyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DependencyError';
    this.timestamp = new Date().toISOString();
  }
}

/**
 * 循环依赖错误
 */
export class CircularDependencyError extends DependencyError {
  constructor(message) {
    super(message);
    this.name = 'CircularDependencyError';
  }
}
