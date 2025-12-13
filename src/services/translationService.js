import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pLimit from 'p-limit';
import { createLogger } from '../utils/logger.js';
import { delay, retry } from '../utils/common.js';
import { GeminiClient } from './geminiClient.js';

/**
 * Translation Service
 * Handles content translation using gemini-cli with caching and concurrency control
 */
export class TranslationService {
  constructor(options = {}) {
    const { config = {}, logger, pathService, client } = options;

    this.config = config;
    this.logger = logger || createLogger({ logLevel: config.logLevel });
    this.pathService = pathService || null;

    this.logger.info('TranslationService constructor called', {
      configKeys: Object.keys(config || {}),
    });

    const translationConfig = config.translation || {};

    this.enabled = translationConfig.enabled || false;
    this.bilingual = translationConfig.bilingual || false;
    this.targetLanguage = translationConfig.targetLanguage || 'Chinese';
    this.concurrency = translationConfig.concurrency || 1;

    // 超时与重试配置（支持从配置覆盖）
    this.timeoutMs = translationConfig.timeout || 60000;
    this.maxRetries = translationConfig.maxRetries || 3;
    this.retryDelay = translationConfig.retryDelay || 2000;

    // 新增：段落级重试与抖动策略配置（AWS/Netflix 最佳实践）
    this.maxSegmentRetries = translationConfig.maxSegmentRetries || 2;
    this.maxDelay = translationConfig.maxDelay || 30000;
    this.jitterStrategy = translationConfig.jitterStrategy || 'decorrelated';

    this.logger.info('TranslationService enabled:', {
      enabled: this.enabled,
      targetLanguage: this.targetLanguage,
      bilingual: this.bilingual,
      concurrency: this.concurrency,
      timeoutMs: this.timeoutMs,
      maxRetries: this.maxRetries,
      retryDelay: this.retryDelay,
      maxSegmentRetries: this.maxSegmentRetries,
      maxDelay: this.maxDelay,
      jitterStrategy: this.jitterStrategy,
    });

    // 外部可注入自定义客户端（方便测试或替换实现）
    this.client = client || null;

    // Cache directory
    this.cacheDir = this._resolveCacheDir();
    this._ensureCacheDir();
  }

  _resolveCacheDir() {
    if (this.pathService && typeof this.pathService.getTranslationCacheDirectory === 'function') {
      return this.pathService.getTranslationCacheDirectory();
    }
    return path.join(process.cwd(), '.temp', 'translation_cache');
  }

  _ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  _getCacheKey(text) {
    const mode = this.bilingual ? 'bilingual' : 'single';
    const keyBase = `${this.targetLanguage}:${mode}:${text}`;
    return crypto.createHash('md5').update(keyBase).digest('hex');
  }

