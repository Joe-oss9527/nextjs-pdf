// src/utils/common.js
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const retry = async (fn, options = {}) => {
  const { maxAttempts = 3, delay = 1000, backoff = 2 } = options;
  let lastError;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxAttempts - 1) {
        await delay(delay * Math.pow(backoff, i));
      }
    }
  }
  throw lastError;
};

// 保留原有的isIgnored函数
export const isIgnored = (url, ignoreURLs) => {
  return ignoreURLs.some(ignored => url.includes(ignored));
};
