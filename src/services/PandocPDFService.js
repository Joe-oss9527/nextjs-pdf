import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { createLogger } from '../utils/logger.js';
import { ValidationError, ProcessingError } from '../utils/errors.js';

/**
 * Pandoc PDF生成服务
 * 使用Pandoc + weasyprint将HTML转换为高质量PDF
 */
export class PandocPDFService {
  constructor(config, fileService, pathService) {
    this.config = config;
    this.fileService = fileService;
    this.pathService = pathService;
    this.logger = createLogger('PandocPDFService');
    this.pandocConfig = config.pdf?.pandoc || {};
    
    // 默认配置
    this.defaults = {
      pdfEngine: 'weasyprint',
      cssFile: 'src/styles/pdf.css',
      options: ['--standalone', '--self-contained']
    };
  }

  /**
   * 检查Pandoc和weasyprint依赖
   */
  async checkDependencies() {
    try {
      this.logger.debug('检查Pandoc依赖...');
      
      // 检查pandoc
      const pandocVersion = await this.runCommand('pandoc', ['--version']);
      const pandocMatch = pandocVersion.match(/pandoc\s+([\d.]+)/);
      
      // 检查weasyprint - 使用虚拟环境路径
      const weasyprintCmd = this.getWeasyprintCommand();
      const weasyprintVersion = await this.runCommand(weasyprintCmd, ['--version']);
      const weasyprintMatch = weasyprintVersion.match(/WeasyPrint\s+([\d.]+)/);

      const result = {
        available: true,
        pandoc: {
          version: pandocMatch ? pandocMatch[1] : 'unknown',
          available: true
        },
        weasyprint: {
          version: weasyprintMatch ? weasyprintMatch[1] : 'unknown', 
          available: true,
          command: weasyprintCmd
        }
      };
      
      this.logger.debug('依赖检查成功', { 
        pandocVersion: pandocMatch?.[1] || 'unknown',
        weasyprintVersion: weasyprintMatch?.[1] || 'unknown'
      });
      return result;
      
    } catch (error) {
      this.logger.error('Pandoc或weasyprint依赖检查失败', { 
        error: error.message
      });
      
      const result = {
        available: false,
        error: error.message,
        pandoc: { available: false },
        weasyprint: { available: false }
      };
      
      return result;
    }
  }

  /**
   * 获取weasyprint命令路径
   */
  getWeasyprintCommand() {
    // 首先尝试虚拟环境路径
    const pythonExec = this.config.python?.executable || './venv/bin/python';
    if (pythonExec.includes('venv')) {
      const venvDir = pythonExec.substring(0, pythonExec.lastIndexOf('/'));
      return `${venvDir}/weasyprint`;
    }
    
    // 回退到系统命令
    return 'weasyprint';
  }

