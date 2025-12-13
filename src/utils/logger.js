// src/utils/logger.js
import winston from 'winston';
import path from 'path';
import fs from 'fs/promises';

export const createLogger = (config = {}) => {
  const logDir = path.join(process.cwd(), 'logs');

  // 异步确保日志目录存在（不阻塞logger创建）
  fs.mkdir(logDir, { recursive: true }).catch((error) => {
    console.error('创建日志目录失败:', error);
  });

  const transports = [];

  // 只有在非测试环境或明确要求文件日志时才添加文件传输
  if (config.includeFileTransports !== false && process.env.NODE_ENV !== 'test') {
    transports.push(
      // 错误日志文件
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        maxsize: 10485760, // 10MB
        maxFiles: 5,
      }),
      // 完整日志文件
      new winston.transports.File({
        filename: path.join(logDir, 'combined.log'),
        maxsize: 10485760, // 10MB
        maxFiles: 5,
      })
    );
  }

  // 控制台输出（总是包含，除非明确禁用）
  if (config.transports?.includes('console') !== false) {
    const consoleFormat =
      config.format === 'simple'
        ? winston.format.combine(winston.format.colorize(), winston.format.simple())
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({
              format: 'HH:mm:ss',
            }),
            winston.format.printf(({ timestamp, level, message, ...rest }) => {
              const restString = Object.keys(rest).length
                ? '\n' + JSON.stringify(rest, null, 2)
                : '';
              return `${timestamp} [${level}]: ${message}${restString}`;
            })
          );

    transports.push(
      new winston.transports.Console({
        format: consoleFormat,
      })
    );
  }

  const logger = winston.createLogger({
    level: config.level || config.logLevel || 'info',
    format: winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss',
      }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service: 'pdf-scraper' },
    transports: transports,
  });

  // 添加便捷方法
  logger.logProgress = function (message, stats) {
    this.info(message, { type: 'progress', ...stats });
  };

  return logger;
};

// 异步版本的 createLogger，用于需要确保目录存在的场景
export const createLoggerAsync = async (config = {}) => {
  const logDir = path.join(process.cwd(), 'logs');

  // 确保日志目录存在
  try {
    await fs.mkdir(logDir, { recursive: true });
  } catch (error) {
    console.error('创建日志目录失败:', error);
  }

  return createLogger({ ...config, includeFileTransports: true });
};

// 创建一个简单的控制台日志器作为后备
export const consoleLogger = {
  debug: console.log,
  info: console.log,
  warn: console.warn,
  error: console.error,
  logProgress: (message, stats) => console.log(`[PROGRESS] ${message}`, stats),
};
