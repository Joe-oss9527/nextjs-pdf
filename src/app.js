import {
  createContainer,
  createDevContainer,
  createProductionContainer,
  shutdownContainer,
  monitorContainer
} from "./core/setup.js";
import PythonRunner from "./core/pythonRunner.js";
import { createLogger } from "./utils/logger.js";

/**
 * 主应用程序类 - 增强版本
 * 提供完整的应用程序生命周期管理，集成企业级服务注册系统
 */
class Application {
  constructor(options = {}) {
    // 🆕 环境检测
    this.environment = options.environment || process.env.NODE_ENV || 'production';
    
    this.container = null;
    this.logger = createLogger("Application");
    this.pythonRunner = null;
    this.isShuttingDown = false;
    this.startTime = null;
    
    // 🆕 监控相关
    this.containerMonitor = null;
    this.healthCheckInterval = null;
    this.performanceMetrics = {
      initializationTime: 0,
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0
    };

    // 绑定信号处理
    this.setupSignalHandlers();
  }

  /**
   * 设置信号处理器，实现优雅关闭
   */
  setupSignalHandlers() {
    const signals = ["SIGINT", "SIGTERM", "SIGQUIT"];

    signals.forEach((signal) => {
      process.on(signal, async () => {
        this.logger.info(`Received ${signal}, initiating graceful shutdown...`);
        await this.shutdown();
        process.exit(0);
      });
    });

    // 处理未捕获的异常
    process.on("uncaughtException", async (error) => {
      this.logger.error("Uncaught exception:", error);
      
      // 🆕 记录容器诊断信息
      if (this.container) {
        try {
          const diagnosis = this.container.analyzeContainerState();
          this.logger.error("Container state at crash:", diagnosis);
        } catch (diagError) {
          this.logger.error("Failed to get container diagnosis:", diagError);
        }
      }
      
      await this.shutdown();
      process.exit(1);
    });

    // 处理未处理的Promise拒绝
    process.on("unhandledRejection", async (reason, promise) => {
      this.logger.error("Unhandled promise rejection:", { reason, promise });
      
      // 🆕 检查是否是容器相关的错误
      if (this.container && reason?.phase) {
        this.logger.error("Container registration error detected:", {
          phase: reason.phase,
          report: reason.report
        });
      }
      
      await this.shutdown();
      process.exit(1);
    });
  }

  /**
   * 初始化应用程序 - 增强版本
   */
  async initialize() {
    
    try {
      this.startTime = Date.now();
      this.logger.info("🚀 Starting PDF Scraper Application...", {
        environment: this.environment,
        nodeVersion: process.version,
        platform: process.platform
      });

      // 🆕 1. 根据环境创建适当的容器
      this.logger.info("📦 Setting up enterprise-grade dependency injection container...");
      this.container = await this._createEnvironmentContainer();

      // 🆕 2. 启动容器监控
      if (this.environment === 'production') {
        this._startContainerMonitoring();
      }

      // 🆕 3. 执行容器健康检查
      await this._performInitialHealthCheck();

      // 4. 获取配置和服务
      const config = await this.container.get("config");
      const appLogger = await this.container.get("logger");

      // 🆕 5. 记录容器状态
      const containerAnalysis = this.container.analyzeContainerState();
      this.logger.info("📊 Container initialization analysis:", {
        totalServices: containerAnalysis.overall.totalServices,
        healthyServices: containerAnalysis.overall.healthyServices,
        performance: containerAnalysis.performance
      });

      // 6. 初始化Python运行器
      this.pythonRunner = new PythonRunner(config, appLogger);

      // 7. 检查Python环境（可选）
      this.logger.info("🐍 Checking Python environment...");
      const pythonCheck = await this.pythonRunner.checkPythonEnvironment();
      if (!pythonCheck.available) {
        this.logger.warn(
          "⚠️ Python environment not available:",
          pythonCheck.error,
        );
        this.logger.warn("📄 PDF merge functionality will be limited");
      } else {
        this.logger.info("✅ Python environment ready:", pythonCheck.version);
      }

      // 🆕 8. 验证关键服务可用性
      await this._validateCriticalServices();

      // 9. 记录初始化完成
      const initTime = Date.now() - this.startTime;
      this.performanceMetrics.initializationTime = initTime;
      
      this.logger.info(
        `✅ Application initialized successfully in ${initTime}ms`,
        {
          environment: this.environment,
          containerServices: containerAnalysis.overall.totalServices,
          pythonAvailable: pythonCheck.available
        }
      );

    } catch (error) {
      this.logger.error("❌ Failed to initialize application:", error);
      
      // 🆕 增强错误诊断
      if (this.container) {
        try {
          const errorDiagnosis = this.container.analyzeContainerState();
          this.logger.error("Container state during initialization failure:", errorDiagnosis);
        } catch (diagError) {
          this.logger.error("Failed to diagnose container state:", diagError);
        }
      }
      
      await this.cleanup();
      throw error;
    }
  }

