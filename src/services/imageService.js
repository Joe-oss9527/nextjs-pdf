// src/services/imageService.js
import { EventEmitter } from 'events';

/**
 * 图片处理服务
 * 提供图片加载、懒加载检测、滚动触发等功能
 */
export class ImageService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      defaultTimeout: options.defaultTimeout || 15000,
      checkInterval: options.checkInterval || 500,
      scrollDistance: options.scrollDistance || 300,
      scrollDelay: options.scrollDelay || 200,
      maxScrollAttempts: options.maxScrollAttempts || 3,
      enableIntersectionObserver: options.enableIntersectionObserver !== false,
      observerRootMargin: options.observerRootMargin || '500px',
      ...options
    };

    this.logger = options.logger;
    this.stats = {
      imagesProcessed: 0,
      imagesLoaded: 0,
      imagesFailed: 0,
      lazyImagesTriggered: 0,
      scrollOperations: 0,
      totalLoadTime: 0
    };
  }

  /**
   * 在页面中设置图片观察器
   */
  async setupImageObserver(page) {
    try {
      await page.evaluateOnNewDocument((options) => {
        // 防止重复设置
        if (window.__imageObserverSetup) return;
        window.__imageObserverSetup = true;

        // 修改图片加载行为
        const originalImage = window.Image;
        window.Image = class extends originalImage {
          constructor() {
            super();
            this.loading = 'eager';
            
            // 监听加载事件
            this.addEventListener('load', () => {
              window.dispatchEvent(new CustomEvent('imageLoaded', { 
                detail: { src: this.src, success: true } 
              }));
            });
            
            this.addEventListener('error', () => {
              window.dispatchEvent(new CustomEvent('imageLoaded', { 
                detail: { src: this.src, success: false } 
              }));
            });
          }
        };

        // 设置 Intersection Observer
        const setupIntersectionObserver = () => {
          if (!window.IntersectionObserver) return;

          const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                const img = entry.target;
                
                // 处理 data-src 懒加载
                if (img.dataset.src && !img.src) {
                  img.src = img.dataset.src;
                  window.dispatchEvent(new CustomEvent('lazyImageTriggered', {
                    detail: { src: img.dataset.src }
                  }));
                }
                
                // 处理 data-srcset 懒加载
                if (img.dataset.srcset && !img.srcset) {
                  img.srcset = img.dataset.srcset;
                }
                
                // 处理其他懒加载属性
                ['data-original', 'data-lazy-src', 'data-echo'].forEach(attr => {
                  const value = img.getAttribute(attr);
                  if (value && !img.src) {
                    img.src = value;
                    window.dispatchEvent(new CustomEvent('lazyImageTriggered', {
                      detail: { src: value, attribute: attr }
                    }));
                  }
                });
                
                observer.unobserve(img);
              }
            });
          }, { 
            rootMargin: options.observerRootMargin,
            threshold: 0.1
          });

          // 观察所有图片
          const observeImages = () => {
            document.querySelectorAll('img').forEach(img => {
              observer.observe(img);
            });
          };

          // 初始观察
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', observeImages);
          } else {
            observeImages();
          }

          // 观察动态添加的图片
          const mutationObserver = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
              mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) { // Element node
                  if (node.tagName === 'IMG') {
                    observer.observe(node);
                  } else if (node.querySelectorAll) {
                    node.querySelectorAll('img').forEach(img => {
                      observer.observe(img);
                    });
                  }
                }
              });
            });
          });

          mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
          });

          // 保存observer以便后续使用
          window.__imageObserver = observer;
          window.__mutationObserver = mutationObserver;
        };

        // 在DOM准备就绪时设置
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', setupIntersectionObserver);
        } else {
          setupIntersectionObserver();
        }

      }, this.options);

      this.logger?.debug('图片观察器设置完成');
      this.emit('observer-setup', { pageUrl: page.url() });

    } catch (error) {
      this.logger?.error('设置图片观察器失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 等待页面中的图片加载完成
   */
  async waitForImages(page, options = {}) {
    const config = { ...this.options, ...options };
    const startTime = Date.now();

    try {
      this.logger?.debug('开始等待图片加载');

      // 监听页面中的图片加载事件
      const imageStats = { loaded: 0, failed: 0 };
      
      await page.evaluateOnNewDocument(() => {
        window.__imageLoadStats = { loaded: 0, failed: 0 };
        
        window.addEventListener('imageLoaded', (event) => {
          if (event.detail.success) {
            window.__imageLoadStats.loaded++;
          } else {
            window.__imageLoadStats.failed++;
          }
        });
      });

      let lastImageCount = 0;
      let stableCount = 0;
      const maxStableChecks = 3;

      while (Date.now() - startTime < config.defaultTimeout) {
        const result = await page.evaluate(() => {
          const images = Array.from(document.querySelectorAll('img'));
          const stats = window.__imageLoadStats || { loaded: 0, failed: 0 };
          
          const imageInfo = images.map(img => ({
            src: img.src || img.dataset.src || '',
            complete: img.complete,
            naturalHeight: img.naturalHeight,
            naturalWidth: img.naturalWidth,
            loading: img.loading,
            hasError: img.complete && img.naturalHeight === 0
          }));

          const validImages = imageInfo.filter(info => info.src);
          const loadedImages = validImages.filter(info => 
            info.complete && info.naturalHeight > 0
          );
          const failedImages = validImages.filter(info => info.hasError);

          return {
            total: validImages.length,
            loaded: loadedImages.length,
            failed: failedImages.length,
            pending: validImages.length - loadedImages.length - failedImages.length,
            stats,
            allLoaded: validImages.length > 0 && 
                      (loadedImages.length + failedImages.length) === validImages.length
          };
        });

        // 更新统计信息
        this.stats.imagesProcessed = result.total;
        this.stats.imagesLoaded = result.loaded;
        this.stats.imagesFailed = result.failed;

        this.emit('images-progress', {
          ...result,
          elapsedTime: Date.now() - startTime
        });

        // 如果所有图片都已处理完成
        if (result.allLoaded) {
          const loadTime = Date.now() - startTime;
          this.stats.totalLoadTime += loadTime;
          
          this.logger?.debug('所有图片加载完成', {
            total: result.total,
            loaded: result.loaded,
            failed: result.failed,
            loadTime: `${loadTime}ms`
          });

          this.emit('images-complete', {
            ...result,
            loadTime
          });

          return true;
        }

        // 检查图片数量是否稳定（防止无限等待动态加载的图片）
        if (result.total === lastImageCount) {
          stableCount++;
          if (stableCount >= maxStableChecks) {
            this.logger?.warn('图片数量已稳定，停止等待新图片');
            break;
          }
        } else {
          stableCount = 0;
          lastImageCount = result.total;
        }

        await new Promise(resolve => setTimeout(resolve, config.checkInterval));
      }

      const finalTime = Date.now() - startTime;
      this.logger?.warn('图片加载超时', { timeout: config.defaultTimeout, elapsed: finalTime });
      
      this.emit('images-timeout', {
        timeout: config.defaultTimeout,
        elapsed: finalTime,
        stats: this.stats
      });

      return false;

    } catch (error) {
      this.logger?.error('等待图片加载时发生错误', { error: error.message });
      this.emit('images-error', { error: error.message });
      return false;
    }
  }

  /**
   * 滚动页面以触发懒加载
   */
  async scrollPage(page, options = {}) {
    const config = { ...this.options, ...options };

    try {
      this.logger?.debug('开始滚动页面触发懒加载');
      this.stats.scrollOperations++;

      const scrollResult = await page.evaluate(async (distance, delay) => {
        const scrollInfo = {
          totalHeight: document.body.scrollHeight,
          viewportHeight: window.innerHeight,
          scrollSteps: []
        };

        let currentPosition = 0;
        let stepCount = 0;

        while (currentPosition < scrollInfo.totalHeight) {
          const stepStart = Date.now();
          window.scrollTo(0, currentPosition);
          
          // 等待滚动动画和懒加载触发
          await new Promise(resolve => setTimeout(resolve, delay));
          
          const stepEnd = Date.now();
          scrollInfo.scrollSteps.push({
            position: currentPosition,
            duration: stepEnd - stepStart
          });

          currentPosition += distance;
          stepCount++;

          // 防止无限滚动
          if (stepCount > 50) break;
        }

        // 滚动到顶部
        window.scrollTo(0, 0);
        await new Promise(resolve => setTimeout(resolve, delay));

        return scrollInfo;
      }, config.scrollDistance, config.scrollDelay);

      this.logger?.debug('页面滚动完成', {
        totalHeight: scrollResult.totalHeight,
        steps: scrollResult.scrollSteps.length
      });

      this.emit('scroll-complete', scrollResult);
      return scrollResult;

    } catch (error) {
      this.logger?.error('滚动页面时发生错误', { error: error.message });
      this.emit('scroll-error', { error: error.message });
      throw error;
    }
  }

  /**
   * 触发所有懒加载图片
   */
  async triggerLazyLoading(page, options = {}) {
    const config = { ...this.options, ...options };
    
    try {
      this.logger?.debug('开始触发懒加载图片');

      // 先滚动页面
      await this.scrollPage(page, config);

      // 等待一小段时间让滚动生效
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 手动触发所有懒加载图片
      const triggerResult = await page.evaluate(() => {
        const lazyImages = [];
        const selectors = [
          'img[loading="lazy"]',
          'img[data-src]',
          'img[data-srcset]',
          'img[data-original]',
          'img[data-lazy-src]',
          'img[data-echo]'
        ];

        selectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(img => {
            if (!lazyImages.includes(img)) {
              lazyImages.push(img);
            }
          });
        });

        lazyImages.forEach(img => {
          // 设置为eager加载
          if (img.loading === 'lazy') {
            img.loading = 'eager';
          }

          // 处理各种懒加载属性
          const lazyAttrs = ['data-src', 'data-srcset', 'data-original', 'data-lazy-src', 'data-echo'];
          lazyAttrs.forEach(attr => {
            const value = img.getAttribute(attr);
            if (value) {
              if (attr === 'data-srcset') {
                img.srcset = value;
              } else if (!img.src) {
                img.src = value;
              }
              img.removeAttribute(attr);
            }
          });

          // 触发自定义事件
          window.dispatchEvent(new CustomEvent('lazyImageTriggered', {
            detail: { element: img, src: img.src }
          }));
        });

        return {
          totalLazyImages: lazyImages.length,
          triggered: lazyImages.filter(img => img.src).length
        };
      });

      this.stats.lazyImagesTriggered += triggerResult.triggered;

      this.logger?.debug('懒加载触发完成', triggerResult);
      this.emit('lazy-loading-triggered', triggerResult);

      // 等待触发的图片加载完成
      const allLoaded = await this.waitForImages(page, config);

      return {
        ...triggerResult,
        allImagesLoaded: allLoaded,
        stats: this.stats
      };

    } catch (error) {
      this.logger?.error('触发懒加载时发生错误', { error: error.message });
      this.emit('lazy-loading-error', { error: error.message });
      throw error;
    }
  }

  /**
   * 完整的图片处理流程
   */
  async processPageImages(page, options = {}) {
    const config = { ...this.options, ...options };
    const startTime = Date.now();
    
    try {
      this.logger?.info('开始处理页面图片');

      // 设置图片观察器
      await this.setupImageObserver(page);

      // 等待初始图片加载
      await this.waitForImages(page, { defaultTimeout: 5000 });

      // 触发懒加载
      const lazyResult = await this.triggerLazyLoading(page, options);

      // 多次尝试确保所有图片都加载
      let attempts = 0;
      let allLoaded = false;
      
      while (attempts < config.maxScrollAttempts && !allLoaded) {
        await this.scrollPage(page);
        allLoaded = await this.waitForImages(page, { defaultTimeout: 8000 });
        attempts++;
        
        if (!allLoaded) {
          this.logger?.debug(`图片加载尝试 ${attempts}/${config.maxScrollAttempts}`);
        }
      }

      const totalTime = Date.now() - startTime;
      const result = {
        success: true,
        totalTime,
        attempts,
        allImagesLoaded: allLoaded,
        lazyImagesTriggered: lazyResult.triggered,
        stats: { ...this.stats }
      };

      this.logger?.info('页面图片处理完成', result);
      this.emit('page-images-complete', result);

      return result;

    } catch (error) {
      const errorResult = {
        success: false,
        error: error.message,
        totalTime: Date.now() - startTime,
        stats: { ...this.stats }
      };

      this.logger?.error('页面图片处理失败', errorResult);
      this.emit('page-images-error', errorResult);

      return errorResult;
    }
  }

  /**
   * 获取图片服务统计信息
   */
  getStats() {
    return {
      ...this.stats,
      averageLoadTime: this.stats.imagesProcessed > 0 
        ? this.stats.totalLoadTime / this.stats.imagesProcessed 
        : 0
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      imagesProcessed: 0,
      imagesLoaded: 0,
      imagesFailed: 0,
      lazyImagesTriggered: 0,
      scrollOperations: 0,
      totalLoadTime: 0
    };
    
    this.emit('stats-reset');
  }

  /**
   * 清理资源
   */
  async cleanup(page) {
    try {
      await page.evaluate(() => {
        // 清理观察器
        if (window.__imageObserver) {
          window.__imageObserver.disconnect();
          delete window.__imageObserver;
        }
        
        if (window.__mutationObserver) {
          window.__mutationObserver.disconnect();
          delete window.__mutationObserver;
        }
        
        // 清理标记
        delete window.__imageObserverSetup;
        delete window.__imageLoadStats;
      });

      this.emit('cleanup-complete');
      
    } catch (error) {
      this.logger?.warn('清理图片服务资源时发生错误', { error: error.message });
    }
  }
}