// tests/services/markdownToPdfService.test.js
import { jest } from '@jest/globals';
import { MarkdownToPdfService } from '../../src/services/markdownToPdfService.js';

jest.mock('md-to-pdf', () => ({
  mdToPdf: jest.fn().mockResolvedValue({
    filename: '/tmp/output.pdf',
  }),
}));

describe('MarkdownToPdfService', () => {
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('convertContentToPdf 应该调用 md-to-pdf 并使用输出路径', async () => {
    const service = new MarkdownToPdfService({ logger });
    const markdown = '# Title';
    const outputPath = '/tmp/output.pdf';

    await service.convertContentToPdf(markdown, outputPath, {
      highlightStyle: 'github',
      pdfOptions: { format: 'A4' },
    });

    const { mdToPdf } = await import('md-to-pdf');
    expect(mdToPdf).toHaveBeenCalledWith(
      { content: markdown },
      expect.objectContaining({
        dest: outputPath,
        pdf_options: { format: 'A4' },
        highlight_style: 'github',
      })
    );
  });

  test('convertToPdf 应该调用 md-to-pdf 并传入文件路径', async () => {
    const service = new MarkdownToPdfService({ logger });
    const markdownPath = '/tmp/input.md';
    const outputPath = '/tmp/output.pdf';

    await service.convertToPdf(markdownPath, outputPath, {});

    const { mdToPdf } = await import('md-to-pdf');
    expect(mdToPdf).toHaveBeenCalledWith(
      { path: markdownPath },
      expect.objectContaining({
        dest: outputPath,
      })
    );
  });

  test('当未显式传入选项时应使用实例配置中的 markdownPdf', async () => {
    const service = new MarkdownToPdfService({
      logger,
      config: {
        markdownPdf: {
          highlightStyle: 'monokai',
          pdfOptions: {
            format: 'Letter',
            margin: '10mm',
          },
        },
      },
    });

    const markdown = '# Title';
    const outputPath = '/tmp/output-config.pdf';

    await service.convertContentToPdf(markdown, outputPath);

    const { mdToPdf } = await import('md-to-pdf');
    expect(mdToPdf).toHaveBeenCalledWith(
      { content: markdown },
      expect.objectContaining({
        dest: outputPath,
        pdf_options: {
          format: 'Letter',
          margin: '10mm',
        },
        highlight_style: 'monokai',
      })
    );
  });
});
