import Joi from 'joi';
import { createLogger } from '../utils/logger.js';

// 配置验证模式
const configSchema = Joi.object({
  rootURL: Joi.string().uri().required()
    .description('Root URL to start scraping from'),
  
  baseUrl: Joi.string().uri().optional()
    .description('Base URL prefix - only crawl URLs under this path'),
  
  pdfDir: Joi.string().required()
    .description('Directory to save PDF files'),
  
  concurrency: Joi.number().integer().min(1).max(10).default(5)
    .description('Number of concurrent browser instances'),
  
  screenshotDelay: Joi.number().integer().min(0).default(500)
    .description('Delay before taking screenshot (ms)'),
  
  navLinksSelector: Joi.string().required()
    .description('CSS selector for navigation links'),
  
  contentSelector: Joi.string().required()
    .description('CSS selector for main content'),
  
  ignoreURLs: Joi.array().items(Joi.string()).default([])
    .description('URLs to ignore during scraping'),
  
  maxRetries: Joi.number().integer().min(1).default(3)
    .description('Maximum number of retry attempts'),
  
  retryDelay: Joi.number().integer().min(0).default(1000)
    .description('Delay between retry attempts (ms)'),
  
  pageTimeout: Joi.number().integer().min(1000).default(30000)
    .description('Page load timeout (ms)'),
  
  imageTimeout: Joi.number().integer().min(1000).default(10000)
    .description('Image loading timeout (ms)'),
  
  allowedDomains: Joi.array().items(Joi.string()).default(['rc.nextjs.org', 'nextjs.org'])
    .description('Allowed domains for scraping'),
  
  logLevel: Joi.string().valid('debug', 'info', 'warn', 'error').default('info')
    .description('Logging level'),

  // 浏览器配置
  browser: Joi.object({
    headless: Joi.boolean().default(true)
      .description('Run browser in headless mode'),
    
    slowMo: Joi.number().integer().min(0).default(0)
      .description('Slow down browser operations (ms)'),
    
    devtools: Joi.boolean().default(false)
      .description('Open browser devtools'),
    
    args: Joi.array().items(Joi.string()).default([
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]).description('Browser launch arguments'),
    
    viewport: Joi.object({
      width: Joi.number().integer().min(800).default(1920),
      height: Joi.number().integer().min(600).default(1080)
    }).default().description('Browser viewport size'),
    
    userAgent: Joi.string().optional()
      .description('Custom user agent string')
  }).default().description('Browser configuration'),

  // 队列管理配置
  queue: Joi.object({
    maxConcurrent: Joi.number().integer().min(1).max(20).default(5)
      .description('Maximum concurrent operations'),
    
    maxRetries: Joi.number().integer().min(0).default(3)
      .description('Maximum retry attempts per operation'),
    
    retryDelay: Joi.number().integer().min(100).default(1000)
      .description('Base delay between retries (ms)'),
    
    timeout: Joi.number().integer().min(5000).default(30000)
      .description('Operation timeout (ms)')
  }).default().description('Queue management settings'),

  // 图片处理配置
  images: Joi.object({
    lazyLoadTimeout: Joi.number().integer().min(1000).default(10000)
      .description('Timeout for lazy loading images (ms)'),
    
    scrollDelay: Joi.number().integer().min(100).default(500)
      .description('Delay between scroll actions (ms)'),
    
    maxScrollAttempts: Joi.number().integer().min(1).default(10)
      .description('Maximum scroll attempts for lazy loading'),
    
    waitForNetworkIdle: Joi.boolean().default(true)
      .description('Wait for network idle after loading images')
  }).default().description('Image processing settings'),

  // 文件系统配置
  filesystem: Joi.object({
    tempDirectory: Joi.string().default('.temp')
      .description('Temporary files directory'),
    
    metadataDirectory: Joi.string().default('metadata')
      .description('Metadata files directory'),
    
    cleanupTemp: Joi.boolean().default(true)
      .description('Clean temporary files after completion'),
    
    preserveMetadata: Joi.boolean().default(true)
      .description('Preserve metadata files after completion')
  }).default().description('File system settings'),

  // PDF生成配置
  pdf: Joi.object({
    // PDF引擎选择
    engine: Joi.string().valid('puppeteer').default('puppeteer')
      .description('PDF generation engine'),
    
    // 主题配置
    theme: Joi.string().valid('light', 'dark').default('light')
      .description('PDF theme mode'),
    
    preserveCodeHighlighting: Joi.boolean().default(true)
      .description('Preserve code syntax highlighting'),
    
    enableCodeWrap: Joi.boolean().default(true)
      .description('Enable code line wrapping'),
    
    fontSize: Joi.string().default('14px')
      .description('Base font size for PDF content'),
    
    fontFamily: Joi.string().default('system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif')
      .description('Font family for body text'),
    
    codeFont: Joi.string().default('SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace')
      .description('Font family for code blocks'),
    
    // Puppeteer PDF配置
    format: Joi.string().valid('A4', 'A3', 'Letter', 'Legal').default('A4')
      .description('PDF page format'),
    
    margin: Joi.object({
      top: Joi.string().default('1cm'),
      right: Joi.string().default('1cm'),
      bottom: Joi.string().default('1cm'),
      left: Joi.string().default('1cm')
    }).default().description('PDF margins'),
    
    printBackground: Joi.boolean().default(true)
      .description('Include background graphics in PDF'),
    
    displayHeaderFooter: Joi.boolean().default(false)
      .description('Display header and footer in PDF'),
    
    quality: Joi.string().valid('low', 'medium', 'high').default('high')
      .description('PDF generation quality'),
    
    compression: Joi.boolean().default(true)
      .description('Enable PDF compression'),
    
    bookmarks: Joi.boolean().default(true)
      .description('Generate PDF bookmarks'),
    
    maxMemoryMB: Joi.number().integer().min(100).max(2000).default(500)
      .description('Maximum memory usage for PDF operations (MB)')
  }).default().description('PDF generation settings'),

  // Python集成配置
  python: Joi.object({
    executable: Joi.string().default('python3')
      .description('Python executable path'),
    
    timeout: Joi.number().integer().min(30000).max(600000).default(300000)
      .description('Python script execution timeout (ms)'),
    
    maxBuffer: Joi.number().integer().min(1048576).default(10485760)
      .description('Maximum buffer size for Python output (bytes)'),
    
    encoding: Joi.string().default('utf8')
      .description('Text encoding for Python communication'),
    
    env: Joi.object().pattern(Joi.string(), Joi.string()).default({})
      .description('Additional environment variables for Python'),
    
    cwd: Joi.string().optional()
      .description('Working directory for Python scripts')
  }).default().description('Python integration settings'),

  // 状态管理配置
  state: Joi.object({
    saveInterval: Joi.number().integer().min(1000).default(30000)
      .description('State save interval (ms)'),
    
    backupCount: Joi.number().integer().min(1).default(3)
      .description('Number of state file backups to keep'),
    
    autoSave: Joi.boolean().default(true)
      .description('Enable automatic state saving'),
    
    persistFailures: Joi.boolean().default(true)
      .description('Persist failed URL information')
  }).default().description('State management settings'),

  // 监控和日志配置
  monitoring: Joi.object({
    enabled: Joi.boolean().default(true)
      .description('Enable monitoring and metrics'),
    
    progressInterval: Joi.number().integer().min(1000).default(10000)
      .description('Progress reporting interval (ms)'),
    
    memoryThreshold: Joi.number().integer().min(100).default(1000)
      .description('Memory usage warning threshold (MB)'),
    
    logMetrics: Joi.boolean().default(true)
      .description('Log performance metrics')
  }).default().description('Monitoring settings'),

  // 网络配置
  network: Joi.object({
    userAgent: Joi.string().optional()
      .description('Custom user agent string'),
    
    requestTimeout: Joi.number().integer().min(5000).default(30000)
      .description('Network request timeout (ms)'),
    
    maxRedirects: Joi.number().integer().min(0).default(5)
      .description('Maximum number of redirects to follow'),
    
    retryOn429: Joi.boolean().default(true)
      .description('Retry on 429 (Too Many Requests) responses'),
    
    rateLimitDelay: Joi.number().integer().min(100).default(1000)
      .description('Delay between requests to avoid rate limiting (ms)')
  }).default().description('Network settings')
});