  _getFromCache(text) {
    const key = this._getCacheKey(text);
    const cachePath = path.join(this.cacheDir, `${key}.json`);
    if (fs.existsSync(cachePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        return data.translation;
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  _saveToCache(text, translation) {
    const key = this._getCacheKey(text);
    const cachePath = path.join(this.cacheDir, `${key}.json`);
    try {
      fs.writeFileSync(
        cachePath,
        JSON.stringify({
          original: text,
          translation,
          timestamp: Date.now(),
        })
      );
    } catch (e) {
      this.logger.warn('Failed to write to cache', { error: e.message });
    }
  }

  /**
   * Translate page content
   * @param {import('puppeteer').Page} page
   */
  async translatePage(page) {
    if (!this.enabled) {
      this.logger.debug('Translation disabled, skipping');
      return;
    }

    this.logger.info(
      `Starting translation to ${this.targetLanguage} (Bilingual: ${this.bilingual})`
    );

    try {
      // 1. Identify translatable elements
      const elementsToTranslate = await page.evaluate(() => {
        const textTags = [
          'p',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'li',
          'th',
          'td',
          'figcaption',
          'blockquote',
        ];
        const elements = [];

        const isValid = (el) => {
          if (!el.offsetParent) return false;
          const text = el.innerText.trim();
          if (text.length < 2) return false;
          if (el.closest('pre') || el.closest('code') || el.closest('.no-translate')) return false;
          if (/^[\d\s\W]+$/.test(text)) return false;
          return true;
        };

        textTags.forEach((tag) => {
          document.querySelectorAll(tag).forEach((el, index) => {
            const hasBlockChildren = Array.from(el.children).some((child) => {
              const display = window.getComputedStyle(child).display;
              return (
                ['block', 'table', 'flex', 'grid'].includes(display) &&
                !['span', 'a', 'strong', 'em', 'b', 'i', 'code'].includes(
                  child.tagName.toLowerCase()
                )
              );
            });

            if (!hasBlockChildren && isValid(el)) {
              const id = `translate - ${tag} -${index} -${Math.random().toString(36).substr(2, 9)} `;
              el.setAttribute('data-translate-id', id);
              elements.push({
                id,
                text: el.innerText.trim(),
                tagName: tag,
              });
            }
          });
        });

        return elements;
      });

      this.logger.info(`Found ${elementsToTranslate.length} elements to translate`);

      if (elementsToTranslate.length === 0) {
        return;
      }

      // 2. Check cache and filter
      const uncachedElements = [];
      const cachedTranslations = {};

      for (const item of elementsToTranslate) {
        const cached = this._getFromCache(item.text);
        if (cached) {
          cachedTranslations[item.id] = cached;
        } else {
          uncachedElements.push(item);
        }
      }

      this.logger.info(
        `Cache hit: ${elementsToTranslate.length - uncachedElements.length}/${elementsToTranslate.length}`
      );

      // 3. Process uncached elements in batches
      if (uncachedElements.length > 0) {
        const batchSize = 10;
        const batches = [];
        for (let i = 0; i < uncachedElements.length; i += batchSize) {
          batches.push(uncachedElements.slice(i, i + batchSize));
        }

        this.logger.info(`Starting DOM translation batches`, {
          totalBatches: batches.length,
          totalItems: uncachedElements.length,
          batchSize,
          concurrency: this.concurrency,
        });

        // 使用 p-limit 控制并发，并为每个批次提供重试
        const limit = pLimit(this.concurrency || 1);
        let completedBatches = 0;
        let failedBatches = 0;

        const tasks = batches.map((batch, batchIndex) =>
          limit(async () => {
            const batchStartTime = Date.now();
            this.logger.debug(`Starting DOM batch ${batchIndex + 1}/${batches.length}`, {
              itemCount: batch.length,
            });

            try {
              // 为每个批次添加独立的超时保护
              const batchTimeout = this.timeoutMs || 60000;
              const timeoutPromise = new Promise((_, reject) => {
                setTimeout(
                  () =>
                    reject(
                      new Error(`DOM batch ${batchIndex + 1} timeout after ${batchTimeout}ms`)
                    ),
                  batchTimeout
                );
              });

              const translatePromise = this._translateBatchWithRetry(batch);
              const res = await Promise.race([translatePromise, timeoutPromise]);

              if (res) {
                Object.entries(res).forEach(([id, text]) => {
                  const originalItem = batch.find((item) => item.id === id);
                  if (originalItem) {
                    this._saveToCache(originalItem.text, text);
                    cachedTranslations[id] = text;
                  }
                });
              }

              completedBatches++;
              this.logger.info(`DOM batch ${batchIndex + 1}/${batches.length} completed`, {
                elapsed: Date.now() - batchStartTime,
                progress: `${completedBatches}/${batches.length}`,
              });
            } catch (err) {
              failedBatches++;
              this.logger.error(
                `DOM batch ${batchIndex + 1}/${batches.length} failed after retries`,
                {
                  error: err.message,
                  elapsed: Date.now() - batchStartTime,
                  progress: `${completedBatches}/${batches.length}`,
                }
              );
            } finally {
              // 轻微延迟，避免打爆速率限制
              await delay(200);
            }
          })
        );

        // 为整个批处理过程添加总超时
        const totalTimeout = (this.timeoutMs || 60000) * batches.length;
        const totalTimeoutPromise = new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error(`Total DOM translation timeout after ${totalTimeout}ms`)),
            totalTimeout
          );
        });

        try {
          await Promise.race([Promise.all(tasks), totalTimeoutPromise]);
          this.logger.info('All DOM translation batches completed', {
            completed: completedBatches,
            failed: failedBatches,
            total: batches.length,
          });
        } catch (err) {
          this.logger.warn('DOM translation batches did not complete in time', {
            error: err.message,
            completed: completedBatches,
            failed: failedBatches,
            total: batches.length,
          });
          // 即使超时，也继续处理已完成的翻译
        }
      }

      // 4. Apply all translations (cached + new)
      if (Object.keys(cachedTranslations).length > 0) {
        await page.evaluate(
          (translations, bilingual) => {
            Object.entries(translations).forEach(([id, translatedText]) => {
              const el = document.querySelector(`[data-translate-id="${id}"]`);
              if (el) {
                if (bilingual) {
                  const originalText = el.innerHTML;
                  if (el.querySelector('.translated-text')) return;

                  el.innerHTML = `
                                    <div class="original-text" style="opacity: 0.7; font-size: 0.9em; margin-bottom: 4px;">${originalText}</div>
                                    <div class="translated-text" style="color: #000; font-weight: 500;">${translatedText}</div>
                                `;
                } else {
                  el.innerText = translatedText;
                }
                el.removeAttribute('data-translate-id');
              }
            });
          },
          cachedTranslations,
          this.bilingual
        );
      }

      this.logger.info('Translation completed');
    } catch (error) {
      this.logger.error('Translation failed', { error: error.message });
    }
  }

  /**
   * Translate Markdown content instead of DOM.
   * 保留 frontmatter 和代码块，只翻译普通文本段落。
   * @param {string} markdownContent
   * @returns {Promise<string>}
   */
  async translateMarkdown(markdownContent) {
    if (!this.enabled) {
      this.logger.debug('Translation disabled for markdown, returning original');
      return markdownContent;
    }

    if (!markdownContent || typeof markdownContent !== 'string') {
      return markdownContent;
    }

    const lines = markdownContent.split('\n');
    const outputLines = [];
    const segments = [];
    let currentTextLines = [];
    let inFrontmatter = false;
    let inCodeBlock = false;

    const flushCurrentSegment = () => {
      if (currentTextLines.length === 0) return;
      const text = currentTextLines.join('\n').trim();
      currentTextLines = [];
      if (!text) return;

      const id = `md-${segments.length}`;
      segments.push({ id, text });
      outputLines.push(`__MD_SEGMENT_${id}__`);
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 处理文件开头的 YAML frontmatter
      if (i === 0 && trimmed === '---') {
        inFrontmatter = true;
        outputLines.push(line);
        continue;
      }

      if (inFrontmatter) {
        outputLines.push(line);
        if (trimmed === '---') {
          inFrontmatter = false;
        }
        continue;
      }

      // 处理代码块 fence（``` 或 ~~~）
      const fenceMatch = trimmed.match(/^(```|~~~)/);
      if (fenceMatch) {
        flushCurrentSegment();
        inCodeBlock = !inCodeBlock;
        outputLines.push(line);
        continue;
      }

      if (inCodeBlock) {
        outputLines.push(line);
        continue;
      }

      // 空行：结束当前段落
      if (trimmed === '') {
        flushCurrentSegment();
        outputLines.push(line);
        continue;
      }

      // 结构性行（标题/列表项）尽量作为单独段落，方便上下文清晰
      const isHeading = /^#{1,6}\s+/.test(trimmed);
      const isListItem = /^(\*|\-|\+)\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed);

      if ((isHeading || isListItem) && currentTextLines.length > 0) {
        flushCurrentSegment();
      }

      // 其他行：加入可翻译段落
      currentTextLines.push(line);
    }

    // 结束时刷新残留段落
    flushCurrentSegment();

    if (segments.length === 0) {
      return markdownContent;
    }

    // 查缓存
    const cachedTranslations = {};
    const uncachedSegments = [];

    for (const seg of segments) {
      const cached = this._getFromCache(seg.text);
      if (cached) {
        cachedTranslations[seg.id] = cached;
      } else {
        uncachedSegments.push(seg);
      }
    }

    this.logger.info('Markdown translation segments', {
      total: segments.length,
      fromCache: segments.length - uncachedSegments.length,
      uncached: uncachedSegments.length,
    });

    // 处理未命中缓存的段落
    if (uncachedSegments.length > 0) {
      const batchSize = 5; // 减小批次大小，降低超时风险
      const batches = [];
      for (let i = 0; i < uncachedSegments.length; i += batchSize) {
        batches.push(uncachedSegments.slice(i, i + batchSize));
      }

      this.logger.info(`Starting Markdown translation batches`, {
        totalBatches: batches.length,
        batchSize,
        concurrency: this.concurrency,
      });

      const limit = pLimit(this.concurrency || 1);
      let completedBatches = 0;
      let failedBatches = 0;

      const tasks = batches.map((batch, batchIndex) =>
        limit(async () => {
          const batchStartTime = Date.now();
          this.logger.debug(`Starting batch ${batchIndex + 1}/${batches.length}`, {
            segmentCount: batch.length,
          });

          try {
            // 为每个批次添加独立的超时保护
            const batchTimeout = this.timeoutMs || 60000;
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(
                () => reject(new Error(`Batch ${batchIndex + 1} timeout after ${batchTimeout}ms`)),
                batchTimeout
              );
            });

            const translatePromise = this._translateBatchWithRetry(batch);
            const res = await Promise.race([translatePromise, timeoutPromise]);

            if (res) {
              Object.entries(res).forEach(([id, translated]) => {
                const originalItem = batch.find((item) => item.id === id);
                if (originalItem) {
                  this._saveToCache(originalItem.text, translated);
                  cachedTranslations[id] = translated;
                }
              });
            }

            completedBatches++;
            this.logger.info(`Batch ${batchIndex + 1}/${batches.length} completed`, {
              elapsed: Date.now() - batchStartTime,
              progress: `${completedBatches}/${batches.length}`,
            });
          } catch (err) {
            failedBatches++;
            this.logger.error(`Batch ${batchIndex + 1}/${batches.length} failed after retries`, {
              error: err.message,
              elapsed: Date.now() - batchStartTime,
              progress: `${completedBatches}/${batches.length}`,
            });
          } finally {
            await delay(200);
          }
        })
      );

      // 为整个批处理过程添加总超时
      const totalTimeout = (this.timeoutMs || 60000) * batches.length;
      const totalTimeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error(`Total translation timeout after ${totalTimeout}ms`)),
          totalTimeout
        );
      });

      try {
        await Promise.race([Promise.all(tasks), totalTimeoutPromise]);
        this.logger.info('All Markdown translation batches completed', {
          completed: completedBatches,
          failed: failedBatches,
          total: batches.length,
        });
      } catch (err) {
        this.logger.warn('Markdown translation batches did not complete in time', {
          error: err.message,
          completed: completedBatches,
          failed: failedBatches,
          total: batches.length,
        });
        // 即使超时，也继续处理已完成的翻译
      }
    }

    // 重建 Markdown：用翻译结果替换占位符
    const idToOriginal = {};
    for (const seg of segments) {
      idToOriginal[seg.id] = seg.text;
    }

    const finalLines = outputLines.map((line) => {
      const match = line.match(/^__MD_SEGMENT_(.+)__$/);
      if (!match) return line;

      const id = match[1];
      const original = idToOriginal[id] || '';
      const translated = cachedTranslations[id] || original;

      if (this.bilingual) {
        return `${original}\n\n${translated}`;
      }

      return translated;
    });

    return finalLines.join('\n');
  }

  /**
   * Translate a batch of elements using spawn
   * @param {Array} batch
   * @returns {Promise<Object>} Map of id -> translated text
   */
  async _translateBatch(batch) {
    const inputMap = {};
    batch.forEach((item) => {
      inputMap[item.id] = item.text;
    });

    const instructions = `
You are a professional technical translator. Translate the following JSON object values into ${this.targetLanguage}.
Keep the keys unchanged.
The values may contain Markdown formatting (headings, lists, links, emphasis) or code snippets.
Preserve all Markdown syntax characters (such as #, *, -, _, [, ], (, ), and backticks) and code fencing; only translate the human language text.
Do not translate code identifiers, API names, or URLs.
Output ONLY the valid JSON object with translated values. Do not wrap the result in additional Markdown, code fences, or explanations.
`;

    if (!this.client) {
      this.client = new GeminiClient({
        timeoutMs: this.timeoutMs,
        logger: this.logger,
      });
    }

    return this.client.translateJson({
      instructions,
      inputMap,
    });
  }

  /**
   * Translate a single segment (for individual retry)
   * @param {Object} segment - { id, text }
   * @returns {Promise<Object>} { id: translatedText }
   */
  async _translateSingleSegment(segment) {
    return this._translateBatch([segment]);
  }

  /**
   * Batch translation with segment-level retry (best practice)
   * First attempts batch translation, then retries failed segments individually
   * Uses exponential backoff with decorrelated jitter
   * Note: This method is "best-effort" and may return partial results when
   * some segments permanently fail; callers should handle untranslated
   * segments gracefully (they will keep the original content).
   * @param {Array} batch - Array of { id, text } objects
   * @returns {Promise<Object>} Map of id -> translated text
   */
  async _translateBatchWithRetry(batch) {
    const maxSegmentRetries = this.maxSegmentRetries || 2;
    const jitterStrategy = this.jitterStrategy || 'decorrelated';
    const maxDelay = this.maxDelay || 30000;

    // First attempt: try the entire batch
    let results = {};
    let failedSegments = [...batch];

    try {
      const batchResult = await retry(() => this._translateBatch(batch), {
        maxAttempts: this.maxRetries,
        delay: this.retryDelay,
        backoff: 2,
        maxDelay,
        jitterStrategy,
        onRetry: (attempt, error, waitTime) => {
          this.logger.warn('Retrying translation batch', {
            attempt,
            maxAttempts: this.maxRetries,
            error: error.message,
            waitTime: `${waitTime}ms`,
            jitterStrategy,
          });
        },
      });

      if (batchResult) {
        results = { ...batchResult };
        // Identify segments that got translated
        failedSegments = batch.filter((seg) => !batchResult[seg.id]);
      }
    } catch (batchError) {
      this.logger.warn('Batch translation failed, will retry individual segments', {
        error: batchError.message,
        segmentCount: batch.length,
      });
    }

    // Second phase: retry failed segments individually
    if (failedSegments.length > 0 && failedSegments.length < batch.length) {
      this.logger.info('Retrying failed segments individually', {
        failedCount: failedSegments.length,
        totalCount: batch.length,
      });
    }

    for (const segment of failedSegments) {
      try {
        const segmentResult = await retry(() => this._translateSingleSegment(segment), {
          maxAttempts: maxSegmentRetries,
          delay: this.retryDelay,
          backoff: 2,
          maxDelay,
          jitterStrategy,
          onRetry: (attempt, error, waitTime) => {
            this.logger.warn('Retrying single segment', {
              segmentId: segment.id,
              attempt,
              maxAttempts: maxSegmentRetries,
              error: error.message,
              waitTime: `${waitTime}ms`,
            });
          },
        });

        if (segmentResult && segmentResult[segment.id]) {
          results[segment.id] = segmentResult[segment.id];
          this.logger.debug('Segment retry succeeded', { segmentId: segment.id });
        }
      } catch (segmentError) {
        this.logger.error('Segment retry exhausted', {
          segmentId: segment.id,
          text: segment.text.substring(0, 50) + '...',
          error: segmentError.message,
        });
        // Continue with other segments even if one fails
      }
    }

    // Log final stats
    const successCount = Object.keys(results).length;
    const failCount = batch.length - successCount;

    if (failCount > 0) {
      this.logger.warn('Batch completed with some failures', {
        success: successCount,
        failed: failCount,
        total: batch.length,
      });
    }

    return results;
  }
}
