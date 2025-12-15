# 可靠翻译与 PDF 生成方案

## 问题分析

### 当前问题根因
1. **翻译服务缺陷**：
   - 缓存键 bug（第36行有尾部空格导致缓存失效）
   - 20秒超时太短，Gemini API 经常超时
   - 无重试逻辑，单次超时中止所有后续批次
   - 并发控制使用 `Promise.race()` 存在缺陷

2. **PDF 生成问题**：
   - SVG 图表的坐标轴文字被错误提取
   - 翻译直接修改 DOM，失败后内容丢失
   - 无中间产物，调试困难

## 新架构：Scrape → Markdown → Translate → PDF

```
1. Puppeteer 爬取页面
2. 提取 contentSelector 中的 HTML
3. 转换 HTML 为 Markdown（使用 turndown）
4. 保存原始 Markdown 文件（.md）
5. 翻译 Markdown 内容（而非 DOM）
6. 保存翻译后的 Markdown（_translated.md）
7. 从 Markdown 生成 PDF（使用 md-to-pdf）
```

### 优势
- Markdown 作为持久化产物，可随时重新生成 PDF
- 翻译基于纯文本，比 HTML 更干净可靠
- 任意阶段失败不丢失前序工作
- 可手动编辑 Markdown 修正问题
- 更适合 LLM 翻译（更简洁的输入）

---

## 实施计划

### Phase 1: 修复 TranslationService 关键 Bug

**文件**: `src/services/translationService.js`

#### 1.1 修复缓存键 bug（第36行）
```javascript
// 修复前（有 bug）
return crypto.createHash('md5').update(`${this.targetLanguage}:${text} `).digest('hex');

// 修复后
return crypto.createHash('md5').update(`${this.targetLanguage}:${text}`).digest('hex');
```

- 缓存键应同时包含 `targetLanguage` 和翻译模式（例如 `bilingual`），避免不同模式的结果相互污染。

#### 1.2 增加超时和重试配置
- 超时从 20s 增加到 60s（可配置）
- 添加重试逻辑（3次重试，指数退避）
- 使用 `p-limit` 替代有缺陷的 `Promise.race()` 并发控制

#### 1.3 新增 `translateMarkdown()` 方法
- 解析 Markdown 为可翻译块（保留代码块、frontmatter 不翻译）
- 批量翻译文本块
- 重组翻译后的 Markdown
- 支持双语模式

- 设计分块策略：尊重段落/标题/代码块边界，控制单次请求大小，避免超出模型上下文限制。

---

### Phase 2: 创建 MarkdownService

**新文件**: `src/services/markdownService.js`

**功能**：
- `convertHtmlToMarkdown(html, options)` - HTML 转 Markdown
- `extractAndConvertPage(page, selector)` - 从 Puppeteer 页面提取并转换
- `addFrontmatter(markdown, metadata)` - 添加 YAML frontmatter
- `parseFrontmatter(markdown)` - 解析 frontmatter

**依赖库**: `turndown` (npm)

**特殊处理**：
- 保留代码块语言标识
- 处理 SVG 图表（提取文本内容）
- 保留图片引用

---

### Phase 3: 创建 MarkdownToPdfService

**新文件**: `src/services/markdownToPdfService.js`

**功能**：
- `convertToPdf(markdownPath, outputPath, options)` - 文件转换
- `convertContentToPdf(markdownContent, outputPath, options)` - 内容转换

**依赖库**: `md-to-pdf` (npm)

**配置选项**：
- 自定义样式表
- 代码高亮主题（默认 github）
- PDF 格式和边距
- 代码换行处理
- 确认在 ESM 环境下的引入方式（`import` 或 `createRequire`），并通过测试验证。

---

### Phase 4: 更新配置验证

**文件**: `src/config/configValidator.js`

新增配置项：
```javascript
// Markdown 转换配置
markdown: {
  enabled: boolean,            // 是否启用
  outputDir: string,           // 输出目录（默认 'markdown'）
  includeFrontmatter: boolean  // 是否包含 frontmatter
}

// Markdown 转 PDF 配置
markdownPdf: {
  enabled: boolean,            // 使用 md-to-pdf 而非 Puppeteer
  stylesheet: string,          // 自定义 CSS
  highlightStyle: string,      // 代码高亮主题
  pdfOptions: {                // 透传给 md-to-pdf 的 PDF 选项
    format: string,           // 纸张格式（例如 'A4'）
    margin: string            // 页边距（例如 '20mm'）
  }
}

// 翻译配置
translation: {
  enabled: boolean,            // 是否启用翻译
  bilingual: boolean,          // 是否输出双语
  targetLanguage: string,      // 目标语言（例如 'Chinese'）
  concurrency: number,         // 并发请求数
  timeout: number,             // 超时时间（默认 60000ms）
  maxRetries: number,          // 重试次数（默认 3）
  retryDelay: number           // 重试延迟（默认 2000ms）
}
```