/**
 * 验证配置对象
 * @param {Object} config - 要验证的配置对象
 * @param {Object} options - 验证选项
 * @returns {Object} 验证结果
 */
function validateConfig(config, options = {}) {
  const logger = createLogger('ConfigValidator');
  
  const validationOptions = {
    abortEarly: false,
    allowUnknown: options.allowUnknown || false,
    stripUnknown: options.stripUnknown || true,
    convert: options.convert !== false,
    ...options
  };

  try {
    logger.debug('Starting configuration validation...');
    
    const { error, value, warning } = configSchema.validate(config, validationOptions);
    
    if (error) {
      const errorMessage = error.details.map(detail => {
        return `${detail.path.join('.')}: ${detail.message}`;
      }).join('; ');
      
      logger.error('Configuration validation failed:', errorMessage);
      
      throw new ValidationError(`Configuration validation failed: ${errorMessage}`, {
        details: error.details,
        originalConfig: config
      });
    }
    
    if (warning) {
      const warningMessage = warning.details.map(detail => {
        return `${detail.path.join('.')}: ${detail.message}`;
      }).join('; ');
      
      logger.warn('Configuration validation warnings:', warningMessage);
    }
    
    logger.info('Configuration validation passed successfully');
    logger.debug('Validated configuration:', value);
    
    return {
      valid: true,
      config: value,
      warnings: warning ? warning.details : [],
      errors: []
    };
    
  } catch (err) {
    if (err instanceof ValidationError) {
      throw err;
    }
    
    logger.error('Unexpected error during configuration validation:', err);
    throw new ValidationError(`Unexpected validation error: ${err.message}`, {
      originalError: err,
      originalConfig: config
    });
  }
}

