/**
 * Python PDF合并服务集成类
 * 提供Node.js与Python PDF合并功能的桥接
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { createLogger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PythonMergeError extends Error {
    constructor(message, code = null, details = null) {
        super(message);
        this.name = 'PythonMergeError';
        this.code = code;
        this.details = details;
    }
}

export class PythonMergeService extends EventEmitter {
    /**
     * Python PDF合并服务类
     * 
     * 特性：
     * - 集成Python PDF合并功能
     * - 异步执行和进度监控
     * - 完整的错误处理和恢复
     * - 与Node.js服务架构无缝集成
     * - 支持配置驱动和环境变量
     */
    
    constructor(config = {}, logger = null) {
        super();
        
        this.config = config;
        this.logger = logger || createLogger('PythonMergeService');
        
        // Python脚本路径
        this.pythonScriptDir = path.join(__dirname, '..', 'python');
        this.mergerScript = path.join(this.pythonScriptDir, 'pdf_merger.py');
        this.configScript = path.join(this.pythonScriptDir, 'config_manager.py');
        
        // 运行时状态
        this.isRunning = false;
        this.currentProcess = null;
        this.statistics = {
            totalRuns: 0,
            successfulRuns: 0,
            failedRuns: 0,
            totalFilesProcessed: 0,
            totalPagesProcessed: 0,
            averageExecutionTime: 0,
            lastRunTime: null,
            errors: []
        };
        
        // Python环境配置
        this.pythonConfig = {
            executable: config.python?.executable || config.pythonExecutable || 'python3',
            timeout: config.python?.timeout || config.pythonTimeout || 300000, // 5分钟超时
            maxBuffer: config.maxBuffer || 1024 * 1024 * 10, // 10MB缓冲区
            encoding: 'utf-8'
        };
        
        this.logger.info('Python合并服务初始化完成');
    }

    /**
     * 验证Python环境和脚本
     */
    async validateEnvironment() {
        try {
            // 检查Python脚本是否存在
            await fs.access(this.mergerScript);
            await fs.access(this.configScript);
            
            // 检查Python可执行文件
            const result = await this._executePython(['-c', 'import sys; print(sys.version)']);
            this.logger.info(`Python环境验证成功: ${result.stdout.trim()}`);
            
            // 检查PyMuPDF依赖
            await this._executePython(['-c', 'import fitz; print("PyMuPDF version:", fitz.version)']);
            this.logger.info('PyMuPDF依赖验证成功');
            
            return true;
            
        } catch (error) {
            throw new PythonMergeError(
                `Python环境验证失败: ${error.message}`,
                'ENVIRONMENT_VALIDATION_FAILED',
                { error: error.message }
            );
        }
    }

    /**
     * 验证配置文件
     */
    async validateConfig(configPath = 'config.json') {
        try {
            const result = await this._executePython([
                this.configScript,
                configPath
            ]);
            
            if (result.exitCode !== 0) {
                throw new Error(result.stderr || '配置验证失败');
            }
            
            this.logger.info('配置文件验证成功');
            return true;
            
        } catch (error) {
            throw new PythonMergeError(
                `配置验证失败: ${error.message}`,
                'CONFIG_VALIDATION_FAILED',
                { configPath, error: error.message }
            );
        }
    }

    /**
     * 执行PDF合并
     */
    async mergePDFs(options = {}) {
        if (this.isRunning) {
            throw new PythonMergeError(
                'PDF合并任务正在运行中',
                'TASK_ALREADY_RUNNING'
            );
        }

        const startTime = Date.now();
        this.isRunning = true;
        this.statistics.totalRuns++;
        this.statistics.lastRunTime = new Date();

        try {
            this.emit('mergeStarted', { options, startTime });
            
            // 构建Python脚本参数
            const args = [this.mergerScript];
            
            if (options.config) {
                args.push('--config', options.config);
            }
            
            if (options.directory) {
                args.push('--directory', options.directory);
            }
            
            if (options.verbose) {
                args.push('--verbose');
            }

            this.logger.info(`开始PDF合并任务: ${args.join(' ')}`);
            
            // 执行Python脚本
            const result = await this._executePythonWithProgress(args);
            
            // 解析结果
            const mergeResult = this._parseResult(result);
            
            // 更新统计信息
            this._updateStatistics(mergeResult, Date.now() - startTime);
            
            this.emit('mergeCompleted', {
                success: true,
                result: mergeResult,
                executionTime: Date.now() - startTime
            });
            
            this.logger.info(`PDF合并任务完成: 处理 ${mergeResult.filesProcessed} 个文件`);
            
            return mergeResult;
            
        } catch (error) {
            this.statistics.failedRuns++;
            this.statistics.errors.push({
                timestamp: new Date(),
                error: error.message,
                options
            });
            
            this.emit('mergeError', {
                error: error.message,
                options,
                executionTime: Date.now() - startTime
            });
            
            this.logger.error(`PDF合并任务失败: ${error.message}`);
            throw error;
            
        } finally {
            this.isRunning = false;
            this.currentProcess = null;
        }
    }

    /**
     * 批量合并多个目录
     */
    async mergeBatch(directories = [], options = {}) {
        const results = [];
        const errors = [];
        
        this.emit('batchStarted', { directories, options });
        
        for (const directory of directories) {
            try {
                const result = await this.mergePDFs({
                    ...options,
                    directory
                });
                results.push({ directory, result, success: true });
                
            } catch (error) {
                errors.push({ directory, error: error.message, success: false });
            }
        }
        
        const batchResult = {
            total: directories.length,
            successful: results.length,
            failed: errors.length,
            results,
            errors
        };
        
        this.emit('batchCompleted', batchResult);
        
        return batchResult;
    }

    /**
     * 停止当前运行的合并任务
     */
    async stopMerge() {
        if (!this.isRunning || !this.currentProcess) {
            return false;
        }
        
        try {
            this.currentProcess.kill('SIGTERM');
            
            // 等待进程结束
            await new Promise((resolve) => {
                this.currentProcess.on('exit', resolve);
                // 5秒后强制结束
                setTimeout(() => {
                    if (this.currentProcess) {
                        this.currentProcess.kill('SIGKILL');
                    }
                    resolve();
                }, 5000);
            });
            
            this.emit('mergeStopped');
            this.logger.info('PDF合并任务已停止');
            
            return true;
            
        } catch (error) {
            this.logger.error(`停止PDF合并任务失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 获取运行状态
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            statistics: { ...this.statistics },
            config: this.pythonConfig
        };
    }

    /**
     * 获取详细统计信息
     */
    getStatistics() {
        return {
            ...this.statistics,
            successRate: this.statistics.totalRuns > 0 
                ? (this.statistics.successfulRuns / this.statistics.totalRuns * 100).toFixed(2) + '%'
                : '0%',
            averageFilesPerRun: this.statistics.successfulRuns > 0
                ? Math.round(this.statistics.totalFilesProcessed / this.statistics.successfulRuns)
                : 0,
            averagePagesPerRun: this.statistics.successfulRuns > 0
                ? Math.round(this.statistics.totalPagesProcessed / this.statistics.successfulRuns)
                : 0
        };
    }

    /**
     * 执行Python脚本
     */
    async _executePython(args) {
        return new Promise((resolve, reject) => {
            let settled = false;
            let timeoutHandle = null;

            const process = spawn(this.pythonConfig.executable, args, {
                encoding: this.pythonConfig.encoding,
                timeout: this.pythonConfig.timeout,
                maxBuffer: this.pythonConfig.maxBuffer
            });

            let stdout = '';
            let stderr = '';

            process.stdout?.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                if (!settled) {
                    settled = true;
                    if (timeoutHandle) {
                        clearTimeout(timeoutHandle);
                    }
                    resolve({
                        exitCode: code,
                        stdout: stdout.trim(),
                        stderr: stderr.trim()
                    });
                }
            });

            process.on('error', (error) => {
                if (!settled) {
                    settled = true;
                    if (timeoutHandle) {
                        clearTimeout(timeoutHandle);
                    }
                    reject(new PythonMergeError(
                        `Python进程执行失败: ${error.message}`,
                        'PYTHON_EXECUTION_FAILED',
                        { args, error: error.message }
                    ));
                }
            });

            // 处理超时
            timeoutHandle = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    if (!process.killed) {
                        process.kill('SIGTERM');
                    }
                    reject(new PythonMergeError(
                        'Python脚本执行超时',
                        'EXECUTION_TIMEOUT',
                        { args, timeout: this.pythonConfig.timeout }
                    ));
                }
            }, this.pythonConfig.timeout);
        });
    }

    /**
     * 执行Python脚本并监控进度
     */
    async _executePythonWithProgress(args) {
        return new Promise((resolve, reject) => {
            const process = spawn(this.pythonConfig.executable, args, {
                encoding: this.pythonConfig.encoding
            });

            this.currentProcess = process;
            let stdout = '';
            let stderr = '';

            process.stdout?.on('data', (data) => {
                const chunk = data.toString();
                stdout += chunk;
                
                // 解析进度信息
                this._parseProgress(chunk);
            });

            process.stderr?.on('data', (data) => {
                const chunk = data.toString();
                stderr += chunk;
                this.logger.debug(`Python stderr: ${chunk.trim()}`);
            });

            process.on('close', (code) => {
                this.currentProcess = null;
                
                if (code === 0) {
                    resolve({
                        exitCode: code,
                        stdout: stdout.trim(),
                        stderr: stderr.trim()
                    });
                } else {
                    reject(new PythonMergeError(
                        `Python脚本执行失败: 退出码 ${code}`,
                        'PYTHON_SCRIPT_FAILED',
                        { 
                            exitCode: code, 
                            stdout: stdout.trim(), 
                            stderr: stderr.trim(),
                            args 
                        }
                    ));
                }
            });

            process.on('error', (error) => {
                this.currentProcess = null;
                reject(new PythonMergeError(
                    `Python进程错误: ${error.message}`,
                    'PYTHON_PROCESS_ERROR',
                    { args, error: error.message }
                ));
            });
        });
    }

    /**
     * 解析进度信息
     */
    _parseProgress(output) {
        // 查找进度模式，例如: "Progress: 3/10 files processed"
        const progressMatch = output.match(/Progress:\s*(\d+)\/(\d+)\s*files?\s*processed/i);
        if (progressMatch) {
            const current = parseInt(progressMatch[1]);
            const total = parseInt(progressMatch[2]);
            
            this.emit('progress', {
                current,
                total,
                percentage: Math.round((current / total) * 100)
            });
        }
        
        // 查找统计信息
        const statsMatch = output.match(/统计信息:|Statistics:/i);
        if (statsMatch) {
            this.emit('statistics', { output });
        }
    }

    /**
     * 解析Python脚本结果
     */
    _parseResult(result) {
        try {
            // 尝试从输出中提取JSON结果
            const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            
            // 回退到解析文本输出
            const lines = result.stdout.split('\n');
            const mergedFiles = [];
            let filesProcessed = 0;
            let totalPages = 0;
            
            for (const line of lines) {
                if (line.includes('PDF saved as:') || line.includes('📄')) {
                    const fileMatch = line.match(/([^\s]+\.pdf)/);
                    if (fileMatch) {
                        mergedFiles.push(fileMatch[1]);
                    }
                }
                
                const fileCountMatch = line.match(/处理文件数:\s*(\d+)/);
                if (fileCountMatch) {
                    filesProcessed = parseInt(fileCountMatch[1]);
                }
                
                const pageCountMatch = line.match(/总页数:\s*(\d+)/);
                if (pageCountMatch) {
                    totalPages = parseInt(pageCountMatch[1]);
                }
            }
            
            return {
                success: result.exitCode === 0,
                mergedFiles,
                filesProcessed,
                totalPages,
                stdout: result.stdout,
                stderr: result.stderr
            };
            
        } catch (error) {
            this.logger.warning(`解析Python结果失败: ${error.message}`);
            return {
                success: result.exitCode === 0,
                mergedFiles: [],
                filesProcessed: 0,
                totalPages: 0,
                stdout: result.stdout,
                stderr: result.stderr
            };
        }
    }

    /**
     * 更新统计信息
     */
    _updateStatistics(result, executionTime) {
        if (result.success) {
            this.statistics.successfulRuns++;
            this.statistics.totalFilesProcessed += result.filesProcessed || 0;
            this.statistics.totalPagesProcessed += result.totalPages || 0;
            
            // 更新平均执行时间
            const totalTime = this.statistics.averageExecutionTime * (this.statistics.successfulRuns - 1) + executionTime;
            this.statistics.averageExecutionTime = Math.round(totalTime / this.statistics.successfulRuns);
        }
        
        // 保持错误历史在合理范围内
        if (this.statistics.errors.length > 10) {
            this.statistics.errors = this.statistics.errors.slice(-10);
        }
    }

    /**
     * 清理资源
     */
    async dispose() {
        if (this.isRunning) {
            await this.stopMerge();
        }
        
        this.removeAllListeners();
        this.logger.info('Python合并服务已清理');
    }
}

export default PythonMergeService;