// src/utils/errors.js
export class ScraperError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ScraperError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date();

    // 保持原型链
    Object.setPrototypeOf(this, ScraperError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

export class ValidationError extends ScraperError {
  constructor(message, details) {
    super(message, 'VALIDATION_ERROR', details);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NetworkError extends ScraperError {
  constructor(message, url, originalError) {
    super(message, 'NETWORK_ERROR', {
      url,
      originalError: originalError?.message || originalError
    });
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

export class FileOperationError extends ScraperError {
  constructor(message, filePath, operation) {
    super(message, 'FILE_ERROR', { filePath, operation });
    Object.setPrototypeOf(this, FileOperationError.prototype);
  }
}

export class BrowserError extends ScraperError {
  constructor(message, details) {
    super(message, 'BROWSER_ERROR', details);
    Object.setPrototypeOf(this, BrowserError.prototype);
  }
}

export class ImageLoadError extends ScraperError {
  constructor(message, url, details) {
    super(message, 'IMAGE_LOAD_ERROR', { url, ...details });
    Object.setPrototypeOf(this, ImageLoadError.prototype);
  }
}

// 错误分类枚举
export const ErrorCategory = {
  RETRYABLE_NETWORK: 'retryable_network',      // 可重试的网络错误
  RETRYABLE_TIMEOUT: 'retryable_timeout',      // 可重试的超时错误
  RETRYABLE_BROWSER: 'retryable_browser',      // 可重试的浏览器错误
  IGNORABLE_JS: 'ignorable_js',                // 可忽略的JS错误
  PERMANENT_HTTP: 'permanent_http',            // 永久性HTTP错误
  PERMANENT_VALIDATION: 'permanent_validation', // 永久性验证错误
  SYSTEM_ERROR: 'system_error',                // 系统级错误
  UNKNOWN: 'unknown'                           // 未知错误
};

// 错误处理工具函数
export const categorizeError = (error) => {
  const errorMessage = error.message || String(error);
  
  // Next.js和前端框架的可忽略错误
  if (errorMessage.includes('Invariant: attempted to hard navigate') ||
      errorMessage.includes('Navigation cancelled by a newer navigation') ||
      errorMessage.includes('ResizeObserver loop limit exceeded')) {
    return ErrorCategory.IGNORABLE_JS;
  }

  // 网络相关的可重试错误
  if (errorMessage.includes('ECONNRESET') ||
      errorMessage.includes('ETIMEDOUT') ||
      errorMessage.includes('ENOTFOUND') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('net::ERR_NETWORK_CHANGED') ||
      errorMessage.includes('net::ERR_INTERNET_DISCONNECTED')) {
    return ErrorCategory.RETRYABLE_NETWORK;
  }

  // 超时相关的可重试错误
  if (errorMessage.includes('Navigation timeout') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('Timeout')) {
    return ErrorCategory.RETRYABLE_TIMEOUT;
  }

  // 浏览器相关的可重试错误
  if (errorMessage.includes('获取浏览器超时') ||
      errorMessage.includes('页面创建失败') ||
      errorMessage.includes('Browser closed') ||
      errorMessage.includes('Target closed')) {
    return ErrorCategory.RETRYABLE_BROWSER;
  }

  // HTTP错误码
  if (errorMessage.includes('HTTP 5') || // 5xx服务器错误可重试
      errorMessage.includes('502') ||
      errorMessage.includes('503') ||
      errorMessage.includes('504')) {
    return ErrorCategory.RETRYABLE_NETWORK;
  }

  if (errorMessage.includes('HTTP 4') || // 4xx客户端错误通常不可重试
      errorMessage.includes('404') ||
      errorMessage.includes('403') ||
      errorMessage.includes('401')) {
    return ErrorCategory.PERMANENT_HTTP;
  }

  // 验证错误
  if (error instanceof ValidationError ||
      errorMessage.includes('页面内容未找到') ||
      errorMessage.includes('Invalid selector')) {
    return ErrorCategory.PERMANENT_VALIDATION;
  }

  // 系统级错误
  if (errorMessage.includes('ENOSPC') ||  // 磁盘空间不足
      errorMessage.includes('EMFILE') ||  // 文件描述符不足
      errorMessage.includes('ENOMEM')) {  // 内存不足
    return ErrorCategory.SYSTEM_ERROR;
  }

  return ErrorCategory.UNKNOWN;
};

export const isRetryableError = (error) => {
  const category = categorizeError(error);
  return [
    ErrorCategory.RETRYABLE_NETWORK,
    ErrorCategory.RETRYABLE_TIMEOUT,
    ErrorCategory.RETRYABLE_BROWSER
  ].includes(category);
};

export const isIgnorableError = (error) => {
  const category = categorizeError(error);
  return category === ErrorCategory.IGNORABLE_JS;
};

export const getRetryStrategy = (error) => {
  const category = categorizeError(error);
  
  switch (category) {
    case ErrorCategory.RETRYABLE_NETWORK:
      return {
        maxAttempts: 5,
        baseDelay: 2000,
        backoffMultiplier: 1.5,
        maxDelay: 30000
      };
    
    case ErrorCategory.RETRYABLE_TIMEOUT:
      return {
        maxAttempts: 3,
        baseDelay: 5000,
        backoffMultiplier: 2,
        maxDelay: 60000
      };
    
    case ErrorCategory.RETRYABLE_BROWSER:
      return {
        maxAttempts: 3,
        baseDelay: 10000,
        backoffMultiplier: 2,
        maxDelay: 60000
      };
    
    default:
      return {
        maxAttempts: 1,
        baseDelay: 0,
        backoffMultiplier: 1,
        maxDelay: 0
      };
  }
};

export const formatError = (error) => {
  if (error instanceof ScraperError) {
    return error.toJSON();
  }

  return {
    name: error.name || 'Error',
    message: error.message || String(error),
    stack: error.stack,
    timestamp: new Date()
  };
};