/**
 * 异步验证配置对象
 * @param {Object} config - 要验证的配置对象  
 * @param {Object} options - 验证选项
 * @returns {Promise<Object>} 验证结果
 */
async function validateConfigAsync(config, options = {}) {
  return validateConfig(config, options);
}

/**
 * 验证部分配置
 * @param {Object} partialConfig - 部分配置对象
 * @param {string[]} requiredFields - 必需字段列表
 * @returns {Object} 验证结果
 */
function validatePartialConfig(partialConfig, requiredFields = []) {
  const logger = createLogger('ConfigValidator');
  
  try {
    // 简单的部分验证：验证提供的字段，不要求所有字段都存在
    
    if (requiredFields.length > 0) {
      // 检查必需字段是否存在
      const missingFields = requiredFields.filter(field => !(field in partialConfig));
      if (missingFields.length > 0) {
        return {
          valid: false,
          config: null,
          errors: missingFields.map(field => ({
            message: `"${field}" is required`,
            path: [field],
            type: 'any.required'
          })),
          warnings: []
        };
      }
    }
    
    // 对提供的字段进行验证，使用完整schema但允许未知字段
    const fullConfig = {
      // 提供必需的占位符值
      rootURL: partialConfig.rootURL || 'https://example.com',
      pdfDir: partialConfig.pdfDir || './pdfs',
      navLinksSelector: partialConfig.navLinksSelector || 'nav a',
      contentSelector: partialConfig.contentSelector || 'main',
      // 合并实际的部分配置
      ...partialConfig
    };
    
    const { error, value } = configSchema.validate(fullConfig, {
      allowUnknown: true,
      stripUnknown: false
    });
    
    if (error) {
      const errorMessage = error.details.map(detail => {
        return `${detail.path.join('.')}: ${detail.message}`;
      }).join('; ');
      
      logger.error('Partial configuration validation failed:', errorMessage);
      
      return {
        valid: false,
        config: null,
        errors: error.details,
        warnings: []
      };
    }
    
    // 只返回原始提供的字段
    const resultConfig = {};
    Object.keys(partialConfig).forEach(key => {
      resultConfig[key] = value[key];
    });
    
    logger.debug('Partial configuration validation passed');
    
    return {
      valid: true,
      config: resultConfig,
      errors: [],
      warnings: []
    };
    
  } catch (err) {
    logger.error('Error during partial configuration validation:', err);
    throw err;
  }
}

/**
 * 获取配置模式的描述信息
 * @returns {Object} 模式描述
 */
function getConfigSchema() {
  return configSchema.describe();
}

/**
 * 获取默认配置值
 * @returns {Object} 默认配置
 */
function getDefaultConfig() {
  // 提供最小必需的配置来生成默认值
  const minimalConfig = {
    rootURL: 'https://example.com',
    pdfDir: './pdfs',
    navLinksSelector: 'nav a',
    contentSelector: 'main'
  };
  
  const { value } = configSchema.validate(minimalConfig, { 
    allowUnknown: false,
    stripUnknown: true 
  });
  
  // 清除我们添加的占位符值，只保留默认值
  delete value.rootURL;
  delete value.pdfDir;
  delete value.navLinksSelector;
  delete value.contentSelector;
  
  return value;
}

/**
 * 配置验证错误类
 */
class ValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }
}

export {
  validateConfig,
  validateConfigAsync,
  validatePartialConfig,
  getConfigSchema,
  getDefaultConfig,
  configSchema,
  ValidationError
};