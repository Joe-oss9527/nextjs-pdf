// src/services/fileService.js
import fs from 'fs/promises';
import path from 'path';
import { FileOperationError } from '../utils/errors.js';

export class FileService {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * 确保目录存在，如果不存在则创建
   */
  async ensureDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      this.logger.debug(`确保目录存在: ${dirPath}`);
    } catch (error) {
      throw new FileOperationError(`创建目录失败: ${dirPath} - ${error.message}`, dirPath, 'mkdir');
    }
  }

  /**
   * 清理目录（删除并重新创建）
   */
  async cleanDirectory(dirPath) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
      await this.ensureDirectory(dirPath);
      this.logger.info(`清理目录: ${dirPath}`);
    } catch (error) {
      throw new FileOperationError(`清理目录失败: ${dirPath} - ${error.message}`, dirPath, 'clean');
    }
  }

  /**
   * 读取JSON文件
   */
  async readJson(filePath, defaultValue = null) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT' && defaultValue !== null) {
        this.logger.debug(`文件不存在，使用默认值: ${filePath}`);
        return defaultValue;
      }
      throw new FileOperationError(
        `读取JSON文件失败: ${filePath} - ${error.message}`,
        filePath,
        'readJson'
      );
    }
  }

  /**
   * 写入JSON文件
   */
  async writeJson(filePath, data) {
    try {
      const content = JSON.stringify(data, null, 2);
      await this.ensureDirectory(path.dirname(filePath));
      await fs.writeFile(filePath, content, 'utf8');
      this.logger.debug(`写入JSON文件: ${filePath}`);
    } catch (error) {
      throw new FileOperationError(
        `写入JSON文件失败: ${filePath} - ${error.message}`,
        filePath,
        'writeJson'
      );
    }
  }

  /**
   * 写入纯文本文件
   */
  async writeText(filePath, content) {
    try {
      await this.ensureDirectory(path.dirname(filePath));
      await fs.writeFile(filePath, content, 'utf8');
      this.logger.debug(`写入文本文件: ${filePath}`);
    } catch (error) {
      throw new FileOperationError(
        `写入文本文件失败: ${filePath} - ${error.message}`,
        filePath,
        'writeText'
      );
    }
  }

  /**
   * 追加到JSON数组文件
   */
  async appendToJsonArray(filePath, item) {
    try {
      let array = await this.readJson(filePath, []);
      if (!Array.isArray(array)) {
        array = [];
      }
      array.push(item);
      await this.writeJson(filePath, array);
    } catch (error) {
      throw new FileOperationError(
        `追加到JSON数组失败: ${filePath} - ${error.message}`,
        filePath,
        'appendToJsonArray'
      );
    }
  }

  /**
   * 从JSON数组中移除项
   */
  async removeFromJsonArray(filePath, predicate) {
    try {
      let array = await this.readJson(filePath, []);
      if (!Array.isArray(array)) {
        return;
      }
      const filtered = array.filter((item) => !predicate(item));
      await this.writeJson(filePath, filtered);
    } catch (error) {
      throw new FileOperationError(
        `从JSON数组移除项失败: ${filePath} - ${error.message}`,
        filePath,
        'removeFromJsonArray'
      );
    }
  }

  /**
   * 检查文件是否存在
   */
  async exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取目录中的文件列表
   */
  async listFiles(dirPath, filter = null) {
    try {
      const files = await fs.readdir(dirPath);
      if (filter) {
        return files.filter(filter);
      }
      return files;
    } catch (error) {
      throw new FileOperationError(
        `列出目录文件失败: ${dirPath} - ${error.message}`,
        dirPath,
        'listFiles'
      );
    }
  }

  /**
   * 复制文件
   */
  async copyFile(source, destination) {
    try {
      await this.ensureDirectory(path.dirname(destination));
      await fs.copyFile(source, destination);
      this.logger.debug(`复制文件: ${source} -> ${destination}`);
    } catch (error) {
      throw new FileOperationError(
        `复制文件失败: ${source} -> ${destination} - ${error.message}`,
        source,
        'copyFile'
      );
    }
  }
}
