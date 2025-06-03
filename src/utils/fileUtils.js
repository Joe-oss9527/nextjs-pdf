// src/utils/fileUtils.js
const fs = require('fs').promises;
const path = require('path');
const { getUrlHash, extractFileName } = require('./index');

/**
 * 确保目录存在，如果不存在则创建
 * @param {string} dirPath - 目录路径
 */
const ensureDirectoryExists = async (dirPath) => {
  try {
    await fs.access(dirPath);
  } catch (error) {
    await fs.mkdir(dirPath, { recursive: true });
  }
};

/**
 * 清理目录（删除并重新创建）
 * @param {string} dirPath - 目录路径
 */
const cleanDirectory = async (dirPath) => {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    await fs.mkdir(dirPath, { recursive: true });
    console.log(`Directory cleaned: ${dirPath}`);
  } catch (error) {
    console.error(`Error cleaning directory ${dirPath}:`, error.message);
    throw error;
  }
};

/**
 * 从URL中提取子文件夹信息
 * @param {string} url - URL
 * @returns {Object|null} - 包含type和name的对象，或null
 */
const extractSubfolder = (url) => {
  const match = url.match(/\/(app|pages)\/(.*?)(\/|$)/);
  return match ? { type: match[1], name: match[2] } : null;
};

/**
 * 根据URL确定保存目录
 * @param {string} url - URL
 * @param {string} pdfDir - PDF根目录
 * @returns {string} - 完整的目录路径
 */
const determineDirectory = (url, pdfDir) => {
  const subfolder = extractSubfolder(url);
  if (subfolder) {
    const prefix = `${subfolder.type}-`;
    return path.join(pdfDir, `${prefix}${subfolder.name}`);
  }
  return pdfDir;
};

/**
 * 获取PDF文件的保存路径（基于URL哈希，避免重复）
 * @param {string} url - 页面URL
 * @param {string} pdfDir - PDF保存目录
 * @returns {Promise<string>} - PDF文件路径
 */
const getPdfPath = async (url, pdfDir) => {
  const fileName = extractFileName(url);
  const urlHash = getUrlHash(url);
  const directory = determineDirectory(url, pdfDir);
  
  await ensureDirectoryExists(directory);
  
  // 使用URL哈希作为文件名前缀，确保唯一性
  return path.join(directory, `${urlHash}-${fileName}.pdf`);
};

/**
 * JSON文件操作基类
 */
class JsonFileManager {
  constructor(filePath) {
    this.filePath = filePath;
  }
  
  async read() {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return this.getDefaultData();
      }
      throw error;
    }
  }
  
  async write(data) {
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
  }
  
  getDefaultData() {
    return {};
  }
}

/**
 * 失败链接管理器
 */
class FailedLinksManager extends JsonFileManager {
  constructor(pdfDir) {
    super(path.join(pdfDir, 'failed.json'));
  }
  
  getDefaultData() {
    return [];
  }
  
  async addFailedLink(url, error = null) {
    const failedLinks = await this.read();
    const existingIndex = failedLinks.findIndex(link => link.url === url);
    
    const failedLink = {
      url,
      error: error?.message || 'Unknown error',
      timestamp: new Date().toISOString(),
      attempts: 1
    };
    
    if (existingIndex >= 0) {
      failedLinks[existingIndex].attempts++;
      failedLinks[existingIndex].timestamp = failedLink.timestamp;
      failedLinks[existingIndex].error = failedLink.error;
    } else {
      failedLinks.push(failedLink);
    }
    
    await this.write(failedLinks);
  }
  
  async removeFailedLink(url) {
    const failedLinks = await this.read();
    const filtered = failedLinks.filter(link => link.url !== url);
    await this.write(filtered);
  }
  
  async getFailedLinks() {
    return await this.read();
  }
}

/**
 * 文章标题管理器
 */
class ArticleTitlesManager extends JsonFileManager {
  constructor(pdfDir) {
    super(path.join(pdfDir, 'articleTitles.json'));
  }
  
  async saveTitle(url, title) {
    const titles = await this.read();
    const urlHash = getUrlHash(url);
    titles[urlHash] = {
      title,
      url,
      savedAt: new Date().toISOString()
    };
    await this.write(titles);
  }
  
  async getTitle(url) {
    const titles = await this.read();
    const urlHash = getUrlHash(url);
    return titles[urlHash]?.title || null;
  }
}

/**
 * 图片加载失败管理器
 */
class ImageLoadFailuresManager extends JsonFileManager {
  constructor(pdfDir) {
    super(path.join(pdfDir, 'imageLoadFailures.json'));
  }
  
  getDefaultData() {
    return [];
  }
  
  async addFailure(url) {
    const failures = await this.read();
    const exists = failures.some(f => f.url === url);
    
    if (!exists) {
      failures.push({
        url,
        timestamp: new Date().toISOString()
      });
      await this.write(failures);
    }
  }
  
  async getUniqueFailures() {
    const failures = await this.read();
    // 返回去重后的URL列表
    return [...new Set(failures.map(f => f.url))];
  }
}

/**
 * 爬取状态管理器
 */
class ScrapingStateManager extends JsonFileManager {
  constructor(pdfDir) {
    super(path.join(pdfDir, 'scrapingState.json'));
  }
  
  getDefaultData() {
    return {
      processedUrls: [],
      totalUrls: 0,
      startTime: null,
      endTime: null,
      stats: {
        success: 0,
        failed: 0
      }
    };
  }
  
  async markAsProcessed(url, success = true) {
    const state = await this.read();
    
    if (!state.processedUrls.includes(url)) {
      state.processedUrls.push(url);
    }
    
    if (success) {
      state.stats.success++;
    } else {
      state.stats.failed++;
    }
    
    await this.write(state);
  }
  
  async isProcessed(url) {
    const state = await this.read();
    return state.processedUrls.includes(url);
  }
  
  async setTotalUrls(total) {
    const state = await this.read();
    state.totalUrls = total;
    state.startTime = new Date().toISOString();
    await this.write(state);
  }
  
  async finalize() {
    const state = await this.read();
    state.endTime = new Date().toISOString();
    await this.write(state);
  }
}

// 便捷函数（保持向后兼容）
const logFailedLink = async (pdfDir, url, index, error) => {
  const manager = new FailedLinksManager(pdfDir);
  await manager.addFailedLink(url, error);
};

const removeFromFailedLinks = async (pdfDir, url) => {
  const manager = new FailedLinksManager(pdfDir);
  await manager.removeFailedLink(url);
};

const saveArticleTitle = async (pdfDir, url, title) => {
  const manager = new ArticleTitlesManager(pdfDir);
  await manager.saveTitle(url, title);
};

const logImageLoadFailure = async (pdfDir, url) => {
  const manager = new ImageLoadFailuresManager(pdfDir);
  await manager.addFailure(url);
};

const getImageLoadFailures = async (pdfDir) => {
  const manager = new ImageLoadFailuresManager(pdfDir);
  return await manager.getUniqueFailures();
};

module.exports = {
  ensureDirectoryExists,
  cleanDirectory,
  getPdfPath,
  determineDirectory,
  
  // 管理器类
  FailedLinksManager,
  ArticleTitlesManager,
  ImageLoadFailuresManager,
  ScrapingStateManager,
  
  // 便捷函数
  logFailedLink,
  removeFromFailedLinks,
  saveArticleTitle,
  logImageLoadFailure,
  getImageLoadFailures
};