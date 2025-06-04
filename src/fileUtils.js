// src/fileUtils.js - 临时兼容层
import { FileService } from './services/fileService.js';
import { PathService } from './services/pathService.js';
import { MetadataService } from './services/metadataService.js';
import { createLogger, consoleLogger } from './utils/logger.js';
import { loadConfig } from './config/loader.js';
import path from 'path';

// 创建单例实例
let fileService = null;
let pathService = null;
let metadataService = null;
let config = null;

// 初始化服务
const initServices = async () => {
  if (!config) {
    config = await loadConfig();
    const logger = consoleLogger; // 使用简单日志器避免循环依赖
    fileService = new FileService(logger);
    pathService = new PathService(config);
    metadataService = new MetadataService(fileService, pathService, logger);
  }
};

// 确保服务已初始化的装饰器
const ensureInit = (fn) => async (...args) => {
  await initServices();
  return fn(...args);
};

// 导出兼容的函数
export const ensureDirectoryExists = ensureInit(async (dirPath) => {
  await fileService.ensureDirectory(dirPath);
});

export const extractSubfolder = (url) => {
  const match = url.match(/\/(app|pages)\/(.*?)(\/|$)/);
  return match ? { type: match[1], name: match[2] } : null;
};

export const determineDirectory = ensureInit((url, pdfDir) => {
  // 注意：这里忽略传入的pdfDir参数，使用配置中的值
  return pathService.determineDirectory(url);
});

export const getPdfPath = ensureInit(async (url, index, pdfDir) => {
  // 转换为新的参数格式
  return pathService.getPdfPath(url, { useHash: false, index });
});

export const logFailedLink = ensureInit(async (pdfDir, url, index, error) => {
  await metadataService.logFailedLink(url, index, error);
});

export const cleanDirectory = ensureInit(async (dirPath) => {
  await fileService.cleanDirectory(dirPath);
});

export const saveArticleTitle = ensureInit(async (pdfDir, index, title) => {
  await metadataService.saveArticleTitle(index, title);
});

export const logImageLoadFailure = ensureInit(async (pdfDir, url, index) => {
  await metadataService.logImageLoadFailure(url, index);
});

export const getImageLoadFailures = ensureInit(async (pdfDir) => {
  return await metadataService.getImageLoadFailures();
});

// 添加缺失的函数（从重构文档中发现的bug修复）
export const removeFromFailedLinks = ensureInit(async (pdfDir, url) => {
  await metadataService.removeFromFailedLinks(url);
});

// CommonJS兼容
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ensureDirectoryExists,
    extractSubfolder,
    determineDirectory,
    getPdfPath,
    logFailedLink,
    cleanDirectory,
    saveArticleTitle,
    logImageLoadFailure,
    getImageLoadFailures,
    removeFromFailedLinks
  };
}
