// src/utils/common.js
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Apply jitter to a delay value based on the specified strategy
 * Based on AWS/Netflix best practices for distributed systems
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {string} strategy - Jitter strategy: 'none', 'full', 'equal', 'decorrelated'
 * @param {number} prevDelay - Previous delay (used for decorrelated jitter)
 * @returns {number} Jittered delay value
 */
export const applyJitter = (baseDelay, strategy = 'decorrelated', prevDelay = null) => {
  switch (strategy) {
    case 'none':
      return baseDelay;

    case 'full':
      // Full jitter: random(0, delay)
      return Math.random() * baseDelay;

    case 'equal':
      // Equal jitter: delay/2 + random(0, delay/2)
      return baseDelay / 2 + (Math.random() * baseDelay) / 2;

    default:
    case 'decorrelated': {
      // Decorrelated jitter (AWS/Netflix recommended):
      // sleep = random_between(base, sleep * 3)
      // NOTE: The caller is responsible for applying any global cap (maxDelay)
      const prev = prevDelay || baseDelay;
      return Math.random() * (prev * 3 - baseDelay) + baseDelay;
    }
  }
};

/**
 * Retry a function with exponential backoff and jitter
 * Implements AWS best practices for resilient distributed systems
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxAttempts - Maximum retry attempts (default: 3)
 * @param {number} options.delay - Base delay in ms (default: 1000)
 * @param {number} options.backoff - Backoff multiplier (default: 2)
 * @param {number} options.maxDelay - Maximum delay cap in ms (default: 30000)
 * @param {string} options.jitterStrategy - Jitter strategy: 'none', 'full', 'equal', 'decorrelated' (default: 'decorrelated')
 * @param {Function} options.onRetry - Callback on retry: (attempt, error, waitTime) => void
 * @returns {Promise} Result of fn()
 */
export const retry = async (fn, options = {}) => {
  const {
    maxAttempts = 3,
    delay: delayMs = 1000,
    backoff = 2,
    maxDelay = 30000,
    jitterStrategy = 'decorrelated',
    onRetry,
  } = options;

  let lastError;
  let prevWaitTime = delayMs;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxAttempts - 1) {
        // Calculate base exponential delay
        const baseWait = delayMs * Math.pow(backoff, i);

        // Apply max delay cap before jitter
        const cappedWait = Math.min(baseWait, maxDelay);

        // Apply jitter strategy, then enforce the same global cap again to
        // guarantee we never exceed maxDelay even with decorrelated jitter
        const jitteredWait = applyJitter(cappedWait, jitterStrategy, prevWaitTime);
        const waitTime = Math.round(Math.min(jitteredWait, maxDelay));
        prevWaitTime = waitTime;

        // Callback for logging/monitoring
        if (onRetry) {
          onRetry(i + 1, error, waitTime);
        }

        await delay(waitTime);
      }
    }
  }
  throw lastError;
};

// 保留原有的isIgnored函数
export const isIgnored = (url, ignoreURLs) => {
  return ignoreURLs.some((ignored) => url.includes(ignored));
};

// 🆕 新增：创建带有进度回调的重试函数
export const retryWithProgress = async (fn, options = {}) => {
  const { maxAttempts = 3, delay: delayMs = 1000, backoff = 2, onProgress, onRetry } = options;

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
