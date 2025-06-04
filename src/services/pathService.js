// src/services/pathService.js
import path from 'path';
import { getUrlHash, extractSubfolder } from '../utils/url.js';

export class PathService {
  constructor(config) {
    this.config = config;
  }

  /**
   * 确定PDF文件的存储目录
   */
  determineDirectory(url) {
    const match = extractSubfolder(url);
    if (match) {
      const prefix = `${match.type}-`;
      return path.join(this.config.pdfDir, `${prefix}${match.name}`);
    }

    // 如果URL不匹配已知模式，使用主机名
    try {
      const hostname = new URL(url).hostname;
      return path.join(this.config.pdfDir, `${hostname}-docs`);
    } catch {
      return path.join(this.config.pdfDir, 'misc-docs');
    }
  }

  /**
   * 获取PDF文件的完整路径
   */
  getPdfPath(url, options = {}) {
    const { useHash = true, index = null } = options;

    // 提取文件名
    let fileName = url.split('/').filter(s => s).pop() || 'index';

    // 清理文件名中的特殊字符
    fileName = fileName.replace(/[^a-zA-Z0-9-_]/g, '-');

    // 确定目录
    const directory = this.determineDirectory(url);

    // 构建文件名
    let finalFileName;
    if (useHash) {
      const hash = getUrlHash(url);
      finalFileName = `${hash}-${fileName}.pdf`;
    } else if (index !== null) {
      finalFileName = `${index}-${fileName}.pdf`;
    } else {
      finalFileName = `${fileName}.pdf`;
    }

    return path.join(directory, finalFileName);
  }

  /**
   * 获取元数据文件路径
   */
  getMetadataPath(type) {
    const metadataFiles = {
      articleTitles: 'articleTitles.json',
      failed: 'failed.json',
      imageLoadFailures: 'imageLoadFailures.json',
      progress: 'progress.json',
      urlMapping: 'urlMapping.json'
    };

    const fileName = metadataFiles[type];
    if (!fileName) {
      throw new Error(`未知的元数据类型: ${type}`);
    }

    return path.join(this.config.pdfDir, 'metadata', fileName);
  }

  /**
   * 获取最终PDF输出路径
   */
  getFinalPdfPath(name) {
    const finalDir = path.join(this.config.pdfDir, 'finalPdf');
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return path.join(finalDir, `${name}_${date}.pdf`);
  }

  /**
   * 获取日志文件路径
   */
  getLogPath(type = 'combined') {
    const logDir = path.join(process.cwd(), 'logs');
    const logFiles = {
      combined: 'combined.log',
      error: 'error.log',
      progress: 'progress.log'
    };

    return path.join(logDir, logFiles[type] || `${type}.log`);
  }

  /**
   * 解析PDF文件名，提取信息
   */
  parsePdfFileName(fileName) {
    // 假设格式: hash-original-name.pdf 或 index-original-name.pdf
    const nameWithoutExt = path.basename(fileName, '.pdf');
    const parts = nameWithoutExt.split('-');

    if (parts.length >= 2) {
      const prefix = parts[0];
      const originalName = parts.slice(1).join('-');

      // 判断是hash还是index
      const isHash = /^[a-f0-9]{8}$/.test(prefix);

      return {
        prefix,
        originalName,
        isHash,
        index: isHash ? null : parseInt(prefix, 10)
      };
    }

    return {
      prefix: null,
      originalName: nameWithoutExt,
      isHash: false,
      index: null
    };
  }

  /**
   * 获取临时文件路径
   */
  getTempPath(filename) {
    const tempDir = path.join(this.config.pdfDir, '.temp');
    return path.join(tempDir, filename);
  }
}
