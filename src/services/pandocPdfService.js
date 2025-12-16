// src/services/pandocPdfService.js
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * PandocPdfService
 * 使用 Pandoc 将 Markdown 内容或文件转换为 PDF
 * 比 md-to-pdf 更可靠，特别是处理 CJK 字符时
 */
export class PandocPdfService {
  constructor(options = {}) {
    this.logger = options.logger;
    this.config = options.config || {};
    this.pandocBinary = options.pandocBinary || 'pandoc';
  }

  /**
   * 将 Markdown 文件转换为 PDF
   * @param {string} markdownPath
   * @param {string} outputPath
   * @param {Object} options
   */
  async convertToPdf(markdownPath, outputPath, options = {}) {
    try {
      this.logger?.info?.('开始使用 Pandoc 将 Markdown 文件转换为 PDF', {
        markdownPath,
        outputPath,
      });

      // 读取文件内容
      const content = fs.readFileSync(markdownPath, 'utf8');

      // 使用 convertContentToPdf 处理（它包含清理逻辑）
      await this.convertContentToPdf(content, outputPath, options);

      this.logger?.info?.('Pandoc Markdown 文件转换 PDF 完成', {
        outputPath,
      });
    } catch (error) {
      this.logger?.error?.('Pandoc Markdown 文件转换 PDF 失败', {
        markdownPath,
        outputPath,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 将 Markdown 文本内容转换为 PDF
   * @param {string} markdownContent
   * @param {string} outputPath
   * @param {Object} options
   */
  async convertContentToPdf(markdownContent, outputPath, options = {}) {
    try {
      this.logger?.info?.('开始使用 Pandoc 将 Markdown 内容转换为 PDF', {
        outputPath,
      });

      // 创建临时文件
      const tempDir = path.join(process.cwd(), '.temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempFile = path.join(tempDir, `temp_${Date.now()}.md`);

      // 清理 Markdown 内容（修复代码块语法问题）
      const cleanedContent = this._cleanMarkdownContent(markdownContent);

      fs.writeFileSync(tempFile, cleanedContent, 'utf8');

      try {
        await this._runPandoc(tempFile, outputPath, options);
      } finally {
        // 清理临时文件
        try {
          fs.unlinkSync(tempFile);
        } catch {
          // 忽略清理错误
        }
      }

      this.logger?.info?.('Pandoc Markdown 内容转换 PDF 完成', {
        outputPath,
      });
    } catch (error) {
      this.logger?.error?.('Pandoc Markdown 内容转换 PDF 失败', {
        outputPath,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 运行 Pandoc 命令
   * @param {string} inputPath
   * @param {string} outputPath
   * @param {Object} options
   * @returns {Promise<void>}
   * @private
   */
  async _runPandoc(inputPath, outputPath, options = {}) {
    const args = this._buildPandocArgs(inputPath, outputPath, options);

    return new Promise((resolve, reject) => {
      const child = spawn(this.pandocBinary, args);
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code !== 0) {
          const error = new Error(`Pandoc exited with code ${code}: ${stderr}`);
          this.logger?.error?.('Pandoc 转换失败', {
            code,
            stderr: stderr.substring(0, 500),
            stdout: stdout.substring(0, 500),
          });
          reject(error);
          return;
        }

        // 检查输出文件是否存在
        if (!fs.existsSync(outputPath)) {
          reject(new Error('PDF 文件未生成'));
          return;
        }

        resolve();
      });

      child.on('error', (err) => {
        this.logger?.error?.('Pandoc spawn 错误', {
          error: err.message,
        });
        reject(err);
      });
    });
  }

  /**
   * 清理 Markdown 内容，修复 Pandoc 不支持的语法
   * @param {string} content
   * @returns {string}
   * @private
   */
  _cleanMarkdownContent(content) {
    if (!content) return content;

    // 1. 修复代码块中的 theme={...} 属性
    // ```markdown theme={null} -> ```markdown
    // 支持任意数量的反引号 (>=3)
    let cleaned = content.replace(/^(`{3,})(\w+)\s+theme=\{[^}]+\}/gm, '$1$2');

    // 0. 处理 <Step> 组件
    // <Steps> / </Steps> -> remove
    cleaned = cleaned.replace(/<\/?Steps>/g, '');

    // <Step title="..."> -> ### ...
    cleaned = cleaned.replace(/<Step[^>]*title="([^"]+)"[^>]*>/g, '\n### $1\n');

    // </Step> -> remove
    cleaned = cleaned.replace(/<\/Step>/g, '\n');

    // 0.1 修复缩进
    // 移除 2-4 个空格的缩进 (修复 <Step> 内容被识别为代码块的问题)
    // 注意：这将影响所有缩进文本，但在这种上下文中通常是安全的
    cleaned = cleaned.replace(/^[ \t]{2,4}(?=[^ \t\n])/gm, '');
    // 移除以 | 开头的行前面的缩进 (修复表格被识别为代码块的问题)
    cleaned = cleaned.replace(/^\s+(\|.*\|)\s*$/gm, '$1');

    // 0.2 强制在表格前添加空行 (防止表格跟在文本后面被当成普通文本)
    // 查找: 非空行(不以|开头) + 换行 + 表格头(|...|) + 换行 + 分隔线(|---|)
    cleaned = cleaned.replace(/(^[^|\n\r].*(?:\r?\n|\r))(\s*\|.*\|.*(?:\r?\n|\r)\s*\|[-: ]+\|)/gm, '$1\n$2');

    // 2. 修复代码块中一般的 React 属性 (key=value 或 key={value})
    // ```javascript filename="app.js" -> ```javascript
    cleaned = cleaned.replace(/^(`{3,})(\w+)\s+[\w-]+=(?:"[^"]*"|\{[^}]+\})/gm, '$1$2');

    // 3. 规范化表格分隔符行，防止某一列过宽导致其他列被压缩 (修复表格重叠问题)
    // 查找类似 | --- | :--- | ---: | 的行
    cleaned = cleaned.replace(/^\|?(\s*:?-+:?\s*\|)+$/gm, (match) => {
      // 如果不是表格分隔线（防止误判），直接返回
      if (!match.includes('-')) return match;

      return match.replace(/:?-+:?/g, (dashes) => {
        // 保留对齐冒号
        const hasLeftColon = dashes.startsWith(':');
        const hasRightColon = dashes.endsWith(':');

        let dashCount = dashes.length - (hasLeftColon ? 1 : 0) - (hasRightColon ? 1 : 0);

        // 限制 dash 数量在 10 到 50 之间
        // 既保证最小宽度，又防止某一列过度占用
        let newCount = Math.max(10, Math.min(dashCount, 50));

        return (hasLeftColon ? ':' : '') + '-'.repeat(newCount) + (hasRightColon ? ':' : '');
      });
    });

    return cleaned;
  }

  /**
   * 构建 Pandoc 命令行参数
   * @param {string} inputPath
   * @param {string} outputPath
   * @param {Object} options
   * @returns {string[]}
   * @private
   */
  _buildPandocArgs(inputPath, outputPath, options = {}) {
    const markdownPdfConfig = {
      ...(this.config.markdownPdf || {}),
      ...(options || {}),
    };

    const args = [
      inputPath,
      '-o',
      outputPath,
      '--pdf-engine=xelatex', // 使用 xelatex 支持中文
      '--variable',
      'CJKmainfont=Arial Unicode MS', // 主字体（支持中文）
      '--variable',
      'geometry:margin=1in', // 页边距
      '--variable',
      'header-includes=\\usepackage{fvextra} \\DefineVerbatimEnvironment{Highlighting}{Verbatim}{breaklines,breakanywhere,commandchars=\\\\\\{\\}} \\usepackage{xurl}', // 启用代码换行(支持任意位置) 和 URL 换行。不再使用 ltablex 防止表格溢出
    ];

    // 添加其他选项
    const pdfOptions = markdownPdfConfig.pdfOptions || {};

    // 如果指定了格式，添加纸张大小
    if (pdfOptions.format) {
      args.push('--variable', `papersize=${pdfOptions.format.toLowerCase()}`);
    }

    // 如果指定了边距
    if (pdfOptions.margin) {
      args.push('--variable', `geometry:margin=${pdfOptions.margin}`);
    }

    // 添加 TOC（目录）
    if (markdownPdfConfig.toc !== false) {
      args.push('--toc');
      args.push('--toc-depth=3');
    }

    // 语法高亮（Pandoc 3+ 使用 --highlight-style）
    // 支持的样式: pygments, tango, espresso, zenburn, kate, monochrome, breezedark, haddock
    const highlightStyle = markdownPdfConfig.highlightStyle;
    if (highlightStyle) {
      const style = highlightStyle === 'github' ? 'pygments' : highlightStyle;
      args.push('--highlight-style', style);
    }

    return args;
  }
}
