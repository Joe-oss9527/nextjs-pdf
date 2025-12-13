// tests/services/translationService.test.js
import fs from 'fs';
import path from 'path';
import { TranslationService } from '../../src/services/translationService.js';

// Mock p-limit (ESM-only) to avoid Jest ESM parsing issues
jest.mock('p-limit', () => {
  return jest.fn(() => {
    const limit = (fn, ...args) => fn(...args);
    limit.activeCount = 0;
    limit.pendingCount = 0;
    limit.clearQueue = () => { };
    return limit;
  });
});

describe('TranslationService', () => {
  const baseConfig = {
    logLevel: 'error',
    translation: {
      enabled: true,
      bilingual: false,
      targetLanguage: 'Simplified Chinese (简体中文)',
      concurrency: 2,
      timeout: 60000,
      maxRetries: 3,
      retryDelay: 2000,
    },
  };

  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const cacheDir = path.join(process.cwd(), '.temp', 'translation_cache');

  beforeEach(() => {
    // 清理缓存目录，避免不同测试之间互相影响
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    // 测试结束后清理缓存目录
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  test('_getCacheKey 应该是稳定且区分模式的', () => {
    const service = new TranslationService({ config: baseConfig, logger });
    const text = 'Hello world';

    const key1 = service._getCacheKey(text);
    const key2 = service._getCacheKey(text);
    expect(key1).toBe(key2);

    const bilingualService = new TranslationService({
      config: {
        ...baseConfig,
        translation: {
          ...baseConfig.translation,
          bilingual: true,
        },
      },
      logger,
    });

    const bilingualKey = bilingualService._getCacheKey(text);
    expect(bilingualKey).not.toBe(key1);
  });

  test('_saveToCache 和 _getFromCache 应该能正确读写缓存', () => {
    const service = new TranslationService({ config: baseConfig, logger });
    const text = 'Some text';
    const translation = '某些文本';

    service._saveToCache(text, translation);
    const cached = service._getFromCache(text);

    expect(cached).toBe(translation);
  });

  test('构造函数在缺少翻译配置时应该使用默认超时与重试参数', () => {
    const service = new TranslationService({
      config: {
        logLevel: 'error',
        translation: {
          enabled: true,
        },
      },
      logger,
    });

    expect(service.timeoutMs).toBeGreaterThanOrEqual(60000);
    expect(service.maxRetries).toBe(3);
    expect(service.retryDelay).toBe(2000);
  });

  test('translateMarkdown 应该保留 frontmatter 和代码块，并在双语模式下追加译文', async () => {
    const service = new TranslationService({
      config: {
        logLevel: 'error',
        translation: {
          enabled: true,
          bilingual: true,
          targetLanguage: 'Simplified Chinese (简体中文)',
          concurrency: 1,
          timeout: 60000,
          maxRetries: 1,
          retryDelay: 0,
        },
      },
      logger,
    });

    // 替换实际的批量翻译，实现一个可预测的伪翻译
    service._translateBatchWithRetry = jest.fn(async (batch) => {
      const result = {};
      batch.forEach((seg) => {
        result[seg.id] = `T(${seg.text})`;
      });
      return result;
    });

    const markdown = [
      '---',
      'title: Test',
      '---',
      '',
      '# Heading',
      '',
      'Paragraph line 1.',
      '',
      '```js',
      'const a = 1;',
      '```',
      '',
    ].join('\n');

    const translated = await service.translateMarkdown(markdown);

    // frontmatter 应该保留
    expect(translated.startsWith('---\n')).toBe(true);
    expect(translated).toContain('title: Test');

    // 代码块应保持原样
    expect(translated).toContain('```js');
    expect(translated).toContain('const a = 1;');

    // 段落原文和伪翻译都应该存在（双语模式）
    expect(translated).toContain('Paragraph line 1.');
    expect(translated).toContain('T(Paragraph line 1.');
  });

  test('constructor should preserve explicit 0 values in translation config', () => {
    const service = new TranslationService({
      config: {
        logLevel: 'error',
        translation: {
          enabled: true,
          retryDelay: 0,
          maxSegmentRetries: 0,
          maxDelay: 0,
        },
      },
      logger,
    });

    expect(service.retryDelay).toBe(0);
    expect(service.maxSegmentRetries).toBe(0);
    expect(service.maxDelay).toBe(0);
  });

  test('_translateBatchWithRetry should not treat empty-string translations as failures', async () => {
    const service = new TranslationService({ config: baseConfig, logger });

    const batch = [
      { id: 'seg1', text: 'Text 1' },
      { id: 'seg2', text: 'Text 2' },
    ];

    // Mock batch translation result: seg1 -> '' (empty string), seg2 -> non-empty
    const batchResult = {
      seg1: '',
      seg2: 'Translated 2',
    };

    service._translateBatch = jest.fn(async () => batchResult);
    service._translateSingleSegment = jest.fn();

    const result = await service._translateBatchWithRetry(batch);

    expect(result).toEqual(batchResult);
    // No segment-level retries should be triggered for empty-string translations
    expect(service._translateSingleSegment).not.toHaveBeenCalled();
  });
});
