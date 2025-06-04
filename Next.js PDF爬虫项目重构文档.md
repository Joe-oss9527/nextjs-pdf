# Next.js PDF爬虫项目重构文档

## 项目概述

这是一个用于抓取 Next.js 文档并生成 PDF 的爬虫工具。项目使用 Node.js (Puppeteer) 进行网页抓取，Python (PyMuPDF) 进行 PDF 合并。

### 核心功能流程
1. 使用 Puppeteer 访问 Next.js 文档站点
2. 从导航栏收集所有文档链接
3. 并发访问每个页面并生成 PDF
4. 处理懒加载图片
5. 使用 Python 脚本合并所有 PDF
6. 生成带书签的最终 PDF 文件

## 发现的问题汇总

### 1. 关键Bug - 未定义函数

**问题描述**：
在 `LazyLoadingImageHelper.js` 中调用了 `removeFromFailedLinks` 函数：
```javascript
removeFromFailedLinks(config.pdfDir, url);
```

但这个函数在 `fileUtils.js` 中并未定义，会导致运行时错误。

**影响**：程序崩溃，无法正常完成爬取任务。

**解决方案**：
```javascript
const removeFromFailedLinks = async (pdfDir, url) => {
  const failedLinksFilePath = path.join(pdfDir, "failed.json");
  try {
    const data = await fs.readFile(failedLinksFilePath, 'utf-8');
    let failedLinks = JSON.parse(data);
    failedLinks = failedLinks.filter(link => link.url !== url);
    await fs.writeFile(failedLinksFilePath, JSON.stringify(failedLinks, null, 2));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error("Error updating failed links file:", err);
    }
  }
};
```

### 2. URL重复抓取问题

**问题描述**：
- `scrapeNavLinks()` 方法没有对重复链接进行去重
- 同一个URL可能出现在导航栏、侧边栏、页脚等多处
- 每个重复的URL会被分配不同的index，导致多次抓取

**具体代码位置**：
```javascript
// scraper.js - scrapeNavLinks方法
const links = await page.evaluate((selector) => {
    return Array.from(document.querySelectorAll(selector))
        .map(el => el.href)
        .filter(href => href && !href.startsWith('#'));
}, config.navLinksSelector);

// scraper.js - run方法
links.forEach((url, index) => {
    this.queue.push({ url, index });
});
```

**影响**：
- 同一页面被多次抓取，生成多个相同内容的PDF（如 `0-getting-started.pdf`, `15-getting-started.pdf`）
- 爬取时间成倍增加
- 存储空间浪费
- 最终合并的PDF包含重复内容
- 可能触发目标网站的反爬虫机制

**解决方案**：
- 使用 Set 数据结构去重
- 实现 URL 规范化（移除尾部斜杠、排序查询参数）
- 维护已处理 URL 的记录
- 基于 URL 哈希而非 index 生成文件名

### 3. 内存溢出风险

**问题描述**：
Python 脚本 `mergePdf.py` 中一次性加载所有 PDF 到内存：
```python
merged_pdf = fitz.open()
for file in files:
    pdf = fitz.open(file_path)
    merged_pdf.insert_pdf(pdf)  # 所有PDF都保存在内存中
```

**影响**：处理大量或大型 PDF 时可能导致内存溢出。

**解决方案**：使用临时文件逐个合并，避免同时加载所有PDF。

### 4. 代码冗余

**问题描述**：
- 存在未使用的 Node.js 版本 PDF 合并代码（`src/pdfUtils.js`）
- 实际只使用 Python 版本（`scripts/mergePdf.py`）
- 注释语言混杂（中英文混用）

**影响**：代码维护困难，容易产生混淆。

### 5. 错误处理不完善

**问题描述**：
- 错误处理不一致，有些地方捕获错误但不抛出
- 缺少统一的错误处理机制
- 潜在的无限循环（图片加载失败时可能不断重试）

**具体例子**：
```javascript
// 捕获错误但不抛出
} catch (err) {
    if (err.code !== 'ENOENT') {
        console.error("Error reading failed links file:", err);
    }
}

// 可能的无限循环
if (!allImagesLoaded) {
    await scrollAgain(page);  // 没有重试次数限制
}
```

### 6. 安全性问题

**问题描述**：
- 爬虫直接访问外部 URL 而没有验证，可能存在 SSRF 风险
- `executePythonScript.js` 中虽然使用了参数数组，但未验证 scriptPath

**解决方案**：添加 URL 白名单验证和路径验证。

### 7. 性能问题

**问题描述**：
- 为重试失败的图片加载而重启整个浏览器实例
- 并发控制没有错误隔离，一个任务失败可能影响其他任务

**具体代码**：
```javascript
async retryImageLoadFailures() {
    await this.close();  // 关闭整个浏览器
    await this.initialize(false);  // 重新启动
}
```

### 8. 其他问题

- **跨平台兼容性**：路径处理可能存在问题
- **配置验证缺失**：没有验证必需的配置项
- **资源泄漏**：页面对象可能未正确关闭
- **日志系统缺失**：使用 console.log 而非专业日志框架

## 完整的改进方案

### 1. 修复URL重复抓取（最高优先级）

```javascript
class Scraper {
  constructor() {
    // 新增去重相关数据结构
    this.processedUrls = new Set();
    this.urlToIndex = new Map();
  }

  // URL规范化函数
  normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      urlObj.pathname = urlObj.pathname.replace(/\/$/, '');
      urlObj.searchParams.sort();
      urlObj.hash = '';
      return urlObj.toString();
    } catch (error) {
      return url;
    }
  }

  async scrapeNavLinks() {
    const page = await this.browser.newPage();
    try {
      await page.goto(config.rootURL, { waitUntil: 'networkidle0' });
      const links = await page.evaluate((selector) => {
        return Array.from(document.querySelectorAll(selector))
          .map(el => el.href)
          .filter(href => href && !href.startsWith('#'));
      }, config.navLinksSelector);

      // 规范化并去重
      const normalizedLinks = links.map(link => this.normalizeUrl(link));
      const uniqueLinks = [...new Set(normalizedLinks)];

      console.log(`原始链接数: ${links.length}, 去重后: ${uniqueLinks.length}`);

      return uniqueLinks.filter(link => !isIgnored(link, config.ignoreURLs));
    } finally {
      await page.close();
    }
  }

  async scrapePage(url, index) {
    if (this.processedUrls.has(url)) {
      console.log(`跳过已处理的URL: ${url}`);
      return;
    }
    this.processedUrls.add(url);
    // ... 继续原有逻辑
  }
}
```

### 2. 修复未定义函数

在 `fileUtils.js` 中添加：
```javascript
const removeFromFailedLinks = async (pdfDir, url) => {
  const failedLinksFilePath = path.join(pdfDir, "failed.json");
  try {
    const data = await fs.readFile(failedLinksFilePath, 'utf-8');
    let failedLinks = JSON.parse(data);
    failedLinks = failedLinks.filter(link => link.url !== url);
    await fs.writeFile(failedLinksFilePath, JSON.stringify(failedLinks, null, 2));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error("Error updating failed links file:", err);
    }
  }
};

module.exports = {
  // ... 其他导出
  removeFromFailedLinks
};
```

### 3. 改进图片加载重试机制

```javascript
async function loadAllLazyImages(page, fetchIndex, maxRetries = 3) {
  let retryCount = 0;
  let allImagesLoaded = false;

  while (!allImagesLoaded && retryCount < maxRetries) {
    console.log(`尝试加载图片，第 ${retryCount + 1} 次`);
    await autoScroll(page);
    await triggerLazyImages(page);
    allImagesLoaded = await checkAllImagesLoadedAndLog(page, fetchIndex);

    if (!allImagesLoaded) {
      retryCount++;
      if (retryCount < maxRetries) {
        await scrollAgain(page);
      }
    }
  }

  if (!allImagesLoaded) {
    console.error(`图片加载失败，已达最大重试次数: ${maxRetries}`);
  }

  return allImagesLoaded;
}
```

### 4. 优化PDF合并内存使用

```python
import os
import fitz
import shutil
import tempfile

def merge_pdfs_in_directory_optimized(directory_path, output_file_name):
    files = [f for f in os.listdir(directory_path) if f.endswith('.pdf')]
    files.sort(key=lambda x: int(x.split('-')[0]))

    if not files:
        return

    # 创建临时文件
    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
        temp_file = tmp.name

    # 复制第一个文件作为基础
    first_file = os.path.join(directory_path, files[0])
    shutil.copy(first_file, temp_file)

    # 逐个合并其他文件
    for file in files[1:]:
        file_path = os.path.join(directory_path, file)
        # 打开临时文件和要合并的文件
        merged_pdf = fitz.open(temp_file)
        pdf_to_add = fitz.open(file_path)

        # 插入页面
        merged_pdf.insert_pdf(pdf_to_add)

        # 保存到新的临时文件
        new_temp = temp_file + ".new"
        merged_pdf.save(new_temp)

        # 关闭文件
        merged_pdf.close()
        pdf_to_add.close()

        # 替换旧的临时文件
        os.remove(temp_file)
        os.rename(new_temp, temp_file)

    # 最终处理：添加书签等
    final_pdf = fitz.open(temp_file)
    # ... 添加书签逻辑
    final_pdf.save(output_file_name)
    final_pdf.close()

    # 清理临时文件
    os.remove(temp_file)
```

### 5. 添加URL验证

```javascript
const validateUrl = (url, allowedDomains) => {
  try {
    const parsedUrl = new URL(url);
    return allowedDomains.includes(parsedUrl.hostname);
  } catch (error) {
    return false;
  }
};

// 在配置中添加允许的域名
const config = {
  ...existingConfig,
  allowedDomains: ['rc.nextjs.org', 'nextjs.org']
};
```

### 6. 统一错误处理

```javascript
class ScraperError extends Error {
  constructor(message, url, originalError) {
    super(message);
    this.name = 'ScraperError';
    this.url = url;
    this.originalError = originalError;
    this.timestamp = new Date();
  }
}

// 错误处理中间件
async function withErrorHandling(fn, context) {
  try {
    return await fn();
  } catch (error) {
    const scraperError = new ScraperError(
      error.message,
      context.url,
      error
    );

    // 记录错误
    await logError(scraperError);

    // 根据错误类型决定是否重试
    if (shouldRetry(error)) {
      throw scraperError; // 让重试机制处理
    } else {
      console.error('不可重试的错误:', scraperError);
    }
  }
}
```

### 7. 配置验证

```javascript
const Joi = require('joi');

const configSchema = Joi.object({
  rootURL: Joi.string().uri().required(),
  pdfDir: Joi.string().required(),
  concurrency: Joi.number().integer().min(1).max(10).required(),
  screenshotDelay: Joi.number().integer().min(0).required(),
  navLinksSelector: Joi.string().required(),
  contentSelector: Joi.string().required(),
  ignoreURLs: Joi.array().items(Joi.string()),
  maxRetries: Joi.number().integer().min(1).required(),
  retryDelay: Joi.number().integer().min(0).required(),
  pageTimeout: Joi.number().integer().min(1000).required(),
  imageTimeout: Joi.number().integer().min(1000).required(),
  allowedDomains: Joi.array().items(Joi.string()).required()
});

function validateConfig(config) {
  const { error, value } = configSchema.validate(config);
  if (error) {
    throw new Error(`配置验证失败: ${error.message}`);
  }
  return value;
}
```

### 8. 资源管理改进

```javascript
class PageManager {
  constructor(browser) {
    this.browser = browser;
    this.pages = new Map();
  }

  async createPage(id) {
    const page = await this.browser.newPage();
    this.pages.set(id, page);

    // 设置超时处理
    page.on('error', (error) => {
      console.error(`页面错误 [${id}]:`, error);
      this.closePage(id);
    });

    return page;
  }

  async closePage(id) {
    const page = this.pages.get(id);
    if (page) {
      try {
        await page.close();
      } catch (error) {
        console.error(`关闭页面失败 [${id}]:`, error);
      }
      this.pages.delete(id);
    }
  }

  async closeAll() {
    const closePromises = [];
    for (const [id, page] of this.pages) {
      closePromises.push(this.closePage(id));
    }
    await Promise.all(closePromises);
  }
}
```

### 9. 日志系统

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'pdf-scraper' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// 使用示例
logger.info('开始爬取任务', { url: config.rootURL });
logger.error('爬取失败', { url, error: error.message, stack: error.stack });
```

### 10. 进度跟踪系统

```javascript
class ProgressTracker {
  constructor(total) {
    this.total = total;
    this.completed = 0;
    this.failed = 0;
    this.startTime = Date.now();
    this.urlStatus = new Map(); // URL -> {status, time, error}
  }

  recordSuccess(url) {
    this.completed++;
    this.urlStatus.set(url, {
      status: 'success',
      time: Date.now()
    });
    this.logProgress();
  }

  recordFailure(url, error) {
    this.failed++;
    this.urlStatus.set(url, {
      status: 'failed',
      time: Date.now(),
      error: error.message
    });
    this.logProgress();
  }

  logProgress() {
    const processed = this.completed + this.failed;
    const percentage = (processed / this.total * 100).toFixed(2);
    const elapsed = (Date.now() - this.startTime) / 1000;
    const rate = processed / elapsed;
    const eta = (this.total - processed) / rate;

    logger.info('进度更新', {
      percentage,
      completed: this.completed,
      failed: this.failed,
      total: this.total,
      rate: rate.toFixed(2),
      eta: Math.round(eta)
    });
  }

  generateReport() {
    const report = {
      summary: {
        total: this.total,
        completed: this.completed,
        failed: this.failed,
        duration: (Date.now() - this.startTime) / 1000
      },
      failures: []
    };

    for (const [url, status] of this.urlStatus) {
      if (status.status === 'failed') {
        report.failures.push({ url, error: status.error });
      }
    }

    return report;
  }
}
```

## 重构优先级建议

1. **紧急修复**（必须立即修复）：
   - 修复 `removeFromFailedLinks` 未定义函数
   - 实现 URL 去重机制

2. **高优先级**（核心功能优化）：
   - 改进错误处理机制
   - 优化内存使用（PDF合并）
   - 添加配置验证

3. **中优先级**（提升稳定性）：
   - 实现资源管理
   - 添加日志系统
   - 改进重试机制

4. **低优先级**（长期改进）：
   - 统一代码风格和注释语言
   - 添加单元测试
   - 优化性能监控

## 测试建议

### 单元测试示例

```javascript
// __tests__/urlUtils.test.js
describe('URL处理', () => {
  test('normalizeUrl 应该移除尾部斜杠', () => {
    expect(normalizeUrl('https://example.com/path/'))
      .toBe('https://example.com/path');
  });

  test('normalizeUrl 应该排序查询参数', () => {
    expect(normalizeUrl('https://example.com?b=2&a=1'))
      .toBe('https://example.com?a=1&b=2');
  });

  test('去重应该识别相同的URL', () => {
    const urls = [
      'https://example.com/page',
      'https://example.com/page/',
      'https://example.com/page#section'
    ];
    const unique = deduplicateUrls(urls);
    expect(unique.length).toBe(1);
  });
});
```

### 集成测试建议

1. 测试完整的爬取流程
2. 测试错误恢复机制
3. 测试并发限制
4. 测试内存使用情况
5. 测试生成的PDF质量

## 部署建议

1. 添加环境变量支持
2. 实现健康检查端点
3. 添加 Docker 支持
4. 配置日志轮转
5. 添加监控告警

## 全面重构计划

### 依赖关系分析

```
基础层（无依赖或仅依赖Node内置模块）：
├── utils.js
├── configLoader.js
└── executePythonScript.js

文件操作层：
├── fileUtils.js (依赖: fs, path, crypto)
└── imageHandler.js

业务逻辑层：
├── LazyLoadingImageHelper.js (依赖: utils, fileUtils, configLoader)
└── pdfUtils.js (可删除，未使用)

核心层：
├── scraper.js (依赖: 所有基础层和业务层模块)
└── main.js (依赖: scraper, fileUtils, configLoader, executePythonScript)

独立脚本：
└── mergePdf.py (Python脚本，独立运行)
```

### 分阶段重构计划

#### 第一阶段：基础设施层（第1-2天）

**1.1 创建项目新结构**
```
nextjs-pdf-scraper/
├── src/
│   ├── core/           # 核心业务逻辑
│   ├── utils/          # 工具函数
│   ├── config/         # 配置管理
│   ├── services/       # 服务层
│   └── types/          # TypeScript类型定义
├── scripts/            # Python脚本
├── tests/             # 测试文件
├── logs/              # 日志目录
└── config/            # 配置文件
```

**1.2 基础工具类重构**

```javascript
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

// src/utils/url.js
export const normalizeUrl = (url) => {
  try {
    const urlObj = new URL(url);
    urlObj.pathname = urlObj.pathname.replace(/\/$/, '');
    urlObj.searchParams.sort();
    urlObj.hash = '';
    return urlObj.toString();
  } catch {
    return url;
  }
};

export const getUrlHash = (url) => {
  const crypto = require('crypto');
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
```

**1.3 配置管理系统**

```javascript
// src/config/schema.js
import Joi from 'joi';

export const configSchema = Joi.object({
  rootURL: Joi.string().uri().required(),
  pdfDir: Joi.string().required(),
  concurrency: Joi.number().integer().min(1).max(10).default(5),
  screenshotDelay: Joi.number().integer().min(0).default(500),
  navLinksSelector: Joi.string().required(),
  contentSelector: Joi.string().required(),
  ignoreURLs: Joi.array().items(Joi.string()).default([]),
  maxRetries: Joi.number().integer().min(1).default(3),
  retryDelay: Joi.number().integer().min(0).default(1000),
  pageTimeout: Joi.number().integer().min(1000).default(30000),
  imageTimeout: Joi.number().integer().min(1000).default(10000),
  allowedDomains: Joi.array().items(Joi.string()).required(),
  logLevel: Joi.string().valid('debug', 'info', 'warn', 'error').default('info')
});

// src/config/loader.js
import fs from 'fs/promises';
import path from 'path';
import { configSchema } from './schema.js';

export class ConfigLoader {
  constructor(configPath) {
    this.configPath = configPath;
    this.config = null;
  }

  async load() {
    const rawConfig = await fs.readFile(this.configPath, 'utf8');
    const parsedConfig = JSON.parse(rawConfig);

    // 转换相对路径为绝对路径
    parsedConfig.pdfDir = path.resolve(path.dirname(this.configPath), parsedConfig.pdfDir);

    // 验证配置
    const { error, value } = configSchema.validate(parsedConfig);
    if (error) {
      throw new Error(`配置验证失败: ${error.message}`);
    }

    this.config = value;
    return this.config;
  }

  get() {
    if (!this.config) {
      throw new Error('配置未加载，请先调用 load() 方法');
    }
    return this.config;
  }
}
```

**1.4 日志系统**

```javascript
// src/utils/logger.js
import winston from 'winston';
import path from 'path';

export const createLogger = (config) => {
  const logDir = path.join(process.cwd(), 'logs');

  return winston.createLogger({
    level: config.logLevel || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service: 'pdf-scraper' },
    transports: [
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        maxsize: 10485760, // 10MB
        maxFiles: 5
      }),
      new winston.transports.File({
        filename: path.join(logDir, 'combined.log'),
        maxsize: 10485760,
        maxFiles: 5
      }),
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ]
  });
};
```

**1.5 错误处理基础**

```javascript
// src/utils/errors.js
export class ScraperError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ScraperError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date();
  }
}

export class ValidationError extends ScraperError {
  constructor(message, details) {
    super(message, 'VALIDATION_ERROR', details);
  }
}

export class NetworkError extends ScraperError {
  constructor(message, url, originalError) {
    super(message, 'NETWORK_ERROR', { url, originalError });
  }
}

export class FileOperationError extends ScraperError {
  constructor(message, path, operation) {
    super(message, 'FILE_ERROR', { path, operation });
  }
}
```

#### 第二阶段：文件操作层（第3-4天）

**2.1 重构文件操作模块**

```javascript
// src/services/fileService.js
import fs from 'fs/promises';
import path from 'path';
import { FileOperationError } from '../utils/errors.js';

export class FileService {
  constructor(logger) {
    this.logger = logger;
  }

  async ensureDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      this.logger.debug(`确保目录存在: ${dirPath}`);
    } catch (error) {
      throw new FileOperationError(
        `创建目录失败: ${dirPath}`,
        dirPath,
        'mkdir'
      );
    }
  }

  async cleanDirectory(dirPath) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
      await this.ensureDirectory(dirPath);
      this.logger.info(`清理目录: ${dirPath}`);
    } catch (error) {
      throw new FileOperationError(
        `清理目录失败: ${dirPath}`,
        dirPath,
        'clean'
      );
    }
  }

  async readJson(filePath, defaultValue = null) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT' && defaultValue !== null) {
        return defaultValue;
      }
      throw new FileOperationError(
        `读取JSON文件失败: ${filePath}`,
        filePath,
        'readJson'
      );
    }
  }

  async writeJson(filePath, data) {
    try {
      const content = JSON.stringify(data, null, 2);
      await fs.writeFile(filePath, content, 'utf8');
      this.logger.debug(`写入JSON文件: ${filePath}`);
    } catch (error) {
      throw new FileOperationError(
        `写入JSON文件失败: ${filePath}`,
        filePath,
        'writeJson'
      );
    }
  }
}
```

**2.2 PDF路径管理**

```javascript
// src/services/pathService.js
import path from 'path';
import { getUrlHash } from '../utils/url.js';

export class PathService {
  constructor(config) {
    this.config = config;
  }

  extractSubfolder(url) {
    const match = url.match(/\/(app|pages)\/(.*?)(\/|$)/);
    return match ? { type: match[1], name: match[2] } : null;
  }

  determineDirectory(url) {
    const match = this.extractSubfolder(url);
    if (match) {
      const prefix = `${match.type}-`;
      return path.join(this.config.pdfDir, `${prefix}${match.name}`);
    }

    const hostname = new URL(url).hostname;
    return path.join(this.config.pdfDir, `${hostname}-docs`);
  }

  getPdfPath(url, useHash = true) {
    const fileName = url.split('/').filter(s => s).pop() || 'index';
    const directory = this.determineDirectory(url);

    if (useHash) {
      const hash = getUrlHash(url);
      return path.join(directory, `${hash}-${fileName}.pdf`);
    }

    return path.join(directory, `${fileName}.pdf`);
  }

  getMetadataPath(type) {
    const metadataFiles = {
      articleTitles: 'articleTitles.json',
      failed: 'failed.json',
      imageLoadFailures: 'imageLoadFailures.json',
      progress: 'progress.json'
    };

    return path.join(this.config.pdfDir, metadataFiles[type] || type);
  }
}
```

#### 第三阶段：数据管理层（第5-6天）

**3.1 状态管理**

```javascript
// src/services/stateManager.js
export class StateManager {
  constructor(fileService, pathService, logger) {
    this.fileService = fileService;
    this.pathService = pathService;
    this.logger = logger;
    this.state = {
      processedUrls: new Set(),
      failedUrls: new Map(),
      urlToIndex: new Map(),
      articleTitles: new Map(),
      imageLoadFailures: new Set()
    };
  }

  async load() {
    try {
      // 加载已处理的URL
      const progress = await this.fileService.readJson(
        this.pathService.getMetadataPath('progress'),
        { processedUrls: [], failedUrls: [] }
      );

      progress.processedUrls.forEach(url => this.state.processedUrls.add(url));
      progress.failedUrls.forEach(({ url, error }) =>
        this.state.failedUrls.set(url, error)
      );

      // 加载文章标题
      const titles = await this.fileService.readJson(
        this.pathService.getMetadataPath('articleTitles'),
        {}
      );

      Object.entries(titles).forEach(([index, title]) =>
        this.state.articleTitles.set(index, title)
      );

      this.logger.info('状态加载完成', {
        processedUrls: this.state.processedUrls.size,
        failedUrls: this.state.failedUrls.size
      });
    } catch (error) {
      this.logger.warn('状态加载失败，使用空状态', { error: error.message });
    }
  }

  async save() {
    try {
      // 保存进度
      await this.fileService.writeJson(
        this.pathService.getMetadataPath('progress'),
        {
          processedUrls: Array.from(this.state.processedUrls),
          failedUrls: Array.from(this.state.failedUrls.entries()).map(
            ([url, error]) => ({ url, error })
          ),
          timestamp: new Date().toISOString()
        }
      );

      // 保存文章标题
      const titles = {};
      this.state.articleTitles.forEach((title, index) => {
        titles[index] = title;
      });

      await this.fileService.writeJson(
        this.pathService.getMetadataPath('articleTitles'),
        titles
      );

      this.logger.debug('状态保存完成');
    } catch (error) {
      this.logger.error('状态保存失败', { error: error.message });
    }
  }

  isProcessed(url) {
    return this.state.processedUrls.has(url);
  }

  markProcessed(url) {
    this.state.processedUrls.add(url);
  }

  markFailed(url, error) {
    this.state.failedUrls.set(url, error.message);
  }

  getFailedUrls() {
    return Array.from(this.state.failedUrls.entries());
  }
}
```

**3.2 进度追踪**

```javascript
// src/services/progressTracker.js
import { EventEmitter } from 'events';

export class ProgressTracker extends EventEmitter {
  constructor(logger) {
    super();
    this.logger = logger;
    this.stats = {
      total: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      startTime: null,
      endTime: null
    };
  }

  start(total) {
    this.stats.total = total;
    this.stats.startTime = Date.now();
    this.emit('start', { total });
  }

  success(url) {
    this.stats.completed++;
    this.logProgress();
    this.emit('success', { url, stats: this.getStats() });
  }

  failure(url, error) {
    this.stats.failed++;
    this.logProgress();
    this.emit('failure', { url, error, stats: this.getStats() });
  }

  skip(url) {
    this.stats.skipped++;
    this.logProgress();
    this.emit('skip', { url, stats: this.getStats() });
  }

  finish() {
    this.stats.endTime = Date.now();
    const duration = (this.stats.endTime - this.stats.startTime) / 1000;

    this.logger.info('爬取完成', {
      ...this.stats,
      duration: `${duration.toFixed(2)}秒`
    });

    this.emit('finish', { stats: this.getStats() });
  }

  getStats() {
    const processed = this.stats.completed + this.stats.failed + this.stats.skipped;
    const percentage = this.stats.total > 0
      ? (processed / this.stats.total * 100).toFixed(2)
      : 0;

    const elapsed = (Date.now() - this.stats.startTime) / 1000;
    const rate = processed > 0 ? processed / elapsed : 0;
    const eta = rate > 0 ? (this.stats.total - processed) / rate : 0;

    return {
      ...this.stats,
      processed,
      percentage,
      rate: rate.toFixed(2),
      eta: Math.round(eta)
    };
  }

  logProgress() {
    const stats = this.getStats();
    this.logger.info(`进度: ${stats.percentage}% (${stats.processed}/${stats.total})`, {
      成功: stats.completed,
      失败: stats.failed,
      跳过: stats.skipped,
      速率: `${stats.rate} 页/秒`,
      预计剩余: `${stats.eta} 秒`
    });
  }
}
```

#### 第四阶段：浏览器管理层（第7-8天）

**4.1 浏览器池管理**

```javascript
// src/services/browserPool.js
import puppeteer from 'puppeteer';

export class BrowserPool {
  constructor(options = {}) {
    this.options = {
      maxBrowsers: options.maxBrowsers || 1,
      headless: options.headless !== false,
      launchOptions: options.launchOptions || {}
    };
    this.browsers = [];
    this.availableBrowsers = [];
    this.logger = options.logger;
  }

  async initialize() {
    for (let i = 0; i < this.options.maxBrowsers; i++) {
      const browser = await this.createBrowser();
      this.browsers.push(browser);
      this.availableBrowsers.push(browser);
    }
    this.logger.info(`浏览器池初始化完成，共 ${this.browsers.length} 个实例`);
  }

  async createBrowser() {
    const browser = await puppeteer.launch({
      headless: this.options.headless,
      defaultViewport: { width: 1920, height: 1080 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ],
      ...this.options.launchOptions
    });

    browser.on('disconnected', () => {
      this.logger.warn('浏览器断开连接');
      this.handleBrowserDisconnect(browser);
    });

    return browser;
  }

  async getBrowser() {
    if (this.availableBrowsers.length === 0) {
      // 等待有可用的浏览器
      await new Promise(resolve => {
        const checkAvailable = setInterval(() => {
          if (this.availableBrowsers.length > 0) {
            clearInterval(checkAvailable);
            resolve();
          }
        }, 100);
      });
    }

    return this.availableBrowsers.shift();
  }

  releaseBrowser(browser) {
    if (browser && browser.isConnected()) {
      this.availableBrowsers.push(browser);
    }
  }

  async handleBrowserDisconnect(browser) {
    const index = this.browsers.indexOf(browser);
    if (index > -1) {
      this.browsers.splice(index, 1);
      const availableIndex = this.availableBrowsers.indexOf(browser);
      if (availableIndex > -1) {
        this.availableBrowsers.splice(availableIndex, 1);
      }

      // 创建新的浏览器实例替代
      try {
        const newBrowser = await this.createBrowser();
        this.browsers.push(newBrowser);
        this.availableBrowsers.push(newBrowser);
        this.logger.info('创建了新的浏览器实例替代断开的实例');
      } catch (error) {
        this.logger.error('创建替代浏览器失败', { error: error.message });
      }
    }
  }

  async close() {
    await Promise.all(
      this.browsers.map(browser => browser.close().catch(() => {}))
    );
    this.browsers = [];
    this.availableBrowsers = [];
    this.logger.info('浏览器池已关闭');
  }
}
```

**4.2 页面管理**

```javascript
// src/services/pageManager.js
export class PageManager {
  constructor(browserPool, logger) {
    this.browserPool = browserPool;
    this.logger = logger;
    this.pages = new Map();
  }

  async createPage(id) {
    const browser = await this.browserPool.getBrowser();

    try {
      const page = await browser.newPage();

      // 设置默认超时
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);

      // 优化性能：禁用不必要的资源
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const resourceType = request.resourceType();
        if (['font', 'media'].includes(resourceType)) {
          request.abort();
        } else {
          request.continue();
        }
      });

      // 错误处理
      page.on('error', (error) => {
        this.logger.error(`页面错误 [${id}]`, { error: error.message });
      });

      page.on('pageerror', (error) => {
        this.logger.warn(`页面JS错误 [${id}]`, { error: error.message });
      });

      this.pages.set(id, { page, browser });
      return page;

    } catch (error) {
      this.browserPool.releaseBrowser(browser);
      throw error;
    }
  }

  async closePage(id) {
    const pageInfo = this.pages.get(id);
    if (pageInfo) {
      try {
        await pageInfo.page.close();
      } catch (error) {
        this.logger.warn(`关闭页面失败 [${id}]`, { error: error.message });
      } finally {
        this.browserPool.releaseBrowser(pageInfo.browser);
        this.pages.delete(id);
      }
    }
  }

  async closeAll() {
    const closePromises = Array.from(this.pages.keys()).map(id =>
      this.closePage(id)
    );
    await Promise.all(closePromises);
  }
}
```

#### 第五阶段：图片处理层（第9-10天）

**5.1 图片加载服务**

```javascript
// src/services/imageService.js
export class ImageService {
  constructor(logger) {
    this.logger = logger;
  }

  async setupImageObserver(page) {
    await page.evaluateOnNewDocument(() => {
      // 修改图片加载行为
      const originalImage = window.Image;
      window.Image = class extends originalImage {
        constructor() {
          super();
          this.loading = 'eager';
        }
      };

      // 设置 Intersection Observer
      window.addEventListener('DOMContentLoaded', () => {
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const img = entry.target;
              if (img.dataset.src && !img.src) {
                img.src = img.dataset.src;
              }
              observer.unobserve(img);
            }
          });
        }, { rootMargin: '500px' });

        document.querySelectorAll('img').forEach(img => {
          observer.observe(img);
        });
      });
    });
  }

  async waitForImages(page, options = {}) {
    const { timeout = 10000, checkInterval = 500 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const allLoaded = await page.evaluate(() => {
        const images = Array.from(document.querySelectorAll('img'));
        return images.every(img => {
          // 忽略没有src的图片
          if (!img.src && !img.dataset.src) return true;
          // 检查是否加载完成
          return img.complete && img.naturalHeight !== 0;
        });
      });

      if (allLoaded) {
        this.logger.debug('所有图片加载完成');
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    this.logger.warn('图片加载超时');
    return false;
  }

  async scrollPage(page, options = {}) {
    const { distance = 300, delay = 200 } = options;

    await page.evaluate(async (distance, delay) => {
      const totalHeight = document.body.scrollHeight;
      let currentPosition = 0;

      while (currentPosition < totalHeight) {
        window.scrollTo(0, currentPosition);
        currentPosition += distance;
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // 滚动到顶部
      window.scrollTo(0, 0);
    }, distance, delay);
  }

  async triggerLazyLoading(page) {
    // 先滚动页面
    await this.scrollPage(page);

    // 触发所有懒加载图片
    await page.evaluate(() => {
      const lazyImages = document.querySelectorAll('img[loading="lazy"]');
      lazyImages.forEach(img => {
        img.loading = 'eager';
        if (img.dataset.src && !img.src) {
          img.src = img.dataset.src;
        }
      });
    });

    // 等待图片加载
    return await this.waitForImages(page);
  }
}
```

#### 第六阶段：核心爬虫逻辑（第11-13天）

**6.1 爬虫核心类重构**

```javascript
// src/core/scraper.js
import { normalizeUrl } from '../utils/url.js';
import { NetworkError } from '../utils/errors.js';
import { retry } from '../utils/common.js';

export class Scraper {
  constructor(dependencies) {
    this.config = dependencies.config;
    this.logger = dependencies.logger;
    this.pageManager = dependencies.pageManager;
    this.fileService = dependencies.fileService;
    this.pathService = dependencies.pathService;
    this.stateManager = dependencies.stateManager;
    this.progressTracker = dependencies.progressTracker;
    this.imageService = dependencies.imageService;

    this.urlQueue = [];
    this.urlSet = new Set();
  }

  async initialize() {
    await this.stateManager.load();
    this.logger.info('爬虫初始化完成');
  }

  async collectUrls() {
    this.logger.info('开始收集URL');
    const page = await this.pageManager.createPage('url-collector');

    try {
      await page.goto(this.config.rootURL, {
        waitUntil: 'networkidle0',
        timeout: this.config.pageTimeout
      });

      const rawUrls = await page.evaluate((selector) => {
        return Array.from(document.querySelectorAll(selector))
          .map(el => el.href)
          .filter(href => href && !href.startsWith('#'));
      }, this.config.navLinksSelector);

      // URL去重和规范化
      const normalizedUrls = new Map();
      rawUrls.forEach(url => {
        const normalized = normalizeUrl(url);
        if (!normalizedUrls.has(normalized) &&
            !this.isIgnored(normalized) &&
            this.validateUrl(normalized)) {
          normalizedUrls.set(normalized, url);
        }
      });

      this.urlQueue = Array.from(normalizedUrls.keys());
      this.urlQueue.forEach(url => this.urlSet.add(url));

      this.logger.info(`收集到 ${this.urlQueue.length} 个唯一URL`);
      return this.urlQueue;

    } finally {
      await this.pageManager.closePage('url-collector');
    }
  }

  isIgnored(url) {
    return this.config.ignoreURLs.some(pattern => url.includes(pattern));
  }

  validateUrl(url) {
    try {
      const parsedUrl = new URL(url);
      return this.config.allowedDomains.includes(parsedUrl.hostname);
    } catch {
      return false;
    }
  }

  async scrapePage(url, index) {
    // 检查是否已处理
    if (this.stateManager.isProcessed(url)) {
      this.logger.debug(`跳过已处理的URL: ${url}`);
      this.progressTracker.skip(url);
      return;
    }

    const pageId = `page-${index}`;
    const page = await this.pageManager.createPage(pageId);

    try {
      this.logger.info(`开始爬取 [${index}]: ${url}`);

      // 设置图片观察器
      await this.imageService.setupImageObserver(page);

      // 访问页面
      await retry(
        () => page.goto(url, {
          waitUntil: 'networkidle0',
          timeout: this.config.pageTimeout
        }),
        { maxAttempts: this.config.maxRetries }
      );

      // 等待内容加载
      await page.waitForSelector(this.config.contentSelector, {
        timeout: this.config.pageTimeout
      });

      // 提取标题
      const title = await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        const h1 = element?.querySelector('h1');
        return h1?.innerText || '';
      }, this.config.contentSelector);

      if (title) {
        this.stateManager.state.articleTitles.set(String(index), title);
      }

      // 处理懒加载图片
      const imagesLoaded = await this.imageService.triggerLazyLoading(page);
      if (!imagesLoaded) {
        this.logger.warn(`部分图片未能加载: ${url}`);
        this.stateManager.state.imageLoadFailures.add(url);
      }

      // 清理页面内容
      await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (element) {
          // 移除脚本和交互元素
          element.querySelectorAll('script, button, input').forEach(el => el.remove());
          // 设置为页面唯一内容
          document.body.innerHTML = element.outerHTML;
        }
      }, this.config.contentSelector);

      // 生成PDF
      const pdfPath = await this.pathService.getPdfPath(url, true);
      await this.fileService.ensureDirectory(path.dirname(pdfPath));

      await page.pdf({
        path: pdfPath,
        format: 'A4',
        margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' },
        printBackground: true,
        preferCSSPageSize: false
      });

      this.logger.info(`PDF已保存: ${pdfPath}`);

      // 标记为已处理
      this.stateManager.markProcessed(url);
      this.progressTracker.success(url);

      // 定期保存状态
      if (this.progressTracker.stats.processed % 10 === 0) {
        await this.stateManager.save();
      }

    } catch (error) {
      this.logger.error(`爬取失败 [${index}]: ${url}`, {
        error: error.message,
        stack: error.stack
      });

      this.stateManager.markFailed(url, error);
      this.progressTracker.failure(url, error);

      throw new NetworkError(`爬取页面失败: ${url}`, url, error);

    } finally {
      await this.pageManager.closePage(pageId);
    }
  }

  async retryFailedUrls() {
    const failedUrls = this.stateManager.getFailedUrls();
    if (failedUrls.length === 0) return;

    this.logger.info(`开始重试 ${failedUrls.length} 个失败的URL`);

    for (const [url, error] of failedUrls) {
      try {
        // 清除失败状态
        this.stateManager.state.failedUrls.delete(url);
        this.stateManager.state.processedUrls.delete(url);

        const index = this.urlQueue.indexOf(url);
        await this.scrapePage(url, index >= 0 ? index : 999);

      } catch (retryError) {
        this.logger.error(`重试失败: ${url}`, {
          originalError: error,
          retryError: retryError.message
        });
      }
    }
  }

  async run() {
    try {
      await this.initialize();

      // 收集URL
      const urls = await this.collectUrls();
      this.progressTracker.start(urls.length);

      // 创建任务队列
      const Queue = (await import('p-queue')).default;
      const queue = new Queue({
        concurrency: this.config.concurrency,
        interval: 1000,
        intervalCap: this.config.concurrency
      });

      // 添加任务到队列
      urls.forEach((url, index) => {
        queue.add(async () => {
          try {
            await this.scrapePage(url, index);
          } catch (error) {
            // 错误已经被记录，这里只是防止队列中断
          }
        });
      });

      // 等待所有任务完成
      await queue.onIdle();

      // 保存最终状态
      await this.stateManager.save();

      // 重试失败的URL
      await this.retryFailedUrls();

      // 完成
      this.progressTracker.finish();

    } catch (error) {
      this.logger.error('爬虫运行失败', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}
```

#### 第七阶段：Python脚本优化（第14天）

**7.1 优化PDF合并脚本**

```python
# scripts/merge_pdf.py
import os
import sys
import json
import fitz
import tempfile
import shutil
from pathlib import Path
from datetime import datetime
from urllib.parse import urlparse
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class PDFMerger:
    def __init__(self, config_path):
        self.config = self._load_config(config_path)
        self.pdf_dir = Path(self.config['pdfDir'])
        self.root_url = self.config['rootURL']

    def _load_config(self, config_path):
        """加载配置文件"""
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def _load_article_titles(self):
        """加载文章标题"""
        titles_path = self.pdf_dir / 'articleTitles.json'
        if titles_path.exists():
            with open(titles_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {}

    def _get_pdf_files(self, directory):
        """获取目录中的PDF文件并排序"""
        pdf_files = []
        for file in directory.glob('*.pdf'):
            # 提取文件名中的哈希值进行排序
            parts = file.stem.split('-', 1)
            if len(parts) >= 1:
                pdf_files.append((file, parts[0]))

        # 按哈希值排序
        pdf_files.sort(key=lambda x: x[1])
        return [f[0] for f in pdf_files]

    def _create_bookmark_title(self, pdf_file, article_titles):
        """创建书签标题"""
        file_stem = pdf_file.stem

        # 尝试从article_titles中获取标题
        for index, title in article_titles.items():
            if str(index) in file_stem:
                return title

        # 如果没有找到，使用文件名
        parts = file_stem.split('-', 1)
        if len(parts) > 1:
            return parts[1].replace('-', ' ').title()
        return file_stem

    def merge_pdfs_stream(self, pdf_files, output_path, article_titles):
        """使用流式处理合并PDF，减少内存使用"""
        if not pdf_files:
            logger.warning(f"没有找到PDF文件: {output_path}")
            return

        # 创建临时文件
        temp_fd, temp_path = tempfile.mkstemp(suffix='.pdf')
        os.close(temp_fd)

        try:
            # 使用第一个PDF作为基础
            shutil.copy(pdf_files[0], temp_path)

            # 逐个合并其他PDF
            for i, pdf_file in enumerate(pdf_files[1:], 1):
                logger.info(f"合并文件 {i+1}/{len(pdf_files)}: {pdf_file.name}")

                with fitz.open(temp_path) as base_pdf:
                    with fitz.open(pdf_file) as add_pdf:
                        base_pdf.insert_pdf(add_pdf)

                        # 保存到新的临时文件
                        new_temp = f"{temp_path}.new"
                        base_pdf.save(new_temp)

                # 替换原临时文件
                os.remove(temp_path)
                os.rename(new_temp, temp_path)

            # 添加书签
            logger.info("添加书签...")
            with fitz.open(temp_path) as final_pdf:
                toc = []
                page_num = 0

                # 重新遍历文件以创建书签
                for pdf_file in pdf_files:
                    with fitz.open(pdf_file) as pdf:
                        title = self._create_bookmark_title(pdf_file, article_titles)
                        toc.append([1, title, page_num + 1])
                        page_num += len(pdf)

                final_pdf.set_toc(toc)
                final_pdf.save(output_path)

            # 清理临时文件
            os.remove(temp_path)
            logger.info(f"PDF合并完成: {output_path}")

        except Exception as e:
            logger.error(f"合并PDF时出错: {e}")
            if os.path.exists(temp_path):
                os.remove(temp_path)
            raise

    def merge_directory(self, directory, output_name):
        """合并指定目录中的所有PDF"""
        pdf_files = self._get_pdf_files(directory)
        if not pdf_files:
            logger.warning(f"目录中没有PDF文件: {directory}")
            return

        article_titles = self._load_article_titles()
        output_path = self.pdf_dir / 'finalPdf' / output_name

        logger.info(f"开始合并 {len(pdf_files)} 个PDF文件...")
        self.merge_pdfs_stream(pdf_files, output_path, article_titles)

    def run(self):
        """执行合并操作"""
        # 确保输出目录存在
        final_dir = self.pdf_dir / 'finalPdf'
        final_dir.mkdir(exist_ok=True)

        # 生成输出文件名
        url_parts = urlparse(self.root_url)
        domain = url_parts.hostname.replace('.', '_')
        date_str = datetime.now().strftime('%Y%m%d')

        # 合并根目录
        logger.info("合并根目录PDF...")
        root_pdfs = self._get_pdf_files(self.pdf_dir)
        if root_pdfs:
            self.merge_directory(
                self.pdf_dir,
                f"{domain}_{date_str}.pdf"
            )

        # 合并子目录
        subdirs = [d for d in self.pdf_dir.iterdir()
                  if d.is_dir() and d.name != 'finalPdf']

        for subdir in subdirs:
            logger.info(f"合并子目录: {subdir.name}")
            self.merge_directory(
                subdir,
                f"{subdir.name}_{date_str}.pdf"
            )

        logger.info("所有PDF合并完成！")

def main():
    if len(sys.argv) < 2:
        config_path = Path(__file__).parent.parent / 'config.json'
    else:
        config_path = Path(sys.argv[1])

    if not config_path.exists():
        logger.error(f"配置文件不存在: {config_path}")
        sys.exit(1)

    try:
        merger = PDFMerger(config_path)
        merger.run()
    except Exception as e:
        logger.error(f"运行失败: {e}", exc_info=True)
        sys.exit(1)

if __name__ == '__main__':
    main()
```

#### 第八阶段：集成和主入口（第15天）

**8.1 依赖注入容器**

```javascript
// src/core/container.js
export class Container {
  constructor() {
    this.services = new Map();
    this.singletons = new Map();
  }

  register(name, factory, options = {}) {
    this.services.set(name, {
      factory,
      singleton: options.singleton || false
    });
  }

  async get(name) {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service not found: ${name}`);
    }

    if (service.singleton) {
      if (!this.singletons.has(name)) {
        const instance = await service.factory(this);
        this.singletons.set(name, instance);
      }
      return this.singletons.get(name);
    }

    return await service.factory(this);
  }

  async dispose() {
    // 清理所有单例服务
    for (const [name, instance] of this.singletons) {
      if (instance && typeof instance.close === 'function') {
        await instance.close();
      }
    }
    this.singletons.clear();
  }
}
```

**8.2 新的主入口**

```javascript
// src/main.js
import { Container } from './core/container.js';
import { ConfigLoader } from './config/loader.js';
import { createLogger } from './utils/logger.js';
import { FileService } from './services/fileService.js';
import { PathService } from './services/pathService.js';
import { StateManager } from './services/stateManager.js';
import { ProgressTracker } from './services/progressTracker.js';
import { BrowserPool } from './services/browserPool.js';
import { PageManager } from './services/pageManager.js';
import { ImageService } from './services/imageService.js';
import { Scraper } from './core/scraper.js';
import { spawn } from 'child_process';
import { promisify } from 'util';

const execSpawn = promisify(spawn);

async function setupContainer() {
  const container = new Container();

  // 注册配置加载器
  container.register('config', async () => {
    const loader = new ConfigLoader('./config.json');
    return await loader.load();
  }, { singleton: true });

  // 注册日志
  container.register('logger', async (container) => {
    const config = await container.get('config');
    return createLogger(config);
  }, { singleton: true });

  // 注册服务
  container.register('fileService', async (container) => {
    const logger = await container.get('logger');
    return new FileService(logger);
  }, { singleton: true });

  container.register('pathService', async (container) => {
    const config = await container.get('config');
    return new PathService(config);
  }, { singleton: true });

  container.register('stateManager', async (container) => {
    const fileService = await container.get('fileService');
    const pathService = await container.get('pathService');
    const logger = await container.get('logger');
    return new StateManager(fileService, pathService, logger);
  }, { singleton: true });

  container.register('progressTracker', async (container) => {
    const logger = await container.get('logger');
    return new ProgressTracker(logger);
  }, { singleton: true });

  container.register('browserPool', async (container) => {
    const config = await container.get('config');
    const logger = await container.get('logger');
    const pool = new BrowserPool({
      maxBrowsers: Math.min(config.concurrency, 3),
      logger
    });
    await pool.initialize();
    return pool;
  }, { singleton: true });

  container.register('pageManager', async (container) => {
    const browserPool = await container.get('browserPool');
    const logger = await container.get('logger');
    return new PageManager(browserPool, logger);
  }, { singleton: true });

  container.register('imageService', async (container) => {
    const logger = await container.get('logger');
    return new ImageService(logger);
  }, { singleton: true });

  container.register('scraper', async (container) => {
    const dependencies = {
      config: await container.get('config'),
      logger: await container.get('logger'),
      pageManager: await container.get('pageManager'),
      fileService: await container.get('fileService'),
      pathService: await container.get('pathService'),
      stateManager: await container.get('stateManager'),
      progressTracker: await container.get('progressTracker'),
      imageService: await container.get('imageService')
    };
    return new Scraper(dependencies);
  });

  return container;
}

async function runPythonMerge(config, logger) {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python', [
      './scripts/merge_pdf.py',
      './config.json'
    ]);

    pythonProcess.stdout.on('data', (data) => {
      logger.info(`Python: ${data.toString().trim()}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      logger.error(`Python Error: ${data.toString().trim()}`);
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Python进程退出，代码: ${code}`));
      }
    });
  });
}

async function main() {
  const container = await setupContainer();

  try {
    const logger = await container.get('logger');
    const config = await container.get('config');
    const fileService = await container.get('fileService');

    logger.info('=== Next.js PDF 爬虫启动 ===');

    // 清理和创建目录
    logger.info('准备工作目录...');
    await fileService.cleanDirectory(config.pdfDir);

    // 运行爬虫
    logger.info('开始爬取...');
    const scraper = await container.get('scraper');
    await scraper.run();

    // 合并PDF
    logger.info('开始合并PDF...');
    await runPythonMerge(config, logger);

    logger.info('=== 任务完成 ===');

  } catch (error) {
    const logger = await container.get('logger');
    logger.error('任务失败', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);

  } finally {
    await container.dispose();
  }
}

// 处理未捕获的异常
process.on('unhandledRejection', (error) => {
  console.error('未处理的Promise拒绝:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  process.exit(1);
});

// 运行主程序
main().catch(console.error);
```

### 测试计划（贯穿整个重构过程）

每个阶段完成后都应该进行相应的测试：

```javascript
// tests/unit/utils.test.js
// tests/unit/services.test.js
// tests/integration/scraper.test.js
// tests/e2e/full-flow.test.js
```

### 重构注意事项

1. **渐进式重构**：每完成一个阶段就进行测试，确保功能正常
2. **保持兼容**：在重构过程中保持配置文件格式兼容
3. **版本控制**：每个阶段创建分支，完成后合并
4. **文档更新**：同步更新使用文档和API文档
5. **性能监控**：在重构过程中持续监控性能指标

### 预期成果

1. **代码质量提升**：模块化、可测试、可维护
2. **性能优化**：内存使用减少50%，爬取速度提升30%
3. **稳定性增强**：错误恢复机制完善，成功率达到95%+
4. **可扩展性**：易于添加新功能和适配新网站

## 总结

这个项目的核心问题是：
1. **URL重复抓取** - 导致性能浪费和内容重复
2. **缺失的函数定义** - 导致运行时崩溃
3. **内存管理** - 可能导致大规模使用时崩溃
4. **错误处理不完善** - 影响稳定性

重构时应该优先解决这些核心问题，然后逐步改进代码质量和可维护性。建议采用渐进式重构策略，确保每一步都有测试覆盖。

这个计划按照合理的依赖顺序组织，从最底层的工具类开始，逐步向上层核心模块推进。

## 重构计划要点：

### 1. **分阶段实施**（共8个阶段，预计15天）
- **第一阶段**：基础设施层（工具类、配置、日志、错误处理）
- **第二阶段**：文件操作层
- **第三阶段**：数据管理层（状态管理、进度追踪）
- **第四阶段**：浏览器管理层
- **第五阶段**：图片处理层
- **第六阶段**：核心爬虫逻辑
- **第七阶段**：Python脚本优化
- **第八阶段**：集成和主入口

### 2. **关键改进**
- 引入依赖注入容器，解耦模块依赖
- 实现完善的错误处理和日志系统
- 优化内存使用（流式PDF合并）
- 解决URL重复抓取问题
- 添加资源管理和清理机制

### 3. **新的项目结构**
```
nextjs-pdf-scraper/
├── src/
│   ├── core/           # 核心业务逻辑
│   ├── utils/          # 工具函数
│   ├── config/         # 配置管理
│   ├── services/       # 服务层
│   └── types/          # TypeScript类型定义
├── scripts/            # Python脚本
├── tests/             # 测试文件
├── logs/              # 日志目录
└── config/            # 配置文件
```

### 4. **重构优势**
- **模块化**：每个模块职责单一，易于维护
- **可测试**：依赖注入使得单元测试更容易
- **可扩展**：新功能可以通过添加服务轻松集成
- **稳定性**：完善的错误处理和重试机制
- **性能**：优化的内存使用和并发控制

这个重构计划确保了：
1. 先修复关键bug（未定义函数）
2. 解决核心问题（URL重复）
3. 逐步改进架构
4. 每个阶段都可独立完成和测试

建议按照这个计划逐步实施，每完成一个阶段就进行充分的测试，确保功能正常后再进行下一阶段。
