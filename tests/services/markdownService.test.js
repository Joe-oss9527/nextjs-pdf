// tests/services/markdownService.test.js
import { MarkdownService } from '../../src/services/markdownService.js';

describe('MarkdownService', () => {
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('convertHtmlToMarkdown 应该将简单 HTML 转为 Markdown', () => {
    const service = new MarkdownService({ logger });
    const html = '<h1>Title</h1><p>Content</p>';

    const markdown = service.convertHtmlToMarkdown(html);

    expect(markdown).toContain('Title');
    expect(markdown).toContain('Content');
  });

  test('代码块应保留语言标识', () => {
    const service = new MarkdownService({ logger });
    const html = '<pre><code class="language-js">const x = 1;</code></pre>';

    const markdown = service.convertHtmlToMarkdown(html);

    expect(markdown).toContain('```js');
    expect(markdown).toContain('const x = 1;');
  });

  test('addFrontmatter 应该在开头添加 YAML frontmatter', () => {
    const service = new MarkdownService({
      logger,
      config: {
        markdown: {
          includeFrontmatter: true,
        },
      },
    });

    const markdown = 'Content';
    const result = service.addFrontmatter(markdown, {
      title: 'Test',
      index: 1,
    });

    expect(result.startsWith('---\n')).toBe(true);
    expect(result).toContain('title: Test');
    expect(result).toContain('index: 1');
    expect(result).toContain('Content');
  });

  test('parseFrontmatter 应该解析 YAML frontmatter 并返回内容', () => {
    const service = new MarkdownService({ logger });
    const markdown = [
      '---',
      'title: Test',
      'index: 2',
      'published: true',
      '---',
      '',
      '# Heading',
      'Body',
    ].join('\n');

    const { metadata, content } = service.parseFrontmatter(markdown);

    expect(metadata).toEqual({
      title: 'Test',
      index: 2,
      published: true,
    });
    expect(content).toContain('# Heading');
    expect(content).toContain('Body');
  });

  test('extractAndConvertPage 应该调用 page.evaluate 并返回 Markdown', async () => {
    const service = new MarkdownService({ logger });
    const page = {
      evaluate: jest.fn(async () => ({
        html: '<h1>Title</h1><p>Body</p>',
        svgCount: 0,
      })),
    };

    const markdown = await service.extractAndConvertPage(page, 'main');

    expect(page.evaluate).toHaveBeenCalledTimes(1);
    expect(markdown).toContain('Title');
    expect(markdown).toContain('Body');
  });
});