  /**
   * 🆕 根据环境创建容器
   * @private
   */
  async _createEnvironmentContainer() {
    const containerOptions = {
      verbose: this.environment === 'development',
      enableRetry: true,
      maxRetries: this.environment === 'production' ? 5 : 2
    };

    switch (this.environment) {
      case 'development':
        return createDevContainer(containerOptions);
      
      case 'production':
        return createProductionContainer(containerOptions);
      
      default:
        return createContainer({
          environment: this.environment,
          ...containerOptions
        });
    }
  }

  /**
   * 🆕 启动容器监控
   * @private
   */
  _startContainerMonitoring() {
    this.containerMonitor = monitorContainer(this.container, {
      interval: 60000, // 1分钟
      logger: this.logger
    });

    this.logger.info("📈 Container monitoring started");
  }

  /**
   * 🆕 执行初始健康检查
   * @private
   */
  async _performInitialHealthCheck() {
    try {
      const healthResults = await this.container.performHealthCheck();
      const healthyCount = Object.values(healthResults).filter(r => r.healthy).length;
      const totalCount = Object.keys(healthResults).length;

      if (healthyCount === totalCount) {
        this.logger.info(`🏥 All ${totalCount} services passed health check`);
      } else {
        this.logger.warn(`🏥 Health check: ${healthyCount}/${totalCount} services healthy`);
        
        // 记录不健康的服务
        Object.entries(healthResults)
          .filter(([, result]) => !result.healthy)
          .forEach(([name, result]) => {
            this.logger.warn(`❌ Service ${name} failed health check:`, result.error);
          });
      }

      // 🆕 在生产环境中启动定期健康检查
      if (this.environment === 'production') {
        this.container.startAutoHealthCheck(300000); // 5分钟间隔
      }

    } catch (error) {
      this.logger.error("❌ Initial health check failed:", error);
      throw error;
    }
  }

  /**
   * 🆕 验证关键服务
   * @private
   */
  async _validateCriticalServices() {
    const criticalServices = ['config', 'logger', 'fileService', 'scraper'];
    
    for (const serviceName of criticalServices) {
      try {
        await this.container.get(serviceName);
        this.logger.debug(`✓ Critical service validated: ${serviceName}`);
      } catch (error) {
        throw new Error(`Critical service '${serviceName}' is not available: ${error.message}`);
      }
    }

    this.logger.info(`✅ All ${criticalServices.length} critical services validated`);
  }

