// src/config/loader.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { configSchema } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ConfigLoader {
  constructor(configPath) {
    this.configPath = configPath;
    this.config = null;
  }

  async load() {
    try {
      const rawConfig = await fs.readFile(this.configPath, 'utf8');
      const parsedConfig = JSON.parse(rawConfig);

      // 转换相对路径为绝对路径
      if (!path.isAbsolute(parsedConfig.pdfDir)) {
        parsedConfig.pdfDir = path.resolve(path.dirname(this.configPath), parsedConfig.pdfDir);
      }

      // 添加默认的allowedDomains如果不存在
      if (!parsedConfig.allowedDomains) {
        const url = new URL(parsedConfig.rootURL);
        parsedConfig.allowedDomains = [url.hostname];
      }

      // 验证配置
      const { error, value } = configSchema.validate(parsedConfig);
      if (error) {
        throw new Error(`配置验证失败: ${error.message}`);
      }

      this.config = value;
      return this.config;
    } catch (error) {
      throw new Error(`加载配置失败: ${error.message}`);
    }
  }

  get() {
    if (!this.config) {
      throw new Error('配置未加载，请先调用 load() 方法');
    }
    return this.config;
  }
}

// 保持向后兼容
export const loadConfig = async (configPath = null) => {
  const finalConfigPath = configPath || path.join(__dirname, '../../config.json');
  const loader = new ConfigLoader(finalConfigPath);
  return await loader.load();
};
