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
      // 检查pandoc
      const pandocVersion = await this.runCommand('pandoc', ['--version']);
      const pandocMatch = pandocVersion.match(/pandoc\s+([\d.]+)/);
      
      // 检查weasyprint - 使用虚拟环境路径
      const weasyprintCmd = this.getWeasyprintCommand();
      const weasyprintVersion = await this.runCommand(weasyprintCmd, ['--version']);
      const weasyprintMatch = weasyprintVersion.match(/WeasyPrint\s+([\d.]+)/);

      return {
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
    } catch (error) {
      this.logger.warn('Pandoc或weasyprint依赖检查失败', { error: error.message });
      return {
        available: false,
        error: error.message,
        pandoc: { available: false },
        weasyprint: { available: false }
      };
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
   * 生成PDF文件
   * @param {string} htmlContent - HTML内容
   * @param {string} outputPath - 输出PDF路径
   * @param {Object} options - 生成选项
   */
  async generatePDF(htmlContent, outputPath, options = {}) {
    try {
      this.logger.info('开始使用Pandoc生成PDF', { 
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
      const options = {};
      if (pdfEngine === 'weasyprint') {
        const weasyprintCmd = this.getWeasyprintCommand();
        if (weasyprintCmd.includes('venv')) {
          const venvBinDir = weasyprintCmd.substring(0, weasyprintCmd.lastIndexOf('/'));
          options.env = {
            ...process.env,
            PATH: `${venvBinDir}:${process.env.PATH}`
          };
        }
      }

      this.logger.debug('执行Pandoc命令', { args, options });

      // 执行pandoc命令
      await this.runCommand('pandoc', args, options);

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