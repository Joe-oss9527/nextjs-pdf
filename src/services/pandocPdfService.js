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

      await this._runPandoc(markdownPath, outputPath, options);

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
      fs.writeFileSync(tempFile, markdownContent, 'utf8');

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
