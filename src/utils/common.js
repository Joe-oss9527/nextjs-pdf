// src/utils/common.js
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const retry = async (fn, options = {}) => {
  // 🔧 修复：重命名参数避免与 delay 函数冲突
  const { maxAttempts = 3, delay: delayMs = 1000, backoff = 2, onRetry } = options;
  let lastError;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxAttempts - 1) {
        // 🔧 修复：现在可以正确调用 delay 函数
        const waitTime = delayMs * Math.pow(backoff, i);

        // 如果提供了重试回调，调用它
        if (onRetry) {
          onRetry(i + 1, error);
        }

        await delay(waitTime);
      }
    }
  }
  throw lastError;
};

// 保留原有的isIgnored函数
export const isIgnored = (url, ignoreURLs) => {
  return ignoreURLs.some(ignored => url.includes(ignored));
};

// 🆕 新增：创建带有进度回调的重试函数
export const retryWithProgress = async (fn, options = {}) => {
  const {
    maxAttempts = 3,
    delay: delayMs = 1000,
    backoff = 2,
    onProgress,
    onRetry
  } = options;

  let lastError;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      if (onProgress) {
        onProgress({ attempt: i + 1, maxAttempts });
      }

      return await fn();
    } catch (error) {
      lastError = error;

      if (i < maxAttempts - 1) {
        const waitTime = delayMs * Math.pow(backoff, i);

        if (onRetry) {
          onRetry(i + 1, error, waitTime);
        }

        await delay(waitTime);
      }
    }
  }

  throw lastError;
};

// 🆕 新增：批量延迟执行
export const batchDelay = async (tasks, delayBetween = 1000) => {
  const results = [];

  for (let i = 0; i < tasks.length; i++) {
    if (i > 0) {
      await delay(delayBetween);
    }

    try {
      const result = await tasks[i]();
      results.push({ success: true, result, index: i });
    } catch (error) {
      results.push({ success: false, error, index: i });
    }
  }

  return results;
};

// 🆕 新增：指数退避延迟
export const exponentialBackoff = (attempt, baseDelay = 1000, maxDelay = 30000) => {
  const delayMs = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  return delay(delayMs);
};

// 🆕 新增：随机抖动延迟（避免惊群效应）
export const jitteredDelay = (baseDelay, maxJitter = 0.1) => {
  const jitter = (Math.random() - 0.5) * 2 * maxJitter;
  const actualDelay = baseDelay * (1 + jitter);
  return delay(Math.max(0, actualDelay));
};