---

### Phase 5: 服务注册

**文件**: `src/core/setup.js`

注册新服务：
```javascript
container.register('markdownService', ...);
container.register('markdownToPdfService', ...);
```

更新 Scraper 依赖注入。

---

### Phase 6: Scraper 集成

**文件**: `src/core/scraper.js`

新增 `scrapePageWithMarkdown()` 方法：
1. 导航和内容加载（复用现有逻辑）
2. 调用 `markdownService.extractAndConvertPage()`
3. 保存原始 Markdown
4. 调用 `translationService.translateMarkdown()`
5. 保存翻译后的 Markdown
6. 调用 `markdownToPdfService.convertContentToPdf()` 或回退到 Puppeteer PDF

修改 `run()` 方法：根据配置选择工作流。

---

### Phase 7: 测试

新增测试文件：
- `tests/services/markdownService.test.js`
- `tests/services/markdownToPdfService.test.js`
- `tests/integration/markdownWorkflow.test.js`

更新现有测试：
- `tests/services/translationService.test.js` - 验证 bug 修复

---

## 文件变更清单

### 新建文件 (4)
| 文件 | 描述 |
|------|------|
| `src/services/markdownService.js` | HTML 转 Markdown 服务 |
| `src/services/markdownToPdfService.js` | Markdown 转 PDF 服务 |
| `tests/services/markdownService.test.js` | MarkdownService 单元测试 |
| `tests/services/markdownToPdfService.test.js` | MarkdownToPdfService 单元测试 |

### 修改文件 (5)
| 文件 | 变更内容 |
|------|----------|
| `src/services/translationService.js` | 修复 bug、添加重试、新增 translateMarkdown() |
| `src/config/configValidator.js` | 新增配置 schema |
| `src/core/setup.js` | 注册新服务 |
| `src/core/scraper.js` | 新增 scrapePageWithMarkdown() |
| `package.json` | 添加依赖 |

### 新增依赖 (3)
```json
{
  "turndown": "^7.1.2",
  "md-to-pdf": "^5.2.4",
  "p-limit": "^5.0.0"
}
```

---

## 配置示例

```json
{
  "markdown": {
    "enabled": true,
    "outputDir": "markdown",
    "includeFrontmatter": true
  },
  "markdownPdf": {
    "enabled": true,
    "highlightStyle": "github",
    "pdfOptions": {
      "format": "A4",
      "margin": "20mm"
    }
  },
  "translation": {
    "enabled": true,
    "bilingual": true,
    "targetLanguage": "Chinese",
    "concurrency": 2,
    "timeout": 60000,
    "maxRetries": 3,
    "retryDelay": 2000
  }
}
```

---

## 输出产物示例

```
pdfs/
├── markdown/
│   ├── 000-introduction.md           # 原始 Markdown
│   ├── 000-introduction_translated.md # 翻译后 Markdown
│   ├── 001-getting-started.md
│   └── 001-getting-started_translated.md
├── 000-introduction.pdf              # 最终 PDF
├── 001-getting-started.pdf
└── metadata/
    └── articleTitles.json
```

---

## 用户确认的决定

- **回退策略**: 保留 Puppeteer PDF 作为回退选项（md-to-pdf 失败时自动回退）
- **翻译方式**: 翻译 Markdown 文本（新方案），不翻译 DOM

---

## 实施顺序

1. **Phase 1**: 修复 TranslationService bug（最关键，当前系统不稳定的根因）
2. **Phase 2**: 创建 MarkdownService
3. **Phase 3**: 创建 MarkdownToPdfService
4. **Phase 4**: 更新 configValidator.js（必须先定义 schema）
5. **Phase 5**: 更新 setup.js 注册服务
6. **Phase 6**: 更新 Scraper 集成新工作流（包含回退逻辑）
7. **Phase 7**: 添加测试，运行 `make test` 确保 516+ 测试通过
8. **Phase 8**: 集成测试，用实际 URL 验证

---

## 参考文档

- [Gemini CLI 官方文档](https://github.com/google-gemini/gemini-cli)
- [md-to-pdf npm](https://github.com/simonhaenisch/md-to-pdf)
- [turndown HTML-to-Markdown](https://github.com/mixmark-io/turndown)
- [Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits)
