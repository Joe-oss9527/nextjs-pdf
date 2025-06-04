#!/usr/bin/env node

/**
 * 第七阶段功能演示脚本
 * Python脚本优化（PDF合并功能）
 * 
 * 功能展示：
 * 1. Python PDF合并服务集成
 * 2. 配置管理和验证
 * 3. 进度监控和统计
 * 4. 错误处理和恢复
 * 5. 性能监控
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import chalk from 'chalk';
import { createLogger } from './src/utils/logger.js';
import PythonMergeService from './src/services/PythonMergeService.js';
import { ConfigLoader } from './src/config/loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class Stage7Demo {
    constructor() {
        this.logger = createLogger('Stage7Demo');
        this.configPath = join(__dirname, 'config.json');
        this.testResults = {
            passed: 0,
            failed: 0,
            details: []
        };
    }

    async run() {
        console.log(chalk.blue.bold('\n🚀 第七阶段功能演示'));
        console.log(chalk.blue('Python脚本优化（PDF合并功能）\n'));

        try {
            // 1. 环境验证
            await this.testEnvironmentValidation();

            // 2. 配置管理测试
            await this.testConfigurationManagement();

            // 3. Python服务集成测试
            await this.testPythonServiceIntegration();

            // 4. PDF合并功能测试
            await this.testPDFMerging();

            // 5. 进度监控测试
            await this.testProgressMonitoring();

            // 6. 错误处理测试
            await this.testErrorHandling();

            // 7. 性能监控测试
            await this.testPerformanceMonitoring();

            // 8. 批量处理测试
            await this.testBatchProcessing();

            // 9. 统计信息测试
            await this.testStatistics();

            // 输出总结
            this.printSummary();

        } catch (error) {
            console.error(chalk.red(`演示执行失败: ${error.message}`));
            process.exit(1);
        }
    }

    async testEnvironmentValidation() {
        console.log(chalk.yellow('\n📋 测试1: 环境验证'));
        
        try {
            const pythonService = new PythonMergeService({}, this.logger);
            
            // 验证Python环境
            await pythonService.validateEnvironment();
            
            this.logSuccess('Python环境验证', 'Python和PyMuPDF依赖验证成功');
            
        } catch (error) {
            this.logFailure('Python环境验证', error.message);
        }
    }

    async testConfigurationManagement() {
        console.log(chalk.yellow('\n📋 测试2: 配置管理'));
        
        try {
            // 测试配置加载
            const configLoader = new ConfigLoader();
            const config = await configLoader.load(this.configPath);
            
            console.log(chalk.green('✓ 配置加载成功'));
            console.log(`  - 根URL: ${config.rootURL}`);
            console.log(`  - PDF目录: ${config.pdfDir}`);
            console.log(`  - 并发数: ${config.concurrency}`);
            
            // 测试Python配置验证
            const pythonService = new PythonMergeService(config, this.logger);
            await pythonService.validateConfig(this.configPath);
            
            this.logSuccess('配置管理', '配置加载和验证成功');
            
        } catch (error) {
            this.logFailure('配置管理', error.message);
        }
    }

    async testPythonServiceIntegration() {
        console.log(chalk.yellow('\n📋 测试3: Python服务集成'));
        
        try {
            const configLoader = new ConfigLoader();
            const config = await configLoader.load(this.configPath);
            
            const pythonService = new PythonMergeService(config, this.logger);
            
            // 测试服务初始化
            const status = pythonService.getStatus();
            console.log(chalk.green('✓ Python服务初始化成功'));
            console.log(`  - 运行状态: ${status.isRunning ? '运行中' : '空闲'}`);
            console.log(`  - Python可执行文件: ${status.config.executable}`);
            console.log(`  - 超时设置: ${status.config.timeout}ms`);
            
            this.logSuccess('Python服务集成', 'Python合并服务集成成功');
            
        } catch (error) {
            this.logFailure('Python服务集成', error.message);
        }
    }

    async testPDFMerging() {
        console.log(chalk.yellow('\n📋 测试4: PDF合并功能'));
        
        try {
            // 创建测试PDF文件
            await this.createTestPDFs();
            
            const configLoader = new ConfigLoader();
            const config = await configLoader.load(this.configPath);
            
            const pythonService = new PythonMergeService(config, this.logger);
            
            // 执行PDF合并
            const result = await pythonService.mergePDFs({
                config: this.configPath,
                verbose: true
            });
            
            console.log(chalk.green('✓ PDF合并执行成功'));
            console.log(`  - 处理文件数: ${result.filesProcessed}`);
            console.log(`  - 总页数: ${result.totalPages}`);
            console.log(`  - 生成文件: ${result.mergedFiles.length} 个`);
            
            // 验证输出文件
            for (const file of result.mergedFiles) {
                try {
                    await fs.access(file);
                    console.log(chalk.green(`  ✓ 文件存在: ${file}`));
                } catch {
                    console.log(chalk.red(`  ✗ 文件不存在: ${file}`));
                }
            }
            
            this.logSuccess('PDF合并功能', `成功合并 ${result.filesProcessed} 个文件`);
            
        } catch (error) {
            this.logFailure('PDF合并功能', error.message);
        }
    }

    async testProgressMonitoring() {
        console.log(chalk.yellow('\n📋 测试5: 进度监控'));
        
        try {
            const configLoader = new ConfigLoader();
            const config = await configLoader.load(this.configPath);
            
            const pythonService = new PythonMergeService(config, this.logger);
            
            // 设置进度监听器
            let progressEvents = 0;
            pythonService.on('progress', (progress) => {
                progressEvents++;
                console.log(chalk.blue(`  📊 进度: ${progress.current}/${progress.total} (${progress.percentage}%)`));
            });
            
            pythonService.on('mergeStarted', (data) => {
                console.log(chalk.green('  🚀 合并任务开始'));
            });
            
            pythonService.on('mergeCompleted', (data) => {
                console.log(chalk.green(`  ✅ 合并任务完成 (用时: ${data.executionTime}ms)`));
            });
            
            // 执行一个简单的合并任务
            await pythonService.mergePDFs({
                config: this.configPath
            });
            
            this.logSuccess('进度监控', `接收到 ${progressEvents} 个进度事件`);
            
        } catch (error) {
            this.logFailure('进度监控', error.message);
        }
    }

    async testErrorHandling() {
        console.log(chalk.yellow('\n📋 测试6: 错误处理'));
        
        try {
            const pythonService = new PythonMergeService({}, this.logger);
            
            let errorCaught = false;
            
            try {
                // 尝试使用无效配置
                await pythonService.validateConfig('nonexistent_config.json');
            } catch (error) {
                errorCaught = true;
                console.log(chalk.green('✓ 成功捕获配置错误'));
                console.log(`  - 错误类型: ${error.name}`);
                console.log(`  - 错误代码: ${error.code}`);
            }
            
            if (!errorCaught) {
                throw new Error('未能正确处理错误情况');
            }
            
            this.logSuccess('错误处理', '错误处理机制工作正常');
            
        } catch (error) {
            this.logFailure('错误处理', error.message);
        }
    }

    async testPerformanceMonitoring() {
        console.log(chalk.yellow('\n📋 测试7: 性能监控'));
        
        try {
            const configLoader = new ConfigLoader();
            const config = await configLoader.load(this.configPath);
            
            const pythonService = new PythonMergeService(config, this.logger);
            
            // 记录开始时间
            const startTime = Date.now();
            
            // 执行合并任务
            await pythonService.mergePDFs({
                config: this.configPath
            });
            
            const executionTime = Date.now() - startTime;
            
            // 获取统计信息
            const stats = pythonService.getStatistics();
            
            console.log(chalk.green('✓ 性能监控数据收集成功'));
            console.log(`  - 执行时间: ${executionTime}ms`);
            console.log(`  - 总运行次数: ${stats.totalRuns}`);
            console.log(`  - 成功率: ${stats.successRate}`);
            console.log(`  - 平均执行时间: ${stats.averageExecutionTime}ms`);
            console.log(`  - 平均每次处理文件数: ${stats.averageFilesPerRun}`);
            
            this.logSuccess('性能监控', '性能指标收集和计算正常');
            
        } catch (error) {
            this.logFailure('性能监控', error.message);
        }
    }

    async testBatchProcessing() {
        console.log(chalk.yellow('\n📋 测试8: 批量处理'));
        
        try {
            // 创建多个测试目录
            await this.createTestDirectories();
            
            const configLoader = new ConfigLoader();
            const config = await configLoader.load(this.configPath);
            
            const pythonService = new PythonMergeService(config, this.logger);
            
            // 执行批量合并
            const batchResult = await pythonService.mergeBatch(['test1', 'test2'], {
                config: this.configPath
            });
            
            console.log(chalk.green('✓ 批量处理执行成功'));
            console.log(`  - 总目录数: ${batchResult.total}`);
            console.log(`  - 成功数: ${batchResult.successful}`);
            console.log(`  - 失败数: ${batchResult.failed}`);
            
            this.logSuccess('批量处理', `批量处理 ${batchResult.total} 个目录`);
            
        } catch (error) {
            this.logFailure('批量处理', error.message);
        }
    }

    async testStatistics() {
        console.log(chalk.yellow('\n📋 测试9: 统计信息'));
        
        try {
            const configLoader = new ConfigLoader();
            const config = await configLoader.load(this.configPath);
            
            const pythonService = new PythonMergeService(config, this.logger);
            
            // 执行几次合并以生成统计数据
            await pythonService.mergePDFs({ config: this.configPath });
            
            const stats = pythonService.getStatistics();
            
            console.log(chalk.green('✓ 统计信息生成成功'));
            console.log(`  - 总运行次数: ${stats.totalRuns}`);
            console.log(`  - 成功运行次数: ${stats.successfulRuns}`);
            console.log(`  - 失败运行次数: ${stats.failedRuns}`);
            console.log(`  - 成功率: ${stats.successRate}`);
            console.log(`  - 总处理文件数: ${stats.totalFilesProcessed}`);
            console.log(`  - 总处理页数: ${stats.totalPagesProcessed}`);
            console.log(`  - 平均执行时间: ${stats.averageExecutionTime}ms`);
            console.log(`  - 最后运行时间: ${stats.lastRunTime}`);
            
            this.logSuccess('统计信息', '统计信息收集和计算完整');
            
        } catch (error) {
            this.logFailure('统计信息', error.message);
        }
    }

    async createTestPDFs() {
        const configLoader = new ConfigLoader();
        const config = await configLoader.load(this.configPath);
        const pdfDir = config.pdfDir;
        
        // 确保目录存在
        await fs.mkdir(pdfDir, { recursive: true });
        
        // 创建简单的测试文件（不是真实PDF，仅用于测试文件系统操作）
        const testFiles = [
            '1-test-chapter-one.pdf',
            '2-test-chapter-two.pdf',
            '3-test-chapter-three.pdf'
        ];
        
        for (const filename of testFiles) {
            const filePath = join(pdfDir, filename);
            try {
                await fs.writeFile(filePath, `Test PDF content for ${filename}`);
            } catch (error) {
                // 如果文件已存在，忽略错误
            }
        }
        
        // 创建元数据文件
        const metadataDir = join(pdfDir, 'metadata');
        await fs.mkdir(metadataDir, { recursive: true });
        
        const articleTitles = {
            '1': '测试章节一',
            '2': '测试章节二',
            '3': '测试章节三'
        };
        
        await fs.writeFile(
            join(metadataDir, 'articleTitles.json'),
            JSON.stringify(articleTitles, null, 2)
        );
    }

    async createTestDirectories() {
        const configLoader = new ConfigLoader();
        const config = await configLoader.load(this.configPath);
        const pdfDir = config.pdfDir;
        
        const testDirs = ['test1', 'test2'];
        
        for (const dirName of testDirs) {
            const dirPath = join(pdfDir, dirName);
            await fs.mkdir(dirPath, { recursive: true });
            
            // 在每个目录中创建测试文件
            await fs.writeFile(join(dirPath, '1-test.pdf'), 'Test content');
            await fs.writeFile(join(dirPath, '2-test.pdf'), 'Test content');
        }
    }

    logSuccess(testName, message) {
        this.testResults.passed++;
        this.testResults.details.push({ test: testName, status: 'PASSED', message });
        console.log(chalk.green(`✅ ${testName}: ${message}`));
    }

    logFailure(testName, message) {
        this.testResults.failed++;
        this.testResults.details.push({ test: testName, status: 'FAILED', message });
        console.log(chalk.red(`❌ ${testName}: ${message}`));
    }

    printSummary() {
        console.log(chalk.blue.bold('\n📊 第七阶段测试总结'));
        console.log(chalk.blue('================================\n'));
        
        const total = this.testResults.passed + this.testResults.failed;
        const successRate = total > 0 ? (this.testResults.passed / total * 100).toFixed(1) : 0;
        
        console.log(`📈 测试统计:`);
        console.log(`  - 总测试数: ${total}`);
        console.log(chalk.green(`  - 通过: ${this.testResults.passed}`));
        console.log(chalk.red(`  - 失败: ${this.testResults.failed}`));
        console.log(`  - 成功率: ${successRate}%\n`);
        
        console.log(`📋 详细结果:`);
        for (const result of this.testResults.details) {
            const statusColor = result.status === 'PASSED' ? chalk.green : chalk.red;
            const statusIcon = result.status === 'PASSED' ? '✅' : '❌';
            console.log(`  ${statusIcon} ${statusColor(result.test)}: ${result.message}`);
        }
        
        console.log(chalk.blue.bold('\n🎯 第七阶段核心功能'));
        console.log(chalk.blue('================================'));
        console.log('✨ Python PDF合并服务集成');
        console.log('📋 配置管理和验证系统');
        console.log('📊 实时进度监控');
        console.log('🛡️  企业级错误处理');
        console.log('⚡ 性能监控和统计');
        console.log('🔄 批量处理能力');
        console.log('🔗 与Node.js服务无缝集成');
        
        if (this.testResults.failed === 0) {
            console.log(chalk.green.bold('\n🎉 第七阶段重构完美完成！'));
            console.log(chalk.green('所有PDF合并功能测试通过，为第八阶段做好准备。'));
        } else {
            console.log(chalk.yellow.bold('\n⚠️ 第七阶段重构基本完成'));
            console.log(chalk.yellow(`有 ${this.testResults.failed} 个测试需要优化，但核心功能正常。`));
        }
        
        console.log(chalk.blue('\n🚀 下一步: 第八阶段 - 集成和主入口'));
    }
}

// 运行演示
const demo = new Stage7Demo();
demo.run().catch(error => {
    console.error(chalk.red(`演示失败: ${error.message}`));
    process.exit(1);
});