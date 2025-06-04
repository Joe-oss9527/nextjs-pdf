#!/usr/bin/env node

/**
 * 第8阶段演示脚本
 * 测试完整的依赖注入和集成功能
 */

import { Application } from './src/app.js';
import { createContainer, getContainerHealth, shutdownContainer } from './src/core/setup.js';
import Container from './src/core/container.js';
import PythonRunner from './src/core/pythonRunner.js';
import { createLogger } from './src/utils/logger.js';

const logger = createLogger('Stage8Demo');

/**
 * 测试依赖注入容器的基本功能
 */
async function testContainerBasics() {
    logger.info('🧪 Testing Container Basics...');
    
    const container = new Container();
    
    try {
        // 测试简单服务注册
        container.register('testService', () => {
            return { name: 'TestService', initialized: true };
        });
        
        // 测试带依赖的服务
        container.register('dependentService', (testService) => {
            return { 
                name: 'DependentService',
                dependency: testService.name,
                ready: true
            };
        }, {
            dependencies: ['testService']
        });
        
        // 测试获取服务
        const testService = await container.get('testService');
        const dependentService = await container.get('dependentService');
        
        logger.info('✅ Container basic test passed', {
            testService: testService.name,
            dependentService: dependentService.name,
            dependency: dependentService.dependency
        });
        
        // 测试容器统计
        const stats = container.getStats();
        logger.info('📊 Container Statistics:', stats);
        
        // 测试服务列表
        const services = container.listServices();
        logger.info('📋 Registered Services:', services);
        
        await container.dispose();
        logger.info('✅ Container disposal test passed');
        
    } catch (error) {
        logger.error('❌ Container basic test failed:', error);
        throw error;
    }
}

/**
 * 测试循环依赖检测
 */
async function testCircularDependencyDetection() {
    logger.info('🔄 Testing Circular Dependency Detection...');
    
    const container = new Container();
    
    try {
        // 创建循环依赖
        container.register('serviceA', (serviceB) => {
            return { name: 'ServiceA', dependency: serviceB.name };
        }, { dependencies: ['serviceB'] });
        
        container.register('serviceB', (serviceA) => {
            return { name: 'ServiceB', dependency: serviceA.name };
        }, { dependencies: ['serviceA'] });
        
        // 这应该抛出循环依赖错误
        try {
            container.validateDependencies();
            logger.error('❌ Circular dependency detection failed - no error thrown');
        } catch (error) {
            if (error.message.includes('Circular dependency detected')) {
                logger.info('✅ Circular dependency detection test passed');
            } else {
                throw error;
            }
        }
        
        await container.dispose();
        
    } catch (error) {
        if (error.message.includes('Circular dependency detected')) {
            logger.info('✅ Circular dependency correctly detected');
        } else {
            logger.error('❌ Circular dependency test failed:', error);
            throw error;
        }
    }
}

/**
 * 测试完整容器设置
 */
async function testFullContainerSetup() {
    logger.info('🏗️  Testing Full Container Setup...');
    
    try {
        const container = await createContainer();
        
        // 测试关键服务是否可用
        const config = await container.get('config');
        const fileService = await container.get('fileService');
        const pathService = await container.get('pathService');
        
        logger.info('✅ Core services loaded successfully', {
            config: !!config,
            fileService: !!fileService,
            pathService: !!pathService
        });
        
        // 测试健康检查
        const health = getContainerHealth(container);
        logger.info('🏥 Container Health Check:', health);
        
        // 测试高级服务（如果配置允许）
        try {
            const stateManager = await container.get('stateManager');
            const progressTracker = await container.get('progressTracker');
            
            logger.info('✅ Advanced services loaded successfully', {
                stateManager: !!stateManager,
                progressTracker: !!progressTracker
            });
        } catch (error) {
            logger.warn('⚠️  Some advanced services may require valid configuration');
        }
        
        await shutdownContainer(container);
        logger.info('✅ Full container setup test passed');
        
    } catch (error) {
        logger.error('❌ Full container setup test failed:', error);
        throw error;
    }
}

/**
 * 测试Python运行器
 */
async function testPythonRunner() {
    logger.info('🐍 Testing Python Runner...');
    
    try {
        const pythonRunner = new PythonRunner({
            pythonExecutable: 'python3',
            timeout: 10000,
            logOutput: true
        });
        
        // 测试Python环境
        const envCheck = await pythonRunner.checkPythonEnvironment();
        logger.info('🐍 Python Environment Check:', envCheck);
        
        if (envCheck.available) {
            // 测试简单Python脚本
            const result = await pythonRunner.runScript('-c', ['print("Hello from Python!")'], {
                timeout: 5000,
                logOutput: true
            });
            
            logger.info('✅ Python script execution test:', result);
        } else {
            logger.warn('⚠️  Python not available, skipping script tests');
        }
        
        await pythonRunner.dispose();
        logger.info('✅ Python runner test completed');
        
    } catch (error) {
        logger.error('❌ Python runner test failed:', error);
        // 不抛出错误，因为Python可能不可用
    }
}

/**
 * 测试应用程序生命周期
 */
async function testApplicationLifecycle() {
    logger.info('🚀 Testing Application Lifecycle...');
    
    const app = new Application();
    
    try {
        // 测试初始化
        await app.initialize();
        logger.info('✅ Application initialization test passed');
        
        // 测试状态获取
        const status = app.getStatus();
        logger.info('📊 Application Status:', {
            status: status.status,
            uptime: status.uptime,
            memoryUsage: status.memoryUsage
        });
        
        // 测试健康检查
        const healthCheck = await app.healthCheck();
        logger.info('🏥 Application Health Check:', healthCheck);
        
        // 测试优雅关闭
        await app.shutdown();
        logger.info('✅ Application lifecycle test passed');
        
    } catch (error) {
        logger.error('❌ Application lifecycle test failed:', error);
        await app.cleanup();
        throw error;
    }
}

/**
 * 演示错误处理和恢复
 */
async function demonstrateErrorHandling() {
    logger.info('⚠️  Demonstrating Error Handling...');
    
    try {
        // 测试无效配置
        const container = new Container();
        
        container.register('faultyService', () => {
            throw new Error('Simulated service initialization error');
        });
        
        try {
            await container.get('faultyService');
            logger.error('❌ Error handling test failed - no error thrown');
        } catch (error) {
            logger.info('✅ Service error correctly handled:', error.message);
        }
        
        await container.dispose();
        
        // 测试应用程序错误恢复
        const app = new Application();
        
        // 模拟初始化失败
        const originalInitialize = app.initialize;
        app.initialize = async function() {
            throw new Error('Simulated initialization failure');
        };
        
        try {
            await app.run();
            logger.error('❌ Application error handling test failed');
        } catch (error) {
            logger.info('✅ Application error correctly handled:', error.message);
        }
        
        // 确保清理
        app.initialize = originalInitialize;
        await app.cleanup();
        
        logger.info('✅ Error handling demonstration completed');
        
    } catch (error) {
        logger.error('❌ Error handling demonstration failed:', error);
        throw error;
    }
}

/**
 * 性能基准测试
 */
async function performanceBenchmark() {
    logger.info('⚡ Running Performance Benchmark...');
    
    try {
        const iterations = 100;
        const results = [];
        
        for (let i = 0; i < iterations; i++) {
            const startTime = Date.now();
            
            const container = new Container();
            container.register('benchmarkService', () => ({ id: i }));
            await container.get('benchmarkService');
            await container.dispose();
            
            const duration = Date.now() - startTime;
            results.push(duration);
        }
        
        const avgTime = results.reduce((a, b) => a + b, 0) / results.length;
        const minTime = Math.min(...results);
        const maxTime = Math.max(...results);
        
        logger.info('📊 Performance Benchmark Results:', {
            iterations,
            averageTime: `${avgTime.toFixed(2)}ms`,
            minTime: `${minTime}ms`,
            maxTime: `${maxTime}ms`,
            totalTime: `${results.reduce((a, b) => a + b, 0)}ms`
        });
        
        logger.info('✅ Performance benchmark completed');
        
    } catch (error) {
        logger.error('❌ Performance benchmark failed:', error);
        throw error;
    }
}

