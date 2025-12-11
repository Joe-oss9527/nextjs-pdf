// src/services/markdownService.js
import TurndownService from 'turndown';

/**
 * MarkdownService
 * - 将 HTML 内容转换为 Markdown
 * - 从 Puppeteer 页面提取内容并预处理（例如 SVG）
 * - 处理 YAML frontmatter 的添加与解析
 */
export class MarkdownService {
  constructor(options = {}) {
    this.logger = options.logger;
    this.config = options.config || {};
    this.markdownConfig = this.config.markdown || options.markdown || {};

    const turndownOptions = {
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      ...options.turndownOptions
    };

    this.turndown = new TurndownService(turndownOptions);

    // 保留代码块语言标识（```js``` 等）
    this.turndown.addRule('fencedCodeBlockWithLanguage', {
      filter: (node) => {
        return (
          node.nodeName === 'PRE' &&
          node.firstChild &&
          node.firstChild.nodeName === 'CODE'
        );
      },
      replacement: (content, node) => {
        const codeElement = node.firstChild;
        const className = codeElement.className || '';

        const langMatch =
          className.match(/language-([\w-]+)/) ||
          className.match(/lang-([\w-]+)/);

        const lang = langMatch ? langMatch[1] : '';
        const code = codeElement.textContent || '';

        const fence = '```';
        const langSuffix = lang ? `${lang}` : '';

        return `\n${fence}${langSuffix}\n${code.replace(/\n$/, '')}\n${fence}\n`;
      }
    });
  }

  /**
   * 将 HTML 字符串转换为 Markdown
   * @param {string} html
   * @returns {string}
   */
  convertHtmlToMarkdown(html, options = {}) {
    if (!html || typeof html !== 'string') {
      return '';
    }

    try {
      const markdown = this.turndown.turndown(html);
      this.logger?.debug?.('HTML 转 Markdown 完成', {
        length: markdown.length,
        ...options.debugMeta
      });
      return markdown;
    } catch (error) {
      this.logger?.error?.('HTML 转 Markdown 失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 从 Puppeteer 页面中提取内容区域，并转换为 Markdown
   * - 对 SVG 进行预处理：提取有意义的文本，忽略纯数字刻度
   * @param {import('puppeteer').Page} page
   * @param {string} selector
   * @returns {Promise<string>}
   */
  async extractAndConvertPage(page, selector) {
    const { html, svgCount } = await page.evaluate((contentSelector) => {
      const container = document.querySelector(contentSelector);
      if (!container) {
        return { html: '', svgCount: 0 };
      }

      const clone = container.cloneNode(true);
      const svgs = clone.querySelectorAll('svg');

      svgs.forEach((svg) => {
        try {
          const texts = [];

          const titleEl = svg.querySelector('title');
          if (titleEl && titleEl.textContent) {
            texts.push(titleEl.textContent.trim());
          }

          const descEl = svg.querySelector('desc');
          if (descEl && descEl.textContent) {
            texts.push(descEl.textContent.trim());
          }

          const textNodes = Array.from(svg.querySelectorAll('text'))
            .map((node) => node.textContent || '')
            .map((t) => t.trim())
            .filter((t) => t && !/^[\d\s.,%-]+$/.test(t)); // 过滤纯数字刻度

          texts.push(...textNodes);

          if (texts.length > 0) {
            const figure = document.createElement('figure');
            const caption = document.createElement('figcaption');
            caption.textContent = texts.join(' | ');

            svg.parentNode.insertBefore(figure, svg);
            figure.appendChild(svg);
            figure.appendChild(caption);
          }
        } catch (e) {
          // SVG 处理失败不应该阻塞整体流程
          // 这里不在浏览器环境里打印日志，交给外层处理
        }
      });

      return {
        html: clone.innerHTML,
        svgCount: svgs.length
      };
    }, selector);

    this.logger?.debug?.('从页面提取 HTML 完成', {
      hasContent: !!html,
      svgCount
    });

    return this.convertHtmlToMarkdown(html, { debugMeta: { svgCount } });
  }

  /**
   * 为 Markdown 内容添加 YAML frontmatter
   * @param {string} markdown
   * @param {Object} metadata
   * @returns {string}
   */
  addFrontmatter(markdown, metadata = {}) {
    const includeFrontmatter =
      this.markdownConfig.includeFrontmatter !== false;

    if (!includeFrontmatter) {
      return markdown;
    }

    if (!metadata || Object.keys(metadata).length === 0) {
      return markdown;
    }

    // 如果已经存在 frontmatter，则不重复添加
    if (markdown.startsWith('---\n')) {
      return markdown;
    }

    const lines = ['---'];

    Object.entries(metadata).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      lines.push(`${key}: ${String(value)}`);
    });

    lines.push('---', '');

    const frontmatter = lines.join('\n');
    return `${frontmatter}${markdown}`;
  }

  /**
   * 解析 Markdown 中的 YAML frontmatter
   * 仅支持简单的 key: value 形式
   * @param {string} markdown
   * @returns {{ metadata: Object, content: string }}
   */
  parseFrontmatter(markdown) {
    if (!markdown || typeof markdown !== 'string') {
      return { metadata: {}, content: '' };
    }

    const lines = markdown.split('\n');
    if (lines.length === 0 || lines[0].trim() !== '---') {
      return { metadata: {}, content: markdown };
    }

    const metadata = {};
    let i = 1;

    for (; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '---') {
        i++;
        break;
      }

      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (!match) {
        continue;
      }

      const key = match[1].trim();
      const rawValue = match[2].trim();

      let value = rawValue;
      if (rawValue === 'true' || rawValue === 'false') {
        value = rawValue === 'true';
      } else if (!Number.isNaN(Number(rawValue)) && rawValue !== '') {
        value = Number(rawValue);
      }

      metadata[key] = value;
    }

    const content = lines.slice(i).join('\n').replace(/^\n+/, '');
    return { metadata, content };
  }
}

