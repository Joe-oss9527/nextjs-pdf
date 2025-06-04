# 第六阶段：核心爬虫逻辑 - 使用指南

## 📋 概述

第六阶段完成了PDF爬虫项目的核心爬虫逻辑重构，实现了企业级的Scraper类，成功集成了前5阶段的所有服务层，提供了完整的PDF爬取功能。

## ✨ 核心特性

### 🏗️ 企业级架构
- **完整依赖注入**：集成11个服务类的松耦合架构
- **事件驱动设计**：基于EventEmitter的实时通信
- **分层错误处理**：多级错误处理和自动恢复
- **资源生命周期管理**：完整的资源创建、使用、清理流程

### 🚀 智能爬取功能
- **URL收集去重**：基于MD5哈希的高效去重机制
- **内容智能提取**：支持复杂选择器和多种内容格式
- **懒加载图片处理**：自动处理各种懒加载模式
- **高质量PDF生成**：支持自定义样式和布局

### 📊 性能与监控
- **并发控制**：基于p-queue的高性能任务队列
- **实时进度监控**：详细的进度统计和性能指标
- **状态持久化**：支持断点续传和状态恢复
- **自动重试机制**：智能的失败重试和错误处理

## 🚀 快速开始

### 1. 基本使用

```javascript
import { Scraper } from './src/core/scraper.js';
import { setupServices } from './demo-stage6.js';

// 初始化服务容器
const container = await setupServices();

// 创建爬虫实例
const scraper = new Scraper({
  config: container.get('config'),
  logger: container.get('logger'),
  browserPool: container.get('browserPool'),
  pageManager: container.get('pageManager'),
  fileService: container.get('fileService'),
  pathService: container.get('pathService'),
  metadataService: container.get('metadataService'),
  stateManager: container.get('stateManager'),
  progressTracker: container.get('progressTracker'),
  queueManager: container.get('queueManager'),
  imageService: container.get('imageService')
});

// 运行爬虫
await scraper.run();
```

### 2. 运行演示

```bash
# 运行完整演示
node demo-stage6.js

# 运行集成测试
node test-stage6-integration.js

# 运行单元测试  
npm test test-stage6.js
```

## ⚙️ 配置说明

### 基础配置

```javascript
const config = {
  // 爬取目标
  rootURL: 'https://example.com',           // 起始URL
  navLinksSelector: 'a.nav-link',           // 导航链接选择器
  contentSelector: '.main-content',         // 内容选择器
  
  // 路径配置
  outputDir: './output',                    // 输出目录
  pdfDir: './output/pdfs',                  // PDF文件目录
  
  // 性能配置
  pageTimeout: 30000,                       // 页面超时时间(ms)
  maxRetries: 3,                            // 最大重试次数
  concurrency: 3,                           // 并发数
  requestInterval: 1000,                    // 请求间隔(ms)
  
  // 过滤配置
  allowedDomains: ['example.com'],          // 允许的域名
  ignoreURLs: ['admin', 'login', /\.pdf$/], // 忽略的URL模式
  
  // 功能开关
  retryFailedUrls: true,                    // 是否重试失败的URL
  retryDelay: 2000,                         // 重试延迟(ms)
  logLevel: 'info'                          // 日志级别
};
```

### 高级配置

```javascript
const advancedConfig = {
  // 浏览器配置
  browserOptions: {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  },
  
  // PDF生成配置
  pdfOptions: {
    format: 'A4',
    margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' },
    printBackground: true,
    preferCSSPageSize: false
  },
  
  // 图片处理配置
  imageProcessing: {
    waitTimeout: 10000,                     // 图片加载等待时间
    scrollDelay: 500,                       // 滚动延迟
    maxScrollAttempts: 10                   // 最大滚动次数
  }
};
```

## 📖 API 参考

### Scraper 类

#### 构造函数
```javascript
new Scraper(dependencies)
```

**参数：**
- `dependencies` - 依赖服务对象，包含所有必需的服务实例

#### 主要方法

##### `async initialize()`
初始化爬虫，准备所有服务和资源。

##### `async collectUrls()`
收集目标网站的所有URL，返回去重后的URL列表。

```javascript
const urls = await scraper.collectUrls();
console.log(`收集到 ${urls.length} 个URL`);
```

##### `async scrapePage(url, index)`
爬取指定页面并生成PDF。

**参数：**
- `url` - 页面URL
- `index` - 页面索引

**返回：**
```javascript
{
  status: 'success' | 'skipped',
  title: '页面标题',
  pdfPath: '/path/to/generated.pdf',
  imagesLoaded: true
}
```

##### `async run()`
运行完整的爬取流程。

```javascript
await scraper.run();
```

##### `getStatus()`
获取爬虫当前状态。

```javascript
const status = scraper.getStatus();
console.log('爬虫状态:', status);
```

