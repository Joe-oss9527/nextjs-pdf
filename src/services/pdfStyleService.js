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
   * 获取针对PDF优化的CSS样式
   */
  getPDFOptimizedCSS(theme = 'light') {
    const isDark = theme === 'dark';
    
    return `
      /* === PDF基础样式重置 === */
      * {
        box-sizing: border-box;
        -webkit-print-color-adjust: exact !important;
        color-adjust: exact !important;
      }

      /* === 页面布局 === */
      body {
        font-size: ${this.settings.fontSize};
        line-height: 1.6;
        margin: 0;
        padding: 20px;
        max-width: none;
        overflow-x: visible;
        /* 降低优先级，允许原始样式设置背景和颜色 */
        background-color: ${isDark ? '#1a1a1a' : '#ffffff'};
        color: ${isDark ? '#e0e0e0' : '#333333'};
      }

      /* === 标题样式 === */
      h1, h2, h3, h4, h5, h6 {
        color: ${isDark ? '#ffffff' : '#1a1a1a'} !important;
        margin-top: 1.5em;
        margin-bottom: 0.5em;
        page-break-after: avoid;
        font-weight: 600;
      }

      h1 { font-size: 2em; border-bottom: 2px solid ${isDark ? '#444' : '#e0e0e0'}; padding-bottom: 0.3em; }
      h2 { font-size: 1.5em; }
      h3 { font-size: 1.3em; }
      h4 { font-size: 1.1em; }

      /* === 段落和文本 === */
      p {
        margin: 1em 0;
        orphans: 3;
        widows: 3;
      }

      /* === 代码块样式优化 === */
      pre {
        background-color: ${isDark ? '#2d2d2d' : '#f8f9fa'} !important;
        border: 1px solid ${isDark ? '#444' : '#e9ecef'} !important;
        border-radius: 6px;
        padding: 16px !important;
        margin: 1em 0;
        overflow: visible !important;
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        word-break: break-all !important;
        page-break-inside: avoid;
        font-family: ${this.settings.codeFont};
        font-size: 13px;
        line-height: 1.45;
        color: ${isDark ? '#e0e0e0' : '#24292e'} !important;
      }

      code {
        font-family: ${this.settings.codeFont};
        font-size: 0.9em;
        padding: 2px 4px;
        background-color: ${isDark ? '#3d3d3d' : '#f1f3f4'} !important;
        border-radius: 3px;
        color: ${isDark ? '#e0e0e0' : '#24292e'} !important;
        word-wrap: break-word;
      }

      pre code {
        background-color: transparent !important;
        padding: 0;
        border-radius: 0;
        word-wrap: break-word;
        white-space: pre-wrap !important;
      }

      /* === 语法高亮保持 === */
      .hljs-keyword, .token.keyword { color: ${isDark ? '#569cd6' : '#0000ff'} !important; }
      .hljs-string, .token.string { color: ${isDark ? '#ce9178' : '#008000'} !important; }
      .hljs-comment, .token.comment { color: ${isDark ? '#6a9955' : '#008000'} !important; font-style: italic; }
      .hljs-number, .token.number { color: ${isDark ? '#b5cea8' : '#09885a'} !important; }
      .hljs-function, .token.function { color: ${isDark ? '#dcdcaa' : '#795e26'} !important; }
      .hljs-variable, .token.variable { color: ${isDark ? '#9cdcfe' : '#001080'} !important; }

      /* === 引用块 === */
      blockquote {
        margin: 1em 0;
        padding: 0 1em;
        border-left: 4px solid ${isDark ? '#58a6ff' : '#0969da'};
        background-color: ${isDark ? '#262626' : '#f6f8fa'} !important;
        color: ${isDark ? '#c9d1d9' : '#656d76'} !important;
      }

      /* === 表格样式 === */
      table {
        border-collapse: collapse;
        width: 100%;
        margin: 1em 0;
        page-break-inside: auto;
        font-size: 0.9em;
      }

      table tr {
        page-break-inside: avoid;
        page-break-after: auto;
      }

      th, td {
        border: 1px solid ${isDark ? '#444' : '#d0d7de'};
        padding: 8px 12px;
        text-align: left;
        word-wrap: break-word;
        max-width: 200px;
      }

      th {
        background-color: ${isDark ? '#2d2d2d' : '#f6f8fa'} !important;
        font-weight: 600;
        color: ${isDark ? '#ffffff' : '#24292f'} !important;
      }

      tr:nth-child(even) {
        background-color: ${isDark ? '#262626' : '#f6f8fa'} !important;
      }

      /* === 链接样式 === */
      a {
        color: ${isDark ? '#58a6ff' : '#0969da'} !important;
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
      }

      /* === 列表样式 === */
      ul, ol {
        margin: 1em 0;
        padding-left: 2em;
      }

      li {
        margin: 0.5em 0;
      }

      /* === 图片样式 === */
      img {
        max-width: 100% !important;
        height: auto !important;
        display: block;
        margin: 1em auto;
        border-radius: 4px;
        page-break-inside: avoid;
      }

      /* === 分隔线 === */
      hr {
        border: none;
        border-top: 1px solid ${isDark ? '#444' : '#e0e0e0'};
        margin: 2em 0;
      }

      /* === 强调文本 === */
      strong, b {
        font-weight: 600;
        color: ${isDark ? '#ffffff' : '#24292f'} !important;
      }

      em, i {
        font-style: italic;
      }

      /* === 内联代码在文档中的特殊处理 === */
      p code, li code, td code {
        white-space: nowrap;
        overflow-wrap: break-word;
      }

      /* === 避免孤立元素 === */
      h1, h2, h3, h4, h5, h6 {
        page-break-after: avoid;
      }

      pre, blockquote, table {
        page-break-inside: avoid;
      }

      /* === 隐藏不必要的元素 === */
      .no-print,
      .advertisement,
      .ads,
      nav,
      .navigation,
      .sidebar,
      .menu,
      .breadcrumb,
      .pagination,
      .share,
      .social,
      button,
      input,
      textarea,
      select,
      .comments,
      .comment-section,
      .footer-nav,
      .theme-toggle {
        display: none !important;
      }

      /* === 响应式代码块 === */
      @media print {
        pre {
          white-space: pre-wrap !important;
          word-wrap: break-word !important;
          overflow: visible !important;
        }
        
        code {
          white-space: pre-wrap !important;
          word-wrap: break-word !important;
        }
      }
    `;
  }

  /**
   * 应用PDF样式到页面
   */
  async applyPDFStyles(page, contentSelector) {
    try {
      // 1. 检测当前主题
      const detectedTheme = await this.detectThemeMode(page);
      
      // 2. 强制设置为light模式（根据需求）
      const targetTheme = this.settings.theme || 'light';
      
      this.logger.info('应用PDF样式', { 
        detectedTheme, 
        targetTheme,
        contentSelector 
      });

      // 3. 保存原始样式表并应用样式处理
      await page.evaluate((selector, css, theme) => {
        // 清理页面内容
        const contentElement = document.querySelector(selector);
        if (!contentElement) {
          throw new Error(`内容选择器未找到: ${selector}`);
        }

        // ✨ 新增：保存所有现有的样式表和样式
        const preservedStyles = [];
        
        // 保存外部样式表 (link标签)
        document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
          preservedStyles.push({
            type: 'link',
            href: link.href,
            media: link.media || 'all'
          });
        });
        
        // 保存内嵌样式表 (style标签)
        document.querySelectorAll('style').forEach(style => {
          if (style.id !== 'pdf-style') { // 排除我们自己的样式
            preservedStyles.push({
              type: 'style',
              content: style.textContent,
              media: style.media || 'all'
            });
          }
        });

        // 移除不需要的元素
        const elementsToRemove = [
          'script', 'noscript', 
          'button', 'input', 'textarea', 'select',
          '.advertisement', '.ads', '.sidebar',
          '.navigation', '.nav', '.menu', '.breadcrumb',
          '.comments', '.comment-section', '.share', '.social',
          '.theme-toggle', '.dark-mode-toggle',
          '[data-theme-toggle]'
        ];

        elementsToRemove.forEach(sel => {
          contentElement.querySelectorAll(sel).forEach(el => el.remove());
        });

        // 处理代码块换行
        contentElement.querySelectorAll('pre, code').forEach(el => {
          // 确保代码块可以换行
          el.style.whiteSpace = 'pre-wrap';
          el.style.wordWrap = 'break-word';
          el.style.overflowWrap = 'break-word';
          el.style.overflow = 'visible';
          el.style.maxWidth = '100%';
          
          // 对于很长的代码行，在合适的位置添加换行
          if (el.textContent && el.textContent.length > 80) {
            const text = el.textContent;
            const lines = text.split('\n');
            const wrappedLines = lines.map(line => {
              if (line.length <= 80) return line;
              
              // 在合适的位置换行（逗号、分号、操作符后）
              return line.replace(/([,;=+\-*/\s]+)(?=.{20,})/g, '$1\n    ');
            });
            el.textContent = wrappedLines.join('\n');
          }
        });

        // 处理表格响应式
        contentElement.querySelectorAll('table').forEach(table => {
          table.style.tableLayout = 'fixed';
          table.style.width = '100%';
          table.style.wordWrap = 'break-word';
          
          // 限制单元格最大宽度
          table.querySelectorAll('td, th').forEach(cell => {
            cell.style.maxWidth = '200px';
            cell.style.wordWrap = 'break-word';
            cell.style.overflowWrap = 'break-word';
          });
        });

        // 强制Light模式样式
        if (theme === 'light') {
          // 移除可能的dark模式类名
          document.documentElement.classList.remove('dark', 'dark-mode', 'theme-dark');
          document.body.classList.remove('dark', 'dark-mode', 'theme-dark');
          
          // 设置light模式属性
          document.documentElement.setAttribute('data-theme', 'light');
          document.body.setAttribute('data-theme', 'light');
        }

        // ✨ 修改：保留原始head内容，只替换body内容
        document.body.innerHTML = contentElement.outerHTML;

        // ✨ 新增：重新添加保存的样式表
        preservedStyles.forEach(styleInfo => {
          if (styleInfo.type === 'link') {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = styleInfo.href;
            link.media = styleInfo.media;
            // 确保可以正确处理相对路径的CSS
            if (styleInfo.href.startsWith('/')) {
              const baseUrl = window.location.origin;
              link.href = baseUrl + styleInfo.href;
            }
            document.head.appendChild(link);
          } else if (styleInfo.type === 'style') {
            const style = document.createElement('style');
            style.textContent = styleInfo.content;
            style.media = styleInfo.media;
            document.head.appendChild(style);
          }
        });

        // 添加优化的CSS样式（优先级更高，放在最后）
        const existingStyle = document.querySelector('#pdf-style');
        if (existingStyle) {
          existingStyle.remove();
        }

        const style = document.createElement('style');
        style.id = 'pdf-style';
        style.textContent = css;
        document.head.appendChild(style);

        // 添加print media样式
        const printStyle = document.createElement('style');
        printStyle.media = 'print';
        printStyle.textContent = `
          @page {
            margin: 1cm;
            size: A4;
          }
          
          body {
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
        `;
        document.head.appendChild(printStyle);

      }, contentSelector, this.getPDFOptimizedCSS(targetTheme), targetTheme);

      // 4. 等待样式应用完成 - 使用现代Puppeteer API
      try {
        // 等待外部样式表加载完成
        await page.waitForFunction(
          () => {
            // 检查所有样式表是否已加载
            const stylesheets = Array.from(document.styleSheets);
            const allLoaded = stylesheets.every(sheet => {
              try {
                // 尝试访问cssRules来确认样式表已加载
                return sheet.cssRules || sheet.rules;
              } catch (e) {
                // 跨域样式表无法访问cssRules，但如果没有抛出网络错误说明已加载
                return !e.message.includes('NetworkError');
              }
            });
            
            // 同时检查我们的PDF样式是否已应用
            const pdfStyle = document.querySelector('#pdf-style');
            return allLoaded && pdfStyle;
          },
          { timeout: 5000 }
        );
        this.logger.debug('所有样式表已加载完成');
      } catch (error) {
        // 如果检测失败，回退到简单等待
        this.logger.debug('样式加载检测失败，使用回退等待', { error: error.message });
        await delay(1000);
      }

      this.logger.debug('PDF样式应用完成');
      
      return { success: true, theme: targetTheme };

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