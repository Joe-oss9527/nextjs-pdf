// src/services/markdownToPdfService.js
import { mdToPdf } from 'md-to-pdf';

/**
 * MarkdownToPdfService
 * 使用 md-to-pdf 将 Markdown 内容或文件转换为 PDF
 */
export class MarkdownToPdfService {
  constructor(options = {}) {
    this.logger = options.logger;
    this.config = options.config || {};
  }

  /**
   * 将 Markdown 文件转换为 PDF
   * @param {string} markdownPath
   * @param {string} outputPath
   * @param {Object} options
   */
  async convertToPdf(markdownPath, outputPath, options = {}) {
    try {
      const mdOptions = this._buildMdToPdfOptions(outputPath, options);

      this.logger?.info?.('开始将 Markdown 文件转换为 PDF', {
        markdownPath,
        outputPath
      });

      const result = await mdToPdf({ path: markdownPath }, mdOptions);

      if (!result) {
        throw new Error('md-to-pdf returned no result');
      }

      this.logger?.info?.('Markdown 文件转换 PDF 完成', {
        outputPath: result.filename || outputPath
      });
    } catch (error) {
      this.logger?.error?.('Markdown 文件转换 PDF 失败', {
        markdownPath,
        outputPath,
        error: error.message
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
      const mdOptions = this._buildMdToPdfOptions(outputPath, options);

      this.logger?.info?.('开始将 Markdown 内容转换为 PDF', {
        outputPath
      });

      const result = await mdToPdf({ content: markdownContent }, mdOptions);

      if (!result) {
        throw new Error('md-to-pdf returned no result');
      }

      this.logger?.info?.('Markdown 内容转换 PDF 完成', {
        outputPath: result.filename || outputPath
      });
    } catch (error) {
      this.logger?.error?.('Markdown 内容转换 PDF 失败', {
        outputPath,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 构建 md-to-pdf 选项对象
   * @param {string} outputPath
   * @param {Object} options
   * @returns {Object}
   * @private
   */
  _buildMdToPdfOptions(outputPath, options = {}) {
    const markdownPdfConfig = {
      ...(this.config.markdownPdf || {}),
      ...(options || {})
    };

    const mdOptions = {
      dest: outputPath,
      pdf_options: markdownPdfConfig.pdfOptions || {},
      highlight_style: markdownPdfConfig.highlightStyle || 'github'
    };

    if (markdownPdfConfig.stylesheet) {
      mdOptions.stylesheet = markdownPdfConfig.stylesheet;
    }

    return mdOptions;
  }
}
