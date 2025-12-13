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
   * 获取PDF文件的完整路径 - 修复：支持数字索引优先
   */
  getPdfPath(url, options = {}) {
    const { useHash = true, index = null } = options;

    // 提取文件名
    let fileName =
      url
        .split('/')
        .filter((s) => s)
        .pop() || 'index';

    // 清理文件名中的特殊字符
    fileName = fileName.replace(/[^a-zA-Z0-9-_]/g, '-');

    // 确定目录
    const directory = this.determineDirectory(url);

    // 🔥 关键修改：构建文件名 - 数字索引优先，带补零
    let finalFileName;

    if (!useHash && index !== null) {
      // 使用数字索引（3位补零确保正确排序）
      const paddedIndex = String(index).padStart(3, '0');
      finalFileName = `${paddedIndex}-${fileName}.pdf`;
    } else if (useHash) {
      // 使用哈希（向后兼容）
      const hash = getUrlHash(url);
      finalFileName = `${hash}-${fileName}.pdf`;
    } else {
      // 后备方案：直接使用文件名
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
      urlMapping: 'urlMapping.json',
      // 新增：分层TOC的section结构元数据文件
      sectionStructure: 'sectionStructure.json',
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
      progress: 'progress.log',
    };

    return path.join(logDir, logFiles[type] || `${type}.log`);
  }

  /**
   * 解析PDF文件名，提取信息 - 改进：支持数字和哈希前缀
   */
  parsePdfFileName(fileName) {
    // 假设格式: 000-original-name.pdf 或 hash-original-name.pdf
    const nameWithoutExt = path.basename(fileName, '.pdf');
    const parts = nameWithoutExt.split('-');

    if (parts.length >= 2) {
      const prefix = parts[0];
      const originalName = parts.slice(1).join('-');

      // 判断是数字索引还是哈希
      const isNumericIndex = /^\d{3}$/.test(prefix); // 3位数字
      const isHash = /^[a-f0-9]{8}$/.test(prefix); // 8位十六进制哈希

      return {
        prefix,
        originalName,
        isNumericIndex,
        isHash,
        index: isNumericIndex ? parseInt(prefix, 10) : null,
      };
    }

    return {
      prefix: null,
      originalName: nameWithoutExt,
      isNumericIndex: false,
      isHash: false,
      index: null,
    };
  }

  /**
   * 获取临时文件路径
   */
  getTempPath(filename) {
    const tempDir = path.join(this.config.pdfDir, '.temp');
    return path.join(tempDir, filename);
  }

  /**
   * 获取临时目录路径
   */
  getTempDirectory() {
    const tempDir = this.config.output?.tempDirectory || '.temp';
    return path.resolve(tempDir);
  }

  /**
   * 根据索引生成标准化的PDF文件名 - 新增方法
   */
  generateIndexedFileName(url, index) {
    return this.getPdfPath(url, { useHash: false, index });
  }

  /**
   * 根据哈希生成PDF文件名 - 新增方法
   */
  generateHashedFileName(url) {
    return this.getPdfPath(url, { useHash: true });
  }

  /**
   * 验证文件名格式 - 新增方法
   */
  validateFileName(fileName) {
    const parsed = this.parsePdfFileName(fileName);

    return {
      isValid: parsed.isNumericIndex || parsed.isHash || !parsed.prefix,
      type: parsed.isNumericIndex ? 'indexed' : parsed.isHash ? 'hashed' : 'simple',
      index: parsed.index,
      originalName: parsed.originalName,
    };
  }

  /**
   * 获取翻译缓存目录
   * 确保路径位于当前工作目录之下，防止越界访问
   */
  getTranslationCacheDirectory() {
    const baseTempDir = this.getTempDirectory();
    const cacheDir = path.join(baseTempDir, 'translation_cache');

    const rootDir = path.resolve(process.cwd());
    const resolved = path.resolve(cacheDir);

    if (!resolved.startsWith(rootDir)) {
      throw new Error(`Unsafe translation cache directory: ${resolved}`);
    }

    return resolved;
  }
}
