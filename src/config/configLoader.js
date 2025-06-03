// src/config/configLoader.js
const fs = require('fs');
const path = require('path');

/**
 * 配置验证规则
 */
const CONFIG_SCHEMA = {
  rootURL: {
    type: 'string',
    required: true,
    validate: (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        throw new Error('Invalid URL format');
      }
    }
  },
  pdfDir: {
    type: 'string',
    required: true,
    default: 'pdfs'
  },
  concurrency: {
    type: 'number',
    required: true,
    default: 5,
    validate: (value) => {
      if (value < 1 || value > 10) {
        throw new Error('Concurrency must be between 1 and 10');
      }
      return true;
    }
  },
  screenshotDelay: {
    type: 'number',
    default: 500,
    validate: (value) => value >= 0
  },
  navLinksSelector: {
    type: 'string',
    required: true
  },
  contentSelector: {
    type: 'string', 
    required: true
  },
  ignoreURLs: {
    type: 'array',
    default: []
  },
  maxRetries: {
    type: 'number',
    default: 3,
    validate: (value) => value >= 0 && value <= 10
  },
  retryDelay: {
    type: 'number',
    default: 1000
  },
  pageTimeout: {
    type: 'number',
    default: 30000
  },
  imageTimeout: {
    type: 'number',
    default: 10000
  }
};

/**
 * 验证配置对象
 * @param {Object} config - 要验证的配置对象
 * @returns {Object} - 验证并填充默认值后的配置
 */
function validateConfig(config) {
  const validated = {};
  
  // 检查必需字段
  for (const [key, schema] of Object.entries(CONFIG_SCHEMA)) {
    if (schema.required && !(key in config)) {
      if ('default' in schema) {
        validated[key] = schema.default;
      } else {
        throw new Error(`Missing required config field: ${key}`);
      }
    } else if (key in config) {
      const value = config[key];
      
      // 类型检查
      if (schema.type === 'array' && !Array.isArray(value)) {
        throw new Error(`Config field ${key} must be an array`);
      } else if (schema.type !== 'array' && typeof value !== schema.type) {
        throw new Error(`Config field ${key} must be of type ${schema.type}`);
      }
      
      // 自定义验证
      if (schema.validate && !schema.validate(value)) {
        throw new Error(`Invalid value for config field ${key}`);
      }
      
      validated[key] = value;
    } else if ('default' in schema) {
      validated[key] = schema.default;
    }
  }
  
  return validated;
}

/**
 * 加载并验证配置文件
 * @param {string} configPath - 配置文件路径
 * @returns {Object} - 处理后的配置对象
 */
function loadConfig(configPath = null) {
  const defaultPath = path.join(__dirname, '../../config.json');
  const actualPath = configPath || defaultPath;
  
  try {
    if (!fs.existsSync(actualPath)) {
      throw new Error(`Config file not found: ${actualPath}`);
    }
    
    const rawConfig = fs.readFileSync(actualPath, 'utf8');
    const config = JSON.parse(rawConfig);
    
    // 验证配置
    const validated = validateConfig(config);
    
    // 转换相对路径为绝对路径
    validated.pdfDir = path.isAbsolute(validated.pdfDir) 
      ? validated.pdfDir 
      : path.join(__dirname, '../..', validated.pdfDir);
    
    // 解析并存储允许的域名（用于安全验证）
    const url = new URL(validated.rootURL);
    validated.allowedDomain = url.hostname;
    
    return validated;
  } catch (error) {
    if (error.name === 'SyntaxError') {
      throw new Error(`Invalid JSON in config file: ${error.message}`);
    }
    throw error;
  }
}

// 导出单例配置
let configInstance = null;

module.exports = {
  getConfig: () => {
    if (!configInstance) {
      configInstance = loadConfig();
    }
    return configInstance;
  },
  reloadConfig: (configPath = null) => {
    configInstance = loadConfig(configPath);
    return configInstance;
  },
  validateConfig
};