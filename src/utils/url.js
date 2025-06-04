// src/utils/url.js
import crypto from 'crypto';

export const normalizeUrl = (url) => {
  try {
    const urlObj = new URL(url);
    // 移除尾部斜杠
    urlObj.pathname = urlObj.pathname.replace(/\/$/, '');
    // 排序查询参数
    urlObj.searchParams.sort();
    // 移除hash
    urlObj.hash = '';
    return urlObj.toString();
  } catch {
    return url;
  }
};

export const getUrlHash = (url) => {
  return crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
};

export const validateUrl = (url, allowedDomains) => {
  try {
    const parsedUrl = new URL(url);
    return allowedDomains.includes(parsedUrl.hostname);
  } catch {
    return false;
  }
};

// 提取子文件夹（从原fileUtils.js迁移）
export const extractSubfolder = (url) => {
  const match = url.match(/\/(app|pages)\/(.*?)(\/|$)/);
  return match ? { type: match[1], name: match[2] } : null;
};