  /**
   * 运行命令行工具
   */
  async runCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        ...options
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Failed to start command: ${error.message}`));
      });
    });
  }

  /**
   * 准备PDF生成的CSS样式文件
   */
  async prepareCSSFile() {
    const cssPath = this.pandocConfig.cssFile || this.defaults.cssFile;
    const fullCssPath = path.resolve(cssPath);
    
    try {
      // 检查CSS文件是否存在
      await fs.access(fullCssPath);
      this.logger.debug('使用现有CSS文件', { cssPath: fullCssPath });
      return fullCssPath;
    } catch (error) {
      // 如果CSS文件不存在，创建默认的
      this.logger.info('CSS文件不存在，创建默认样式', { cssPath: fullCssPath });
      
      // 确保目录存在
      const cssDir = path.dirname(fullCssPath);
      await fs.mkdir(cssDir, { recursive: true });
      
      // 创建默认CSS
      const defaultCSS = this.getDefaultPandocCSS();
      await fs.writeFile(fullCssPath, defaultCSS, 'utf-8');
      
      this.logger.info('默认CSS文件已创建', { cssPath: fullCssPath });
      return fullCssPath;
    }
  }

  /**
   * 获取默认的Pandoc PDF样式
   */
  getDefaultPandocCSS() {
    return `
/* Pandoc PDF专用样式 - 针对weasyprint优化 */

@page {
  size: A4;
  margin: 2cm 1.5cm;
  
  @top-center {
    content: "Next.js 文档";
    font-size: 9pt;
    color: #666;
  }
  
  @bottom-center {
    content: counter(page) " / " counter(pages);
    font-size: 9pt;
    color: #666;
  }
}

/* 基础文档样式 */
html {
  font-family: 'Source Sans Pro', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 11pt;
  line-height: 1.6;
  color: #2d3748;
}

body {
  margin: 0;
  padding: 0;
}

/* 标题样式 */
h1, h2, h3, h4, h5, h6 {
  font-weight: 600;
  line-height: 1.25;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  page-break-after: avoid;
  color: #1a202c;
}

h1 {
  font-size: 1.8em;
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 0.3em;
  page-break-before: always;
}

h2 {
  font-size: 1.5em;
  color: #2b6cb0;
}

h3 {
  font-size: 1.3em;
  color: #3182ce;
}

h4 {
  font-size: 1.1em;
  color: #4299e1;
}

/* 段落和文本 */
p {
  margin: 0.8em 0;
  text-align: justify;
  orphans: 3;
  widows: 3;
}

/* 代码块样式 - 专门优化 */
pre {
  background-color: #f7fafc !important;
  border: 1px solid #e2e8f0 !important;
  border-left: 4px solid #4299e1 !important;
  border-radius: 6px;
  padding: 1em !important;
  margin: 1.2em 0 !important;
  font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important;
  font-size: 9pt !important;
  line-height: 1.4 !important;
  color: #2d3748 !important;
  white-space: pre-wrap !important;
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
  page-break-inside: avoid;
  max-width: 100%;
}

code {
  font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important;
  font-size: 9pt !important;
  background-color: #edf2f7 !important;
  color: #4a5568 !important;
  padding: 0.2em 0.4em !important;
  border-radius: 3px !important;
  word-wrap: break-word;
}

pre code {
  background-color: transparent !important;
  padding: 0 !important;
  border-radius: 0 !important;
  color: inherit !important;
}

/* 语法高亮保持 */
.sourceCode .kw { color: #007020; font-weight: bold; } /* Keyword */
.sourceCode .dt { color: #902000; } /* DataType */  
.sourceCode .dv { color: #40a070; } /* DecVal */
.sourceCode .bn { color: #40a070; } /* BaseN */
.sourceCode .fl { color: #40a070; } /* Float */
.sourceCode .ch { color: #4070a0; } /* Char */
.sourceCode .st { color: #4070a0; } /* String */
.sourceCode .co { color: #60a0b0; font-style: italic; } /* Comment */
.sourceCode .ot { color: #007020; } /* Other */
.sourceCode .al { color: #ff0000; font-weight: bold; } /* Alert */
.sourceCode .fu { color: #06287e; } /* Function */
.sourceCode .er { color: #ff0000; font-weight: bold; } /* Error */

/* 引用块 */
blockquote {
  margin: 1em 0;
  padding: 0.5em 1em;
  border-left: 4px solid #bee3f8;
  background-color: #ebf8ff;
  color: #2c5282;
  font-style: italic;
  page-break-inside: avoid;
}

/* 列表样式 */
ul, ol {
  margin: 1em 0;
  padding-left: 1.5em;
}

li {
  margin: 0.3em 0;
}

/* 表格样式 */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.2em 0;
  font-size: 10pt;
  page-break-inside: avoid;
}

th, td {
  border: 1px solid #cbd5e0;
  padding: 0.5em 0.8em;
  text-align: left;
  word-wrap: break-word;
}

th {
  background-color: #edf2f7;
  font-weight: 600;
  color: #2d3748;
}

tr:nth-child(even) {
  background-color: #f7fafc;
}

/* 链接样式 */
a {
  color: #3182ce;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

/* 图片样式 */
img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1em auto;
  page-break-inside: avoid;
}

/* 分隔线 */
hr {
  border: none;
  border-top: 1px solid #e2e8f0;
  margin: 2em 0;
}

/* 强调文本 */
strong, b {
  font-weight: 600;
  color: #1a202c;
}

em, i {
  font-style: italic;
  color: #4a5568;
}

/* 避免页面分割 */
.keep-together {
  page-break-inside: avoid;
}

/* 目录样式 */
.toc {
  page-break-after: always;
  margin-bottom: 2em;
}

.toc ul {
  list-style: none;
  padding-left: 0;
}

.toc a {
  text-decoration: none;
  color: #2d3748;
}

.toc a:hover {
  color: #3182ce;
}
`;
  }

  /**
   * 从页面提取原始样式
   * @param {Page} page - Puppeteer页面对象
   */
  async extractOriginalStyles(page) {
    try {
      const extractedStyles = await page.evaluate(() => {
        const styles = [];
        
        // 获取所有内联样式
        const inlineStyles = Array.from(document.querySelectorAll('style')).map(el => el.textContent);
        
        // 获取所有外部样式表的CSS规则
        const externalStyles = [];
        for (const sheet of document.styleSheets) {
          try {
            if (sheet.cssRules) {
              const rules = Array.from(sheet.cssRules).map(rule => rule.cssText);
              externalStyles.push(...rules);
            }
          } catch (e) {
            // 跨域样式表可能无法访问，忽略错误
          }
        }
        
        return {
          inline: inlineStyles.join('\n'),
          external: externalStyles.join('\n'),
          computed: getComputedStyle(document.body).cssText
        };
      });
      
      this.logger.debug('提取原始样式完成', {
        inlineLength: extractedStyles.inline.length,
        externalLength: extractedStyles.external.length
      });
      
      return extractedStyles;
    } catch (error) {
      this.logger.warn('提取原始样式失败', { error: error.message });
      return { inline: '', external: '', computed: '' };
    }
  }

  /**
   * 创建增强的HTML内容，包含原始样式和PDF优化样式
   * @param {string} htmlContent - 原始HTML内容
   * @param {Object} originalStyles - 提取的原始样式
   */
  async createEnhancedHTML(htmlContent, originalStyles = {}) {
    const pdfCSS = await this.getEnhancedPDFCSS();
    
    // 构建完整的HTML文档
    const enhancedHTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PDF Document</title>
  
  <!-- 原始页面样式 -->
  <style id="original-inline-styles">
    ${originalStyles.inline || ''}
  </style>
  
  <style id="original-external-styles">
    ${originalStyles.external || ''}
  </style>
  
  <!-- PDF优化样式 - 覆盖和增强原始样式 -->
  <style id="pdf-enhancement-styles">
    ${pdfCSS}
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;

    return enhancedHTML;
  }

  /**
   * 获取增强的PDF样式 - 基于原始样式进行优化而非完全替换
   */
  async getEnhancedPDFCSS() {
    return `
/* PDF增强样式 - 基于原始网页样式的优化 */

/* === 页面设置保持不变 === */
@page {
  size: A4;
  margin: 2.5cm 2cm;
  
  @top-center {
    content: "Next.js Documentation";
    font-size: 9pt;
    color: #64748b;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  }
  
  @bottom-center {
    content: "Page " counter(page) " of " counter(pages);
    font-size: 9pt;
    color: #64748b;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  }
}

/* === 基础打印优化 - 不覆盖原始样式，只做必要调整 === */
* {
  -webkit-print-color-adjust: exact !important;
  color-adjust: exact !important;
}

/* === 深色主题强制转换为浅色 - 保持原有布局 === */
[data-theme="dark"], 
.dark, 
.dark-mode,
.theme-dark,
html[data-theme="dark"],
body[data-theme="dark"] {
  background-color: #ffffff !important;
  color: #1f2937 !important;
}

/* === 代码块样式优化 - 保留原始高亮，优化打印效果 === */
pre, 
pre[class*="language-"], 
pre[class*="hljs"],
.highlight pre,
.code-block,
.CodeMirror {
  /* 保持原始背景色，但确保足够浅以便打印 */
  background-color: #f8fafc !important;
  color: #1e293b !important;
  
  /* 优化打印效果 */
  border: 1px solid #e2e8f0 !important;
  border-radius: 6px !important;
  padding: 1em !important;
  margin: 1.2em 0 !important;
  
  /* 改善字体和换行 */
  font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', 'Courier New', monospace !important;
  font-size: 10pt !important;
  line-height: 1.4 !important;
  
  /* 防止代码溢出 */
  white-space: pre-wrap !important;
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
  page-break-inside: avoid !important;
  max-width: 100% !important;
}

/* 内联代码优化 */
code:not(pre code) {
  background-color: #f1f5f9 !important;
  color: #475569 !important;
  padding: 0.1em 0.3em !important;
  border-radius: 3px !important;
  font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important;
  font-size: 0.9em !important;
  word-wrap: break-word !important;
}

/* 代码块内的code元素重置 */
pre code {
  background-color: transparent !important;
  padding: 0 !important;
  border-radius: 0 !important;
  font-size: inherit !important;
  color: inherit !important;
}

/* === 深色代码块元素强制转换 === */
[data-theme="dark"] pre,
[data-theme="dark"] code,
.dark pre,
.dark code,
.theme-dark pre,
.theme-dark code {
  background-color: #f8fafc !important;
  color: #1e293b !important;
}

/* === 语法高亮保持 - 确保在浅色背景下可读 === */
.token.comment,
.token.prolog,
.token.doctype,
.token.cdata {
  color: #6b7280 !important;
  font-style: italic;
}

.token.keyword,
.token.tag,
.token.boolean,
.token.number,
.token.constant,
.token.symbol,
.token.deleted {
  color: #dc2626 !important;
}

.token.selector,
.token.attr-name,
.token.string,
.token.char,
.token.builtin,
.token.inserted {
  color: #059669 !important;
}

.token.operator,
.token.entity,
.token.url,
.language-css .token.string,
.style .token.string,
.token.variable {
  color: #0891b2 !important;
}

.token.atrule,
.token.attr-value,
.token.function,
.token.class-name {
  color: #7c3aed !important;
}

.token.property,
.token.regex,
.token.important {
  color: #ea580c !important;
}

/* === 页面布局优化 - 保持原始布局结构 === */
body {
  background-color: #ffffff !important;
  color: #1f2937 !important;
}

/* === 标题优化 - 保持原始样式但添加分页控制 === */
h1, h2, h3, h4, h5, h6 {
  page-break-after: avoid !important;
  page-break-inside: avoid !important;
  /* 保持原始颜色但确保足够深以便打印 */
  filter: brightness(0.8) !important;
}

h1 {
  page-break-before: auto !important;
}

/* === 分页控制优化 === */
pre,
blockquote,
table,
.code-block,
.highlight {
  page-break-inside: avoid !important;
}

p {
  orphans: 3;
  widows: 3;
}

/* === 隐藏不必要的UI元素 === */
button,
input[type="button"],
input[type="submit"],
.copy-button,
.theme-toggle,
[data-theme-toggle],
.dark-mode-toggle,
nav:not(.toc),
.sidebar-toggle,
.mobile-menu,
.search-box {
  display: none !important;
}

/* === 链接优化 - 保持原始样式但确保可读性 === */
a {
  text-decoration: underline !important;
  /* 确保链接颜色足够深 */
  filter: brightness(0.7) saturate(1.2) !important;
}

/* === 表格优化 - 保持原始样式结构 === */
table {
  width: 100% !important;
  page-break-inside: avoid !important;
  /* 确保表格边框可见 */
  border-collapse: collapse !important;
}

th, td {
  /* 确保边框在打印时可见 */
  border: 1px solid #d1d5db !important;
  padding: 0.5em !important;
  word-wrap: break-word !important;
}

th {
  /* 确保表头在打印时突出 */
  background-color: #f9fafb !important;
  font-weight: 600 !important;
}

/* === 图片优化 === */
img {
  max-width: 100% !important;
  height: auto !important;
  page-break-inside: avoid !important;
}

/* === 引用块优化 - 保持原始样式但确保可读性 === */
blockquote {
  page-break-inside: avoid !important;
  /* 确保引用块在打印时可见 */
  border-left: 4px solid #3b82f6 !important;
  padding-left: 1em !important;
  margin-left: 0 !important;
  font-style: italic;
}

/* === 列表优化 === */
ul, ol {
  page-break-inside: avoid !important;
}

li {
  page-break-inside: avoid !important;
}

/* === 特殊内容块优化 === */
.note, .tip, .warning, .danger,
.alert, .callout {
  page-break-inside: avoid !important;
  /* 确保特殊块在打印时可见 */
  border: 1px solid #e2e8f0 !important;
  border-radius: 6px !important;
  padding: 1em !important;
  margin: 1em 0 !important;
}

/* === 强制显示隐藏内容 === */
details {
  open: true !important;
}

details > summary {
  display: none !important;
}

details[open] > *:not(summary) {
  display: block !important;
}

/* === 标签页内容全部显示 === */
[role="tabpanel"],
.tab-content > .tab-pane {
  display: block !important;
  opacity: 1 !important;
  visibility: visible !important;
}

.tab-content > .tab-pane:not(.active) {
  display: block !important;
}

/* === 响应式调整 === */
@media print {
  body {
    font-size: 11pt !important;
    line-height: 1.5 !important;
  }
  
  h1 { font-size: 1.6em !important; }
  h2 { font-size: 1.4em !important; }
  h3 { font-size: 1.2em !important; }
  h4 { font-size: 1.1em !important; }
  h5 { font-size: 1.05em !important; }
  h6 { font-size: 1em !important; }
  
  pre, code {
    font-size: 9pt !important;
  }
  
  table {
    font-size: 9pt !important;
  }
}
`;
  }

  /**
   * 生成PDF文件 - 增强版本，保留原始样式
   * @param {Page} page - Puppeteer页面对象
   * @param {string} htmlContent - HTML内容
   * @param {string} outputPath - 输出PDF路径
   * @param {Object} options - 生成选项
   */
  async generatePDFFromPage(page, htmlContent, outputPath, options = {}) {
    try {
      this.logger.info('开始Pandoc增强PDF生成', { 
        outputPath,
        engine: this.pandocConfig.pdfEngine || this.defaults.pdfEngine
      });

      // 提取原始页面样式
      const originalStyles = await this.extractOriginalStyles(page);
      
      // 创建增强的HTML内容
      const enhancedHTML = await this.createEnhancedHTML(htmlContent, originalStyles);
      
      // 使用增强HTML生成PDF
      return await this.generatePDF(enhancedHTML, outputPath, options);
      
    } catch (error) {
      this.logger.error('Pandoc增强PDF生成失败', {
        error: error.message,
        outputPath
      });
      throw error;
    }
  }

  /**
   * 生成PDF文件
   * @param {string} htmlContent - HTML内容
   * @param {string} outputPath - 输出PDF路径
   * @param {Object} options - 生成选项
   */
  async generatePDF(htmlContent, outputPath, options = {}) {
    try {
      this.logger.info('开始Pandoc PDF生成', { 
        outputPath,
        engine: this.pandocConfig.pdfEngine || this.defaults.pdfEngine
      });

      // 检查依赖
      const deps = await this.checkDependencies();
      if (!deps.available) {
        throw new ProcessingError(`Pandoc依赖不可用: ${deps.error}`);
      }

      // 准备CSS文件
      const cssPath = await this.prepareCSSFile();

      // 创建临时HTML文件
      const tempDir = await this.pathService.getTempDirectory();
      const tempHtmlPath = path.join(tempDir, `temp_${Date.now()}.html`);
      
      // 确保临时目录存在
      await fs.mkdir(tempDir, { recursive: true });
      
      // 写入HTML内容
      await fs.writeFile(tempHtmlPath, htmlContent, 'utf-8');

      // 构建pandoc命令参数
      const pdfEngine = this.pandocConfig.pdfEngine || this.defaults.pdfEngine;
      const args = [
        tempHtmlPath,
        '-o', outputPath,
        '--pdf-engine=' + pdfEngine,
        '--css=' + cssPath,
        ...this.pandocConfig.options || this.defaults.options
      ];

      // 如果使用weasyprint，需要设置正确的PATH环境变量
      const cmdOptions = {};
      if (pdfEngine === 'weasyprint') {
        const weasyprintCmd = this.getWeasyprintCommand();
        if (weasyprintCmd.includes('venv')) {
          const venvBinDir = weasyprintCmd.substring(0, weasyprintCmd.lastIndexOf('/'));
          cmdOptions.env = {
            ...process.env,
            PATH: `${venvBinDir}:${process.env.PATH}`
          };
        }
      }

      this.logger.debug('执行Pandoc命令', { engine: pdfEngine, cssPath });

      // 执行pandoc命令
      await this.runCommand('pandoc', args, cmdOptions);

      // 清理临时文件
      try {
        await fs.unlink(tempHtmlPath);
      } catch (error) {
        this.logger.debug('清理临时文件失败', { error: error.message });
      }

      // 验证输出文件
      const stats = await fs.stat(outputPath);
      
      this.logger.info('PDF生成成功', {
        outputPath,
        fileSize: `${(stats.size / 1024 / 1024).toFixed(2)}MB`
      });

      return {
        success: true,
        outputPath,
        fileSize: stats.size,
        engine: 'pandoc'
      };

    } catch (error) {
      this.logger.error('Pandoc PDF生成失败', {
        error: error.message,
        outputPath
      });

      throw new ProcessingError(`Pandoc PDF生成失败: ${error.message}`);
    }
  }

  /**
   * 批量生成PDF文件
   * @param {Array} htmlFiles - HTML文件列表
   * @param {string} outputDir - 输出目录
   */
  async batchGeneratePDFs(htmlFiles, outputDir) {
    const results = [];
    
    for (const htmlFile of htmlFiles) {
      try {
        const htmlContent = await fs.readFile(htmlFile.path, 'utf-8');
        const outputPath = path.join(outputDir, `${htmlFile.name}.pdf`);
        
        const result = await this.generatePDF(htmlContent, outputPath);
        results.push({
          ...result,
          sourcePath: htmlFile.path,
          name: htmlFile.name
        });
        
      } catch (error) {
        this.logger.error('批量PDF生成失败', {
          file: htmlFile.path,
          error: error.message
        });
        
        results.push({
          success: false,
          sourcePath: htmlFile.path,
          name: htmlFile.name,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * 获取服务状态
   */
  async getStatus() {
    const deps = await this.checkDependencies();
    
    return {
      name: 'PandocPDFService',
      status: deps.available ? 'ready' : 'unavailable',
      dependencies: deps,
      config: {
        engine: this.pandocConfig.pdfEngine || this.defaults.pdfEngine,
        cssFile: this.pandocConfig.cssFile || this.defaults.cssFile,
        options: this.pandocConfig.options || this.defaults.options
      }
    };
  }

  /**
   * 清理资源
   */
  async dispose() {
    this.logger.info('PandocPDFService已清理');
  }
}