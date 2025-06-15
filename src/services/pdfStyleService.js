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
   * 获取最小干预的PDF优化CSS - 保留原始样式，仅解决关键问题
   */
  getPDFOptimizedCSS() {
    return `
      /* === 基础打印优化 - 保持原始样式基础 === */
      * {
        -webkit-print-color-adjust: exact !important;
        color-adjust: exact !important;
      }

      /* === 页面设置 - 适合Kindle等设备 === */
      @page {
        margin: 1.5cm;
        size: A4;
      }

      /* === 仅在深色主题时强制转换为浅色 === */
      [data-theme="dark"], 
      .dark, 
      .dark-mode,
      .theme-dark,
      html[data-theme="dark"],
      body[data-theme="dark"] {
        background-color: #ffffff !important;
        color: #1f2937 !important;
      }

      /* === 核心代码换行修复 - 保持原始设计 === */
      pre, 
      pre[class*="language-"], 
      pre[class*="hljs"],
      .highlight,
      .code-block,
      .CodeMirror {
        /* 仅添加换行支持，不改变原始样式 */
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
        overflow: visible !important;
        overflow-x: visible !important;
        
        /* 防止溢出，但保持原始宽度设计 */
        max-width: 100% !important;
        box-sizing: border-box !important;
        page-break-inside: avoid;
      }

      /* === 代码块内子元素 - 仅确保换行，不改变样式 === */
      pre *,
      pre[class*="language-"] *,
      pre[class*="hljs"] *,
      .highlight *,
      .code-block *,
      .CodeMirror * {
        /* 仅添加换行支持 */
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
        overflow: visible !important;
        max-width: 100% !important;
      }

      /* === 内联代码换行 - 最小化改动 === */
      code {
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
      }

      /* === 深色主题代码块转换 === */
      [data-theme="dark"] pre,
      [data-theme="dark"] code,
      .dark pre,
      .dark code,
      .theme-dark pre,
      .theme-dark code {
        background-color: #f8fafc !important;
        color: #1e293b !important;
      }

      /* === 基础分页控制 === */
      h1, h2, h3, h4, h5, h6 {
        page-break-after: avoid;
      }

      pre, blockquote, table {
        page-break-inside: avoid;
      }

      /* === 隐藏纯UI元素 === */
      button:not(.copy-button),
      input[type="button"],
      input[type="submit"],
      .theme-toggle,
      [data-theme-toggle],
      .dark-mode-toggle,
      .sidebar-toggle,
      .mobile-menu {
        display: none !important;
      }

      /* === 强制显示折叠内容 === */
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

      /* === Kindle优化 - 改善阅读体验 === */
      @media print {
        /* 确保在小屏设备上代码能正确换行 */
        pre, code, 
        pre *, code *,
        [class*="language-"], [class*="hljs"], [class*="highlight"] {
          white-space: pre-wrap !important;
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
          overflow: visible !important;
          max-width: 100% !important;
        }
        
        /* 图片适配 */
        img {
          max-width: 100% !important;
          height: auto !important;
        }
        
        /* 表格适配 */
        table {
          width: 100% !important;
          font-size: 0.9em !important;
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
        
        // === 最小干预：仅添加换行支持，保留原始样式 ===
        const codeElements = document.querySelectorAll(`
          pre, 
          pre[class*="language-"],
          pre[class*="hljs"],
          .highlight,
          .code-block,
          .CodeMirror
        `);
        
        codeElements.forEach(el => {
          // 仅添加换行支持，不改变原始样式
          el.style.setProperty('white-space', 'pre-wrap', 'important');
          el.style.setProperty('word-wrap', 'break-word', 'important');
          el.style.setProperty('overflow-wrap', 'break-word', 'important');
          el.style.setProperty('overflow', 'visible', 'important');
          el.style.setProperty('overflow-x', 'visible', 'important');
          el.style.setProperty('max-width', '100%', 'important');
          el.style.setProperty('box-sizing', 'border-box', 'important');
        });
        
        // === 确保代码块内元素也支持换行 ===
        const codeChildren = document.querySelectorAll(`
          pre *, 
          pre[class*="language-"] *,
          pre[class*="hljs"] *,
          .highlight *,
          .code-block *,
          .CodeMirror *
        `);
        
        codeChildren.forEach(el => {
          // 仅添加换行支持，保留原始颜色和样式
          el.style.setProperty('white-space', 'pre-wrap', 'important');
          el.style.setProperty('word-wrap', 'break-word', 'important');
          el.style.setProperty('overflow-wrap', 'break-word', 'important');
          el.style.setProperty('overflow', 'visible', 'important');
          el.style.setProperty('max-width', '100%', 'important');
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
   * 获取优化的PDF生成选项 - 针对Kindle等设备优化
   */
  getPDFOptions() {
    return {
      format: 'A4',
      margin: {
        top: '1.5cm',
        right: '1.5cm', 
        bottom: '1.5cm',
        left: '1.5cm'
      },
      printBackground: true,
      preferCSSPageSize: true,  // 使用CSS页面设置
      displayHeaderFooter: false,
      scale: 1,
      // 优化文本渲染
      tagged: true,  // 生成带标签的PDF，改善屏幕阅读器体验
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