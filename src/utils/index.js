// src/utils/index.js
const crypto = require('crypto');

/**
 * 延迟执行
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise}
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 检查URL是否应该被忽略
 * @param {string} url - 要检查的URL
 * @param {string[]} ignorePatterns - 忽略模式数组
 * @returns {boolean}
 */
const isIgnored = (url, ignorePatterns) => {
  if (!url || !Array.isArray(ignorePatterns)) {
    return false;
  }
  return ignorePatterns.some(pattern => url.includes(pattern));
};

/**
 * 规范化URL（去除尾部斜杠、排序查询参数、移除hash）
 * @param {string} url - 原始URL
 * @returns {string} - 规范化后的URL
 */
const normalizeUrl = (url) => {
  try {
    const urlObj = new URL(url);
    // 移除尾部斜杠
    urlObj.pathname = urlObj.pathname.replace(/\/$/, '') || '/';
    // 排序查询参数
    urlObj.searchParams.sort();
    // 移除hash
    urlObj.hash = '';
    return urlObj.toString();
  } catch (error) {
    console.warn(`Failed to normalize URL: ${url}`, error.message);
    return url;
  }
};

/**
 * 验证URL是否属于允许的域名
 * @param {string} url - 要验证的URL
 * @param {string} allowedDomain - 允许的域名
 * @returns {boolean}
 */
const isAllowedDomain = (url, allowedDomain) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname === allowedDomain;
  } catch {
    return false;
  }
};

/**
 * 生成URL的哈希值（用于文件名）
 * @param {string} url - URL
 * @returns {string} - 8位哈希值
 */
const getUrlHash = (url) => {
  return crypto.createHash('md5').update(normalizeUrl(url)).digest('hex').substring(0, 8);
};

/**
 * 从URL中提取有意义的文件名
 * @param {string} url - URL
 * @returns {string} - 文件名
 */
const extractFileName = (url) => {
  try {
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split('/').filter(s => s);
    return pathSegments[pathSegments.length - 1] || 'index';
  } catch {
    return 'index';
  }
};

/**
 * 重试函数包装器
 * @param {Function} fn - 要执行的异步函数
 * @param {number} maxRetries - 最大重试次数
 * @param {number} retryDelay - 重试延迟（毫秒）
 * @param {Function} onRetry - 重试时的回调函数
 * @returns {Function}
 */
const withRetry = (fn, maxRetries = 3, retryDelay = 1000, onRetry = null) => {
  return async (...args) => {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          if (onRetry) {
            onRetry(error, attempt + 1, maxRetries);
          }
          await delay(retryDelay * Math.pow(2, attempt)); // 指数退避
        }
      }
    }
    
    throw lastError;
  };
};

/**
 * 批量处理数组
 * @param {Array} items - 要处理的项目数组
 * @param {number} batchSize - 批量大小
 * @param {Function} processor - 处理函数
 * @returns {Promise<Array>} - 处理结果数组
 */
const processBatch = async (items, batchSize, processor) => {
  const results = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  
  return results;
};

/**
 * 创建进度跟踪器
 * @param {number} total - 总数
 * @param {string} taskName - 任务名称
 * @returns {Object} - 进度跟踪器对象
 */
const createProgressTracker = (total, taskName = 'Task') => {
  const startTime = Date.now();
  let completed = 0;
  let failed = 0;
  
  return {
    success: () => {
      completed++;
      logProgress();
    },
    
    failure: () => {
      failed++;
      logProgress();
    },
    
    getStats: () => ({
      total,
      completed,
      failed,
      remaining: total - completed - failed,
      successRate: completed / (completed + failed) || 0,
      elapsedTime: Date.now() - startTime
    })
  };
  
  function logProgress() {
    const processed = completed + failed;
    const percentage = (processed / total * 100).toFixed(2);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed;
    const eta = (total - processed) / rate;
    
    console.log(`[${taskName}] Progress: ${percentage}% (${processed}/${total})`);
    console.log(`├─ Success: ${completed}, Failed: ${failed}`);
    console.log(`├─ Rate: ${rate.toFixed(2)} items/sec`);
    console.log(`└─ ETA: ${Math.round(eta)} seconds`);
  }
};

module.exports = {
  delay,
  isIgnored,
  normalizeUrl,
  isAllowedDomain,
  getUrlHash,
  extractFileName,
  withRetry,
  processBatch,
  createProgressTracker
};