
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createLogger } from '../utils/logger.js';
import { delay } from '../utils/common.js';

/**
 * Translation Service
 * Handles content translation using gemini-cli with caching and concurrency control
 */
export class TranslationService {
    constructor(config = {}) {
        this.config = config;
        this.logger = createLogger({ logLevel: config.logLevel });
        this.logger.info('TranslationService constructor called', { configKeys: Object.keys(config) });
        this.enabled = config.translation?.enabled || false;
        this.logger.info('TranslationService enabled:', { enabled: this.enabled });
        this.bilingual = config.translation?.bilingual || false;
        this.targetLanguage = config.translation?.targetLanguage || 'Chinese';
        this.concurrency = config.translation?.concurrency || 1;

        // Cache directory
        this.cacheDir = path.join(process.cwd(), '.temp', 'translation_cache');
        this._ensureCacheDir();
    }

    _ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    _getCacheKey(text) {
        return crypto.createHash('md5').update(`${this.targetLanguage}:${text} `).digest('hex');
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
            fs.writeFileSync(cachePath, JSON.stringify({
                original: text,
                translation,
                timestamp: Date.now()
            }));
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

        this.logger.info(`Starting translation to ${this.targetLanguage} (Bilingual: ${this.bilingual})`);

        try {
            // 1. Identify translatable elements
            const elementsToTranslate = await page.evaluate(() => {
                const textTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'th', 'td', 'figcaption', 'blockquote'];
                const elements = [];

                const isValid = (el) => {
                    if (!el.offsetParent) return false;
                    const text = el.innerText.trim();
                    if (text.length < 2) return false;
                    if (el.closest('pre') || el.closest('code') || el.closest('.no-translate')) return false;
                    if (/^[\d\s\W]+$/.test(text)) return false;
                    return true;
                };

                textTags.forEach(tag => {
                    document.querySelectorAll(tag).forEach((el, index) => {
                        const hasBlockChildren = Array.from(el.children).some(child => {
                            const display = window.getComputedStyle(child).display;
                            return ['block', 'table', 'flex', 'grid'].includes(display) && !['span', 'a', 'strong', 'em', 'b', 'i', 'code'].includes(child.tagName.toLowerCase());
                        });

                        if (!hasBlockChildren && isValid(el)) {
                            const id = `translate - ${tag} -${index} -${Math.random().toString(36).substr(2, 9)} `;
                            el.setAttribute('data-translate-id', id);
                            elements.push({
                                id,
                                text: el.innerText.trim(),
                                tagName: tag
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

            this.logger.info(`Cache hit: ${elementsToTranslate.length - uncachedElements.length}/${elementsToTranslate.length}`);

            // 3. Process uncached elements in batches
            if (uncachedElements.length > 0) {
                const batchSize = 10;
                const batches = [];
                for (let i = 0; i < uncachedElements.length; i += batchSize) {
                    batches.push(uncachedElements.slice(i, i + batchSize));
                }

                this.logger.info(`Processing ${batches.length} batches for ${uncachedElements.length} items...`);

                // Use simple concurrency control
                const activePromises = [];
                let aborted = false;

                for (let i = 0; i < batches.length; i++) {
                    if (aborted) break;

                    const batch = batches[i];
                    const promise = this._translateBatch(batch).then(res => {
                        // Save to cache
                        if (res) {
                            Object.entries(res).forEach(([id, text]) => {
                                const originalItem = batch.find(item => item.id === id);
                                if (originalItem) {
                                    this._saveToCache(originalItem.text, text);
                                    cachedTranslations[id] = text;
                                }
                            });
                        }
                    }).catch(err => {
                        this.logger.error(`Batch ${i + 1} failed`, { error: err.message });
                        // If timeout or severe error, abort remaining batches to save time
                        if (err.message.includes('timed out')) {
                            aborted = true;
                        }
                    });

                    activePromises.push(promise);

                    if (activePromises.length >= this.concurrency) {
                        await Promise.race(activePromises);
                        // Remove finished promises
                        // A bit complex to remove exact promise, so we just wait for one
                        // Simplification: just await all if we hit limit, or use a proper pool.
                        // For simplicity in this context without external libs like p-limit:
                        // We'll just await the oldest one.
                        const oldest = activePromises.shift();
                        await oldest;
                    }

                    // Small delay to avoid rate limits
                    await delay(200);
                }

                await Promise.all(activePromises);
            }

            // 4. Apply all translations (cached + new)
            if (Object.keys(cachedTranslations).length > 0) {
                await page.evaluate((translations, bilingual) => {
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
                }, cachedTranslations, this.bilingual);
            }

            this.logger.info('Translation completed');

        } catch (error) {
            this.logger.error('Translation failed', { error: error.message });
        }
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
Do not translate code, variable names, or technical terms that should remain in English.
Output ONLY the valid JSON object with translated values. No markdown formatting, no explanations.
`;

        const jsonInput = JSON.stringify(inputMap, null, 2);

        return new Promise((resolve, reject) => {
            // Pass instructions as argument, JSON via stdin
            const child = spawn('gemini', [instructions]);

            // Set a timeout for the translation process
            const timeout = setTimeout(() => {
                child.kill();
                reject(new Error('Translation timed out'));
            }, 20000); // 20 seconds timeout

            let stdout = '';
            let stderr = '';

            // Write JSON to stdin
            child.stdin.write(jsonInput);
            child.stdin.end();

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                clearTimeout(timeout);
                if (code !== 0) {
                    this.logger.error('gemini-cli exited with error', { code, stderr });
                    // Don't reject, just return empty so other batches proceed? 
                    // Or reject to handle in caller.
                    reject(new Error(`gemini-cli exited with code ${code}: ${stderr}`));
                    return;
                }

                try {
                    let outputJsonStr = stdout.trim();
                    // Robust JSON extraction
                    const firstBrace = outputJsonStr.indexOf('{');
                    const lastBrace = outputJsonStr.lastIndexOf('}');

                    if (firstBrace !== -1 && lastBrace !== -1) {
                        outputJsonStr = outputJsonStr.substring(firstBrace, lastBrace + 1);
                    } else {
                        throw new Error('No JSON object found in output');
                    }

                    const translatedMap = JSON.parse(outputJsonStr);
                    resolve(translatedMap);
                } catch (e) {
                    this.logger.warn('Failed to parse translation JSON', { error: e.message, output: stdout.substring(0, 200) });
                    resolve(null); // Return null on parse error
                }
            });

            child.on('error', (err) => {
                clearTimeout(timeout);
                this.logger.error('gemini spawn error', { error: err.message });
                reject(err);
            });
        });
    }
}