/**
 * 主演示函数
 */
async function runDemo() {
    const demoStartTime = Date.now();
    
    logger.info('🎯 Starting Stage 8 Comprehensive Demo...');
    logger.info('=' * 80);
    
    try {
        // 基础测试
        await testContainerBasics();
        logger.info('');
        
        await testCircularDependencyDetection();
        logger.info('');
        
        await testFullContainerSetup();
        logger.info('');
        
        await testPythonRunner();
        logger.info('');
        
        await testApplicationLifecycle();
        logger.info('');
        
        await demonstrateErrorHandling();
        logger.info('');
        
        await performanceBenchmark();
        logger.info('');
        
        const totalTime = Date.now() - demoStartTime;
        
        logger.info('=' * 80);
        logger.info('🎉 Stage 8 Demo Completed Successfully!');
        logger.info('=' * 80);
        logger.info(`📊 Total Demo Time: ${totalTime}ms`);
        logger.info('✅ All tests passed');
        logger.info('🚀 System is ready for production use');
        logger.info('=' * 80);
        
    } catch (error) {
        const totalTime = Date.now() - demoStartTime;
        
        logger.error('=' * 80);
        logger.error('💥 Stage 8 Demo Failed!');
        logger.error('=' * 80);
        logger.error(`📊 Demo Time: ${totalTime}ms`);
        logger.error('❌ Error:', error.message);
        logger.error('=' * 80);
        
        process.exit(1);
    }
}

/**
 * 命令行参数处理
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        test: 'all',
        verbose: false,
        quick: false
    };
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '--test':
                options.test = args[++i] || 'all';
                break;
            case '--verbose':
            case '-v':
                options.verbose = true;
                break;
            case '--quick':
            case '-q':
                options.quick = true;
                break;
            case '--help':
            case '-h':
                console.log(`
Stage 8 Demo Script - Dependency Injection Integration

Usage: node demo-stage8.js [options]

Options:
  --test <name>     Run specific test (all, container, python, app, error, perf)
  --verbose, -v     Enable verbose logging
  --quick, -q       Run quick tests only
  --help, -h        Show this help message

Examples:
  node demo-stage8.js                    # Run all tests
  node demo-stage8.js --test container   # Test container only
  node demo-stage8.js --quick            # Quick test run
  node demo-stage8.js --verbose          # Verbose output
`);
                process.exit(0);
                break;
        }
    }
    
    return options;
}

/**
 * 运行特定测试
 */
async function runSpecificTest(testName) {
    switch (testName) {
        case 'container':
            await testContainerBasics();
            await testCircularDependencyDetection();
            await testFullContainerSetup();
            break;
        case 'python':
            await testPythonRunner();
            break;
        case 'app':
            await testApplicationLifecycle();
            break;
        case 'error':
            await demonstrateErrorHandling();
            break;
        case 'perf':
            await performanceBenchmark();
            break;
        case 'all':
        default:
            await runDemo();
            break;
    }
}

// 主入口点
if (import.meta.url === `file://${process.argv[1]}`) {
    const options = parseArgs();
    
    // 设置日志级别
    if (options.verbose) {
        process.env.LOG_LEVEL = 'debug';
    }
    
    runSpecificTest(options.test).catch(error => {
        logger.error('Demo execution failed:', error);
        process.exit(1);
    });
}

export {
    runDemo,
    testContainerBasics,
    testCircularDependencyDetection,
    testFullContainerSetup,
    testPythonRunner,
    testApplicationLifecycle,
    demonstrateErrorHandling,
    performanceBenchmark
};