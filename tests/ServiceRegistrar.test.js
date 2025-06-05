// tests/ServiceRegistrar.test.js
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import Container from '../src/core/container.js';
import { ServiceRegistrar } from '../src/core/ServiceRegistrar.js';
import { ServiceDefinition, ServiceType, ServicePriority } from '../src/core/types/ServiceTypes.js';

describe('企业级服务注册器测试', () => {
  let container;
  let registrar;
  let mockLogger;

  beforeEach(() => {
    container = new Container();
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    registrar = new ServiceRegistrar(container, { logger: mockLogger });
  });

  afterEach(async () => {
    if (registrar) {
      registrar.dispose();
    }
    if (container) {
      await container.dispose();
    }
  });

  describe('基础功能测试', () => {
    test('应该成功注册简单服务', async () => {
      const definitions = [
        new ServiceDefinition({
          name: 'testService',
          type: ServiceType.VALUE,
          implementation: 'test-value',
          priority: ServicePriority.CRITICAL,
          description: '测试服务'
        })
      ];

      const report = await registrar.registerServices(definitions);

      expect(report.summary.registered).toBe(1);
      expect(report.summary.failed).toBe(0);
      expect(report.summary.successRate).toBe('100.0');
      expect(container.has('testService')).toBe(true);

      const service = await container.get('testService');
      expect(service).toBe('test-value');
    });

    test('应该正确处理依赖关系', async () => {
      const definitions = [
        new ServiceDefinition({
          name: 'dependency',
          type: ServiceType.VALUE,
          implementation: 'dep-value',
          priority: ServicePriority.CRITICAL
        }),
        new ServiceDefinition({
          name: 'service',
          type: ServiceType.FACTORY,
          implementation: (dep) => ({ dependency: dep }),
          dependencies: ['dependency'],
          priority: ServicePriority.NORMAL
        })
      ];

      await registrar.registerServices(definitions);

      const service = await container.get('service');
      expect(service.dependency).toBe('dep-value');
    });

    test('应该按正确顺序注册服务', async () => {
      const registrationOrder = [];

      const definitions = [
        new ServiceDefinition({
          name: 'serviceC',
          type: ServiceType.FACTORY,
          implementation: () => {
            registrationOrder.push('serviceC');
            return 'c';
          },
          dependencies: ['serviceA', 'serviceB'],
          priority: ServicePriority.NORMAL
        }),
        new ServiceDefinition({
          name: 'serviceA',
          type: ServiceType.FACTORY,
          implementation: () => {
            registrationOrder.push('serviceA');
            return 'a';
          },
          priority: ServicePriority.CRITICAL
        }),
        new ServiceDefinition({
          name: 'serviceB',
          type: ServiceType.FACTORY,
          implementation: () => {
            registrationOrder.push('serviceB');
            return 'b';
          },
          dependencies: ['serviceA'],
          priority: ServicePriority.HIGH
        })
      ];

      await registrar.registerServices(definitions);

      expect(registrationOrder).toEqual(['serviceA', 'serviceB', 'serviceC']);
    });
  });

  describe('错误处理测试', () => {
    test('应该检测循环依赖', async () => {
      const definitions = [
        new ServiceDefinition({
          name: 'serviceA',
          type: ServiceType.FACTORY,
          implementation: () => ({}),
          dependencies: ['serviceB'],
          priority: ServicePriority.NORMAL
        }),
        new ServiceDefinition({
          name: 'serviceB',
          type: ServiceType.FACTORY,
          implementation: () => ({}),
          dependencies: ['serviceA'],
          priority: ServicePriority.NORMAL
        })
      ];

      await expect(registrar.registerServices(definitions))
        .rejects.toThrow('循环依赖');
    });

    test('应该处理服务创建失败', async () => {
      const definitions = [
        new ServiceDefinition({
          name: 'failingService',
          type: ServiceType.FACTORY,
          implementation: () => {
            throw new Error('创建失败');
          },
          priority: ServicePriority.NORMAL
        })
      ];

      await expect(registrar.registerServices(definitions))
        .rejects.toThrow('服务注册失败');
    });

    test('应该支持重试机制', async () => {
      let attempts = 0;
      const definitions = [
        new ServiceDefinition({
          name: 'retryService',
          type: ServiceType.FACTORY,
          implementation: () => {
            attempts++;
            if (attempts < 3) {
              throw new Error('暂时失败');
            }
            return 'success';
          },
          priority: ServicePriority.NORMAL
        })
      ];

      const retryRegistrar = new ServiceRegistrar(container, {
        logger: mockLogger,
        enableRetry: true,
        maxRetries: 3
      });

      const report = await retryRegistrar.registerServices(definitions);

      expect(report.summary.registered).toBe(1);
      expect(attempts).toBe(3);

      retryRegistrar.dispose();
    });
  });

  describe('生命周期管理测试', () => {
    test('应该调用服务初始化方法', async () => {
      let initialized = false;

      class TestService {
        async initialize() {
          initialized = true;
        }
      }

      const definitions = [
        new ServiceDefinition({
          name: 'initService',
          type: ServiceType.CLASS,
          implementation: TestService,
          priority: ServicePriority.NORMAL
        })
      ];

      await registrar.registerServices(definitions);

      expect(initialized).toBe(true);
    });

    test('应该处理异步工厂函数', async () => {
      const definitions = [
        new ServiceDefinition({
          name: 'asyncService',
          type: ServiceType.FACTORY,
          implementation: async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return 'async-result';
          },
          priority: ServicePriority.NORMAL
        })
      ];

      await registrar.registerServices(definitions);

      const service = await container.get('asyncService');
      expect(service).toBe('async-result');
    });
  });

  describe('监控和报告测试', () => {
    test('应该提供详细的注册报告', async () => {
      const definitions = [
        new ServiceDefinition({
          name: 'reportService',
          type: ServiceType.VALUE,
          implementation: 'test',
          priority: ServicePriority.NORMAL
        })
      ];

      const report = await registrar.registerServices(definitions);

      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('serviceMetrics');
      expect(report).toHaveProperty('factoryStats');
      expect(report).toHaveProperty('containerHealth');
      expect(report).toHaveProperty('timestamp');

      expect(report.summary.total).toBe(1);
      expect(report.summary.registered).toBe(1);
      expect(report.summary.successRate).toBe('100.0');
    });

    test('应该收集服务指标', async () => {
      const definitions = [
        new ServiceDefinition({
          name: 'metricService',
          type: ServiceType.VALUE,
          implementation: 'test',
          priority: ServicePriority.CRITICAL,
          tags: { critical: true }
        })
      ];

      await registrar.registerServices(definitions);

      const metrics = registrar.getServiceMetrics();
      expect(metrics).toHaveProperty('metricService');
      expect(metrics.metricService.state).toBe('registered');
      expect(metrics.metricService.critical).toBe(true);
    });
  });
});
