/**
 * PDF样式服务 - 处理PDF生成时的样式优化
 * 确保生成的PDF保持原网站的样式和格式
 */

import { createLogger } from '../utils/logger.js';
import { delay } from '../utils/common.js';

export class PDFStyleService {
  constructor(config = {}) {
    this.config = config;
    this.logger = createLogger('PDFStyleService');
    
    // 默认配置
    this.defaults = {
      theme: 'light',
      preserveCodeHighlighting: true,
      enableCodeWrap: true,
      maxCodeLineLength: 80,
      fontSize: '14px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      codeFont: 'Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
    };
    
    this.settings = { ...this.defaults, ...config };
  }

  /**
   * 检测页面主题模式
   */
  async detectThemeMode(page) {
    try {
      const themeInfo = await page.evaluate(() => {
        // 检测多种主题模式指示器
        const checks = {
          // 检查HTML或body的主题类名
          htmlClass: document.documentElement.className,
          bodyClass: document.body.className,
          
          // 检查CSS变量
          cssVars: getComputedStyle(document.documentElement),
          
          // 检查特定的主题属性
          dataTheme: document.documentElement.getAttribute('data-theme') || 
                    document.body.getAttribute('data-theme'),
          
          // 检查主要背景色
          bodyBgColor: getComputedStyle(document.body).backgroundColor,
          
          // 检查主要文字颜色
          bodyColor: getComputedStyle(document.body).color,
          
          // 检查是否有主题切换器
          themeToggle: !!document.querySelector('[data-theme-toggle], .theme-toggle, .dark-mode-toggle')
        };
        
        return checks;
      });
      
      // 智能判断主题模式
      let detectedTheme = 'light';
      
      // 方法1: 检查类名
      const classList = `${themeInfo.htmlClass} ${themeInfo.bodyClass}`.toLowerCase();
      if (classList.includes('dark') || classList.includes('night')) {
        detectedTheme = 'dark';
      }
      
      // 方法2: 检查data-theme属性
      if (themeInfo.dataTheme) {
        if (themeInfo.dataTheme.toLowerCase().includes('dark')) {
          detectedTheme = 'dark';
        }
      }
      
      // 方法3: 检查背景色
      if (themeInfo.bodyBgColor) {
        const rgb = themeInfo.bodyBgColor.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
          const brightness = (parseInt(rgb[0]) + parseInt(rgb[1]) + parseInt(rgb[2])) / 3;
          if (brightness < 128) {
            detectedTheme = 'dark';
          }
        }
      }
      
      this.logger.debug('检测到页面主题', { 
        detected: detectedTheme, 
        htmlClass: themeInfo.htmlClass,
        bodyClass: themeInfo.bodyClass,
        dataTheme: themeInfo.dataTheme,
        bgColor: themeInfo.bodyBgColor 
      });
      
      return detectedTheme;
      
    } catch (error) {
      this.logger.warn('主题检测失败，使用默认主题', { error: error.message });
      return 'light';
    }
  }

  /**
   * 获取最简化的PDF打印优化CSS
   */
  getPDFOptimizedCSS() {
    return `
      /* === PDF打印基础优化 === */
      * {
        -webkit-print-color-adjust: exact !important;
        color-adjust: exact !important;
      }

      /* === 页面布局和边距 === */
      @page {
        margin: 1.5cm !important;
        size: A4;
      }
      
      body {
        margin: 0 !important;
        padding: 1.2cm !important;
        font-size: 14px !important;
        line-height: 1.6 !important;
        font-family: 'Georgia', 'Times New Roman', serif !important;
      }

      /* === 强制覆盖所有深色主题代码块 + 强制换行 === */
      pre, pre[class*="language-"], pre[class*="hljs"], 
      .highlight, .code-block, .CodeMirror,
      [data-theme="dark"] pre, [class*="dark"] pre,
      pre *, pre[class*="language-"] *, pre[class*="hljs"] *,
      .highlight *, .code-block *, .CodeMirror * {
        background-color: #f8f9fa !important;
        background: #f8f9fa !important;
        border: 1px solid #d1d5db !important;
        border-radius: 6px !important;
        padding: 16px !important;
        margin: 1.5em 0 !important;
        font-family: 'Courier New', 'Monaco', monospace !important;
        font-size: 12px !important;
        line-height: 1.4 !important;
        color: #1f2937 !important;
        
        /* === 强制换行 - 多重保险 === */
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        word-break: break-all !important;
        overflow-wrap: break-word !important;
        overflow: visible !important;
        overflow-x: visible !important;
        
        /* === 防止溢出 === */
        max-width: 100% !important;
        width: 100% !important;
        box-sizing: border-box !important;
        page-break-inside: avoid !important;
      }
      
      /* === 针对具体的代码元素强制换行 === */
      pre code, pre span, pre div, pre p,
      code, span.token, span.hljs-*,
      .highlight code, .highlight span, .highlight div {
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        word-break: break-all !important;
        overflow-wrap: break-word !important;
        overflow: visible !important;
        max-width: 100% !important;
        display: inline !important;
      }

      /* === 内联代码换行优化 === */
      code, code[class*="language-"], code[class*="hljs"],
      [data-theme="dark"] code, [class*="dark"] code {
        background-color: #f3f4f6 !important;
        background: #f3f4f6 !important;
        color: #1f2937 !important;
        padding: 2px 4px !important;
        border-radius: 3px !important;
        font-family: 'Courier New', 'Monaco', monospace !important;
        font-size: 12px !important;
        
        /* === 强制内联代码换行 === */
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        word-break: break-all !important;
        overflow-wrap: break-word !important;
        overflow: visible !important;
        max-width: 100% !important;
        display: inline !important;
      }

      /* === 代码块内的code元素 === */
      pre code, pre[class*="language-"] code, pre[class*="hljs"] code {
        background-color: transparent !important;
        background: transparent !important;
        padding: 0 !important;
        border: none !important;
        border-radius: 0 !important;
        
        /* === 确保代码块内代码也能换行 === */
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        word-break: break-all !important;
        overflow-wrap: break-word !important;
        overflow: visible !important;
        max-width: 100% !important;
        width: 100% !important;
        display: inline !important;
      }

      /* === 强制所有代码文本为深色 === */
      pre *, pre code *, pre span *, 
      .hljs *, .token *, .highlight *, 
      [class*="language-"] *, [class*="hljs-"] *,
      [data-theme="dark"] pre *, [class*="dark"] pre *,
      code *, code span *, 
      .code-block *, .CodeMirror * {
        color: #1f2937 !important;
        background-color: transparent !important;
      }

      /* 特定语法元素颜色 */
      .hljs-keyword, .token.keyword, 
      .hljs-built_in, .token.builtin {
        color: #7c3aed !important;
      }

      .hljs-string, .token.string,
      .hljs-attr, .token.attr-name {
        color: #059669 !important;
      }

      .hljs-comment, .token.comment {
        color: #6b7280 !important;
        font-style: italic;
      }

      .hljs-number, .token.number,
      .hljs-literal, .token.boolean {
        color: #dc2626 !important;
      }

      .hljs-function, .token.function,
      .hljs-title, .token.class-name {
        color: #2563eb !important;
      }

      .hljs-variable, .token.variable,
      .hljs-name, .token.tag {
        color: #1f2937 !important;
      }

      /* === 避免分页断裂 === */
      h1, h2, h3, h4, h5, h6 {
        page-break-after: avoid;
        margin-top: 1.5em !important;
        margin-bottom: 0.5em !important;
      }

      pre, blockquote, table {
        page-break-inside: avoid;
      }

      /* === 隐藏交互元素 === */
      .no-print,
      button,
      input,
      textarea,
      select,
      .theme-toggle,
      .copy-button,
      [data-theme="dark"] {
        display: none !important;
      }

      /* === 表格样式 === */
      table {
        width: 100% !important;
        border-collapse: collapse !important;
        margin: 1em 0 !important;
        font-size: 12px !important;
      }

      th, td {
        border: 1px solid #d1d5db !important;
        padding: 8px !important;
        text-align: left !important;
      }

      th {
        background-color: #f9fafb !important;
        font-weight: bold !important;
      }

      /* === 全局强制换行样式 - 覆盖所有可能的代码容器 === */
      * [class*="code"], * [class*="highlight"], * [class*="language"],
      * [class*="hljs"], * [class*="token"], * [class*="pre"],
      div[class*="code"], div[class*="highlight"], div[class*="language"],
      span[class*="code"], span[class*="highlight"], span[class*="language"] {
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        word-break: break-all !important;
        overflow-wrap: break-word !important;
        overflow: visible !important;
        max-width: 100% !important;
      }
      
      /* === 响应式代码块 === */
      @media print {
        body {
          font-size: 12px !important;
        }
        
        /* 打印时特别强制换行 */
        pre, code, 
        pre *, code *,
        [class*="language-"], [class*="hljs"], [class*="highlight"],
        .code-block, .CodeMirror {
          white-space: pre-wrap !important;
          word-wrap: break-word !important;
          word-break: break-all !important;
          overflow-wrap: break-word !important;
          overflow: visible !important;
          max-width: 100% !important;
          width: 100% !important;
          box-sizing: border-box !important;
        }
        
        img {
          max-width: 100% !important;
          height: auto !important;
        }
      }
    `;
  }

  /**
   * 应用最简化的PDF样式到页面
   */
  async applyPDFStyles(page, contentSelector) {
    try {
      this.logger.info('应用最简化PDF样式', { contentSelector });

      // 只做最基础的内容提取和样式优化
      await page.evaluate((selector, css) => {
        // 提取内容
        const contentElement = document.querySelector(selector);
        if (!contentElement) {
          throw new Error(`内容选择器未找到: ${selector}`);
        }

        // 只移除明显的交互元素
        const elementsToRemove = [
          'script', 'noscript', 
          'button', 'input', 'textarea', 'select',
          '.theme-toggle', '.dark-mode-toggle',
          '[data-theme-toggle]'
        ];

        elementsToRemove.forEach(sel => {
          contentElement.querySelectorAll(sel).forEach(el => el.remove());
        });

        // 强制移除深色主题类和属性
        document.documentElement.classList.remove('dark', 'dark-mode', 'theme-dark');
        document.body.classList.remove('dark', 'dark-mode', 'theme-dark');
        document.documentElement.removeAttribute('data-theme');
        document.body.removeAttribute('data-theme');
        document.documentElement.setAttribute('data-theme', 'light');
        
        // === 强制所有代码元素启用换行 ===
        const codeElements = document.querySelectorAll(`
          pre, pre *, 
          code, code *,
          [class*="language-"], [class*="language-"] *,
          [class*="hljs"], [class*="hljs"] *,
          .highlight, .highlight *,
          .code-block, .code-block *,
          .CodeMirror, .CodeMirror *
        `);
        
        codeElements.forEach(el => {
          // 强制设置换行相关样式
          el.style.setProperty('white-space', 'pre-wrap', 'important');
          el.style.setProperty('word-wrap', 'break-word', 'important');
          el.style.setProperty('word-break', 'break-all', 'important');
          el.style.setProperty('overflow-wrap', 'break-word', 'important');
          el.style.setProperty('overflow', 'visible', 'important');
          el.style.setProperty('overflow-x', 'visible', 'important');
          el.style.setProperty('max-width', '100%', 'important');
          el.style.setProperty('width', '100%', 'important');
          el.style.setProperty('box-sizing', 'border-box', 'important');
          
          // 移除可能阻止换行的属性
          el.style.removeProperty('white-space');
          el.style.setProperty('white-space', 'pre-wrap', 'important');
          
          // 移除固定宽度
          if (el.style.width && el.style.width !== '100%') {
            el.style.removeProperty('width');
            el.style.setProperty('width', '100%', 'important');
          }
        });

        // 替换body内容（保持所有原始样式）
        document.body.innerHTML = contentElement.outerHTML;

        // 强制移除内容中的深色主题
        document.querySelectorAll('[data-theme="dark"], [class*="dark"], .theme-dark').forEach(el => {
          el.removeAttribute('data-theme');
          el.classList.remove('dark', 'dark-mode', 'theme-dark');
        });

        // 只添加最基础的PDF打印优化样式
        const existingStyle = document.querySelector('#pdf-style');
        if (existingStyle) {
          existingStyle.remove();
        }

        const style = document.createElement('style');
        style.id = 'pdf-style';
        style.textContent = css;
        document.head.appendChild(style);

      }, contentSelector, this.getPDFOptimizedCSS());

      this.logger.debug('PDF样式应用完成');
      return { success: true };

    } catch (error) {
      this.logger.error('PDF样式应用失败', { 
        error: error.message,
        contentSelector 
      });
      throw error;
    }
  }

  /**
   * 获取优化的PDF生成选项
   */
  getPDFOptions() {
    return {
      format: 'A4',
      margin: {
        top: '1cm',
        right: '1cm',
        bottom: '1cm',
        left: '1cm'
      },
      printBackground: true,
      preferCSSPageSize: false,
      displayHeaderFooter: false,
      // 确保样式正确打印
      scale: 1
    };
  }

  /**
   * 处理特殊内容类型
   */
  async processSpecialContent(page) {
    try {
      await page.evaluate(() => {
        // 处理Mermaid图表
        document.querySelectorAll('.mermaid').forEach(el => {
          if (el.querySelector('svg')) {
            el.style.overflow = 'visible';
            el.style.maxWidth = '100%';
          }
        });

        // 处理代码高亮
        document.querySelectorAll('[class*="highlight"], [class*="hljs"]').forEach(el => {
          el.style.overflow = 'visible';
          el.style.whiteSpace = 'pre-wrap';
        });

        // 处理折叠内容
        document.querySelectorAll('details').forEach(details => {
          details.open = true; // 展开所有折叠内容
        });

        // 处理标签页内容
        document.querySelectorAll('[role="tabpanel"]').forEach(panel => {
          panel.style.display = 'block'; // 显示所有标签页内容
        });
      });

      this.logger.debug('特殊内容处理完成');
    } catch (error) {
      this.logger.warn('特殊内容处理失败', { error: error.message });
    }
  }
}