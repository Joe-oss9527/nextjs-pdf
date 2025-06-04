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

// 错误处理工具函数
export const isRetryableError = (error) => {
  // 网络错误和临时性错误可以重试
  if (error instanceof NetworkError) {
    return true;
  }

  // 检查特定的错误消息
  const retryableMessages = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'Navigation timeout',
    'net::ERR_',
  ];

  const errorMessage = error.message || '';
  return retryableMessages.some(msg => errorMessage.includes(msg));
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