  /**
   * 运行爬虫任务 - 增强版本
   */
  async runScraping() {
    this.performanceMetrics.totalOperations++;
    
    try {
      this.logger.info("🕷️  Starting web scraping process...");
      const scrapeStartTime = Date.now();

      // 获取必要的服务
      const scraper = await this.container.get("scraper");
      const progressTracker = await this.container.get("progressTracker");
      const fileService = await this.container.get("fileService");
      const config = await this.container.get("config");

      // 清理和准备PDF目录
      this.logger.info("🧹 Preparing PDF directory...");
      await fileService.cleanDirectory(config.pdfDir);
      await fileService.ensureDirectory(config.pdfDir);

      // 启动进度跟踪
      progressTracker.start();

      // 执行爬虫任务
      await scraper.run();

      // 获取爬虫统计信息
      const stats = progressTracker.getStats();
      const scrapeTime = Date.now() - scrapeStartTime;

      this.performanceMetrics.successfulOperations++;

      this.logger.info("✅ Web scraping completed successfully", {
        duration: scrapeTime,
        stats,
        environment: this.environment
      });

      return {
        success: true,
        duration: scrapeTime,
        stats,
      };

    } catch (error) {
      this.performanceMetrics.failedOperations++;
      
      this.logger.error("❌ Web scraping failed:", error);
      
      // 🆕 在失败时记录容器状态
      try {
        const containerState = this.container.analyzeContainerState();
        this.logger.error("Container state during scraping failure:", {
          performance: containerState.performance,
          recommendations: containerState.recommendations
        });
      } catch (stateError) {
        this.logger.error("Failed to analyze container state:", stateError);
      }

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 运行Python PDF合并 - 增强版本
   */
  async runPythonMerge() {
    this.performanceMetrics.totalOperations++;
    
    try {
      this.logger.info("📄 Starting PDF merge process...");
      const mergeStartTime = Date.now();

      const pythonMergeService = await this.container.get("pythonMergeService");

      // 使用新的Python合并服务
      const result = await pythonMergeService.mergePDFs();

      const mergeTime = Date.now() - mergeStartTime;

      if (result.success) {
        this.performanceMetrics.successfulOperations++;
        
        this.logger.info("✅ PDF merge completed successfully", {
          duration: mergeTime,
          outputFile: result.outputFile,
          processedFiles: result.processedFiles,
        });
      } else {
        this.performanceMetrics.failedOperations++;
        this.logger.error("❌ PDF merge failed:", result.error);
      }

      return {
        ...result,
        duration: mergeTime,
      };

    } catch (error) {
      this.performanceMetrics.failedOperations++;
      this.logger.error("❌ PDF merge process failed:", error);
      
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 运行完整的应用程序流程 - 增强版本
   */
  async run() {
    try {
      await this.initialize();

      const totalStartTime = Date.now();
      this.logger.info(
        "🎯 Starting complete PDF scraping and merge workflow...",
        { environment: this.environment }
      );

      // 1. 执行网页爬虫
      const scrapeResult = await this.runScraping();
      if (!scrapeResult.success) {
        throw new Error(`Scraping failed: ${scrapeResult.error}`);
      }

      // 2. 执行PDF合并
      const mergeResult = await this.runPythonMerge();
      if (!mergeResult.success) {
        this.logger.error("PDF merge failed, but scraping was successful");
        // 不抛出错误，因为爬虫部分已经成功
      }

      const totalTime = Date.now() - totalStartTime;

      // 🆕 3. 获取最终的容器状态分析
      const finalContainerAnalysis = this.container.analyzeContainerState();

      // 生成最终报告
      const finalReport = {
        totalDuration: totalTime,
        scraping: scrapeResult,
        merge: mergeResult,
        performance: this.performanceMetrics,
        container: {
          analysis: finalContainerAnalysis,
          health: this.container.getHealth()
        },
        environment: this.environment,
        timestamp: new Date().toISOString(),
      };

      this.logger.info("🎉 Application workflow completed!", {
        totalDuration: totalTime,
        successRate: `${((this.performanceMetrics.successfulOperations / this.performanceMetrics.totalOperations) * 100).toFixed(1)}%`,
        environment: this.environment
      });

      return finalReport;

    } catch (error) {
      this.logger.error("💥 Application workflow failed:", error);
      
      // 🆕 记录失败时的详细诊断信息
      if (this.container) {
        try {
          const errorDiagnosis = this.container.analyzeContainerState();
          this.logger.error("Application failure diagnosis:", {
            containerState: errorDiagnosis,
            performance: this.performanceMetrics
          });
        } catch (diagError) {
          this.logger.error("Failed to generate failure diagnosis:", diagError);
        }
      }
      
      throw error;
    }
  }

  /**
   * 获取应用程序状态 - 增强版本
   */
  getStatus() {
    const uptime = this.startTime ? Date.now() - this.startTime : 0;
    const baseStatus = {
      status: this.isShuttingDown ? "shutting_down" : "running",
      uptime,
      startTime: this.startTime,
      environment: this.environment,
      performance: this.performanceMetrics,
      pythonProcesses: this.pythonRunner
        ? this.pythonRunner.getRunningProcesses()
        : [],
      memoryUsage: process.memoryUsage(),
      pid: process.pid,
    };

    // 🆕 添加容器状态信息
    if (this.container) {
      try {
        baseStatus.container = {
          health: this.container.getHealth(),
          analysis: this.container.analyzeContainerState(),
          metrics: this.container.getServiceMetrics()
        };
      } catch (error) {
        baseStatus.container = {
          error: error.message
        };
      }
    }

    return baseStatus;
  }

  /**
   * 清理资源 - 增强版本
   */
  async cleanup() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info("🧹 Starting application cleanup...");

    try {
      // 🆕 1. 停止监控
      if (this.containerMonitor) {
        this.containerMonitor.stop();
        this.containerMonitor = null;
      }

      // 2. 停止Python进程
      if (this.pythonRunner) {
        await this.pythonRunner.dispose();
        this.pythonRunner = null;
      }

      // 🆕 3. 记录最终统计信息
      if (this.container) {
        try {
          const finalStats = this.container.getStats();
          this.logger.info("📊 Final container statistics:", finalStats);
        } catch (error) {
          this.logger.warn("Failed to get final container stats:", error);
        }
      }

      // 4. 关闭容器和所有服务
      if (this.container) {
        await shutdownContainer(this.container);
        this.container = null;
      }

      this.logger.info("✅ Application cleanup completed", {
        totalOperations: this.performanceMetrics.totalOperations,
        successRate: this.performanceMetrics.totalOperations > 0 
          ? `${((this.performanceMetrics.successfulOperations / this.performanceMetrics.totalOperations) * 100).toFixed(1)}%`
          : 'N/A'
      });

    } catch (error) {
      this.logger.error("❌ Error during cleanup:", error);
    }
  }

  /**
   * 优雅关闭 - 增强版本
   */
  async shutdown() {
    if (this.isShuttingDown) {
      return;
    }

    const shutdownStartTime = Date.now();
    this.logger.info("🛑 Initiating graceful shutdown...");

    try {
      await this.cleanup();

      const shutdownTime = Date.now() - shutdownStartTime;
      this.logger.info(`✅ Graceful shutdown completed in ${shutdownTime}ms`);

    } catch (error) {
      this.logger.error("❌ Error during shutdown:", error);
    }
  }

  /**
   * 健康检查 - 增强版本
   */
  async healthCheck() {
    try {
      const status = this.getStatus();
      
      // 🆕 增强的健康检查
      const healthResult = {
        healthy: true,
        status: status.status,
        uptime: status.uptime,
        environment: this.environment,
        performance: this.performanceMetrics,
        timestamp: new Date().toISOString(),
      };

      // 检查Python环境
      const pythonCheck = this.pythonRunner
        ? await this.pythonRunner.checkPythonEnvironment()
        : null;
      
      healthResult.pythonEnvironment = pythonCheck;

      // 🆕 检查容器健康
      if (this.container) {
        try {
          const containerHealth = await this.container.performHealthCheck();
          const containerAnalysis = this.container.analyzeContainerState();
          
          healthResult.container = {
            health: containerHealth,
            analysis: containerAnalysis
          };

          // 如果有不健康的服务，整体健康状态为false
          const unhealthyServices = Object.values(containerHealth).filter(r => !r.healthy);
          if (unhealthyServices.length > 0) {
            healthResult.healthy = false;
            healthResult.issues = unhealthyServices.length;
          }

        } catch (error) {
          healthResult.healthy = false;
          healthResult.containerError = error.message;
        }
      }

      return healthResult;

    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * 🆕 获取性能报告
   */
  getPerformanceReport() {
    const status = this.getStatus();
    
    return {
      application: this.performanceMetrics,
      container: status.container?.analysis?.performance || {},
      system: {
        memory: process.memoryUsage(),
        uptime: status.uptime,
        environment: this.environment
      },
      recommendations: status.container?.analysis?.recommendations || [],
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 主入口函数 - 增强版本
 */
async function main() {
  // 🆕 从环境变量或命令行参数获取环境配置
  const environment = process.env.NODE_ENV || 
    (process.argv.includes('--dev') ? 'development' : 'production');
  
  const app = new Application({ environment });

  try {
    // 运行应用程序
    const result = await app.run();

    console.log("\n" + "=".repeat(60));
    console.log("🎉 APPLICATION COMPLETED SUCCESSFULLY");
    console.log("=".repeat(60));
    console.log(`🌍 Environment: ${environment}`);
    console.log(`📊 Total Duration: ${result.totalDuration}ms`);
    console.log(
      `🕷️  Scraping: ${result.scraping.success ? "✅ Success" : "❌ Failed"}`,
    );
    console.log(
      `📄 PDF Merge: ${result.merge.success ? "✅ Success" : "❌ Failed"}`,
    );
    
    // 🆕 显示性能信息
    if (result.performance) {
      console.log(`📈 Success Rate: ${((result.performance.successfulOperations / result.performance.totalOperations) * 100).toFixed(1)}%`);
    }
    
    // 🆕 显示容器信息
    if (result.container?.analysis) {
      console.log(`🏥 Container Services: ${result.container.analysis.overall.totalServices}`);
    }
    
    console.log("=".repeat(60));

    // 优雅关闭
    await app.shutdown();

    process.exit(0);
    
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("💥 APPLICATION FAILED");
    console.error("=".repeat(60));
    console.error(`🌍 Environment: ${environment}`);
    console.error("Error:", error.message);
    
    // 🆕 显示性能报告（如果可用）
    try {
      const performanceReport = app.getPerformanceReport();
      console.error("📊 Performance Report:", JSON.stringify(performanceReport, null, 2));
    } catch (reportError) {
      console.error("Failed to generate performance report:", reportError.message);
    }
    
    console.error("=".repeat(60));

    // 确保清理资源
    await app.cleanup();

    process.exit(1);
  }
}

// 导出应用程序类和主函数
export { Application, main };

// 如果直接运行此文件，执行主函数
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}