#### 控制方法

##### `async pause()` / `async resume()`
暂停和恢复爬虫运行。

```javascript
await scraper.pause();   // 暂停
await scraper.resume();  // 恢复
```

##### `async stop()`
停止爬虫运行。

```javascript
await scraper.stop();
```

##### `async cleanup()`
清理所有资源。

```javascript
await scraper.cleanup();
```

### 事件系统

Scraper类继承自EventEmitter，支持以下事件：

```javascript
// 初始化完成
scraper.on('initialized', () => {
  console.log('爬虫初始化完成');
});

// URL收集完成
scraper.on('urlsCollected', (data) => {
  console.log(`收集到 ${data.totalUrls} 个URL`);
});

// 页面爬取完成
scraper.on('pageScraped', (data) => {
  console.log(`页面爬取完成: ${data.url}`);
});

// 进度更新
scraper.on('progress', (stats) => {
  console.log(`进度: ${stats.processed}/${stats.total}`);
});

// 任务完成
scraper.on('completed', (data) => {
  console.log('爬取任务完成', data.stats);
});

// 错误处理
scraper.on('error', (error) => {
  console.error('爬虫错误:', error);
});
```

## 🧪 测试说明

### 运行测试

```bash
# 运行所有测试
npm test

# 运行集成测试
node test-stage6-integration.js

# 运行单元测试
npm test test-stage6.js
```

### 测试覆盖

- ✅ **爬虫初始化测试** - 验证服务正确初始化
- ✅ **URL验证功能测试** - 验证URL过滤和验证逻辑
- ✅ **服务集成测试** - 验证所有服务间的协作
- ✅ **事件系统测试** - 验证事件驱动架构
- ✅ **错误处理测试** - 验证错误处理和恢复机制
- ✅ **资源管理测试** - 验证资源生命周期管理
- ✅ **状态管理测试** - 验证状态持久化功能
- ✅ **性能指标测试** - 验证性能监控功能

## 🔧 故障排除

### 常见问题

#### 1. 初始化失败
```javascript
// 错误：服务依赖不完整
// 解决：确保所有必需的服务都已正确创建
const scraper = new Scraper({
  config,
  logger,
  browserPool,    // 必需
  pageManager,    // 必需
  fileService,    // 必需
  pathService,    // 必需
  metadataService,// 必需
  stateManager,   // 必需
  progressTracker,// 必需
  queueManager,   // 必需
  imageService    // 必需
});
```

#### 2. 页面爬取失败
```javascript
// 检查选择器是否正确
const config = {
  navLinksSelector: 'a[href]',      // 确保选择器匹配页面结构
  contentSelector: '.main-content'  // 确保内容选择器存在
};
```

#### 3. 内存使用过高
```javascript
// 降低并发数
const config = {
  concurrency: 1,        // 减少并发数
  requestInterval: 2000  // 增加请求间隔
};
```

#### 4. PDF生成失败
```javascript
// 检查输出目录权限
await fileService.ensureDirectory(config.outputDir);

// 检查页面内容是否加载完成
await page.waitForSelector(config.contentSelector, { timeout: 30000 });
```

### 调试技巧

#### 启用详细日志
```javascript
const config = {
  logLevel: 'debug'  // 启用调试日志
};
```

#### 监控事件
```javascript
scraper.on('pageScrapeFailed', (data) => {
  console.error('页面爬取失败:', data);
});
```

#### 检查状态
```javascript
setInterval(() => {
  const status = scraper.getStatus();
  console.log('当前状态:', status);
}, 5000);
```

## 📁 文件结构

```
src/
├── core/
│   └── scraper.js              # 核心爬虫类
├── services/                   # 服务层（前5阶段）
│   ├── fileService.js
│   ├── pathService.js
│   ├── metadataService.js
│   ├── stateManager.js
│   ├── progressTracker.js
│   ├── queueManager.js
│   ├── browserPool.js
│   ├── pageManager.js
│   └── imageService.js
├── utils/                      # 工具层
│   ├── common.js
│   ├── url.js
│   ├── logger.js
│   └── errors.js
└── config/                     # 配置层
    ├── schema.js
    └── loader.js

test-stage6.js                  # 单元测试
test-stage6-integration.js      # 集成测试
demo-stage6.js                  # 使用演示
```

## 🎯 下一步

第六阶段已圆满完成，接下来的计划：

1. **第七阶段**：Python脚本优化（PDF合并功能）
2. **第八阶段**：集成和主入口（完整工作流程）
3. **最终优化**：性能调优和部署准备

## 🤝 贡献

第六阶段重构已完成，为后续阶段提供了坚实的基础。核心爬虫逻辑具备了企业级的稳定性和扩展性。

---

**第六阶段重构 ✅ 完成**  
*企业级核心爬虫逻辑 - 功能完整，性能优秀，架构清晰*