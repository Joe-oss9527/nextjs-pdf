// src/services/geminiClient.js
import { spawn as defaultSpawn } from 'child_process';

/**
 * GeminiClient
 * 负责与 gemini CLI 进程交互并返回解析后的 JSON 结果
 */
export class GeminiClient {
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs || 60000;
    this.logger = options.logger;
    this.spawn = options.spawn || defaultSpawn;
  }

  /**
   * 翻译一个 JSON 对象的值
   * @param {Object} params
   * @param {string} params.instructions - 传给 gemini 的提示词
   * @param {Object} params.inputMap - 待翻译的键值映射
   * @returns {Promise<Object>} 翻译后的键值映射
   */
  async translateJson({ instructions, inputMap }) {
    const jsonInput = JSON.stringify(inputMap, null, 2);
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const child = this.spawn('gemini', [instructions]);
      let killed = false;
      let resolved = false;

      // 健壮的超时处理：使用 SIGKILL 强制终止
      const timeout = setTimeout(() => {
        if (resolved) return;

        killed = true;
        if (this.logger) {
          this.logger.warn('Translation timeout, force killing process', {
            timeoutMs: this.timeoutMs,
            elapsed: Date.now() - startTime
          });
        }

        // 先尝试 SIGTERM，1秒后如果还没退出则使用 SIGKILL
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!resolved) {
            child.kill('SIGKILL');
          }
        }, 1000);
      }, this.timeoutMs);

      let stdout = '';
      let stderr = '';

      // 错误处理：stdin 写入可能失败
      try {
        child.stdin.write(jsonInput);
        child.stdin.end();
      } catch (err) {
        clearTimeout(timeout);
        if (this.logger) {
          this.logger.error('Failed to write to gemini stdin', { error: err.message });
        }
        reject(err);
        return;
      }

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code, signal) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);

        // 如果是被超时杀死的
        if (killed) {
          reject(new Error(`Translation timed out after ${this.timeoutMs}ms`));
          return;
        }

        if (code !== 0) {
          if (this.logger) {
            this.logger.error('gemini-cli exited with error', {
              code,
              signal,
              stderr: stderr.substring(0, 500),
              elapsed: Date.now() - startTime
            });
          }
          reject(new Error(`gemini-cli exited with code ${code}: ${stderr.substring(0, 200)}`));
          return;
        }

        try {
          let outputJsonStr = stdout.trim();
          const firstBrace = outputJsonStr.indexOf('{');
          const lastBrace = outputJsonStr.lastIndexOf('}');

          if (firstBrace !== -1 && lastBrace !== -1) {
            outputJsonStr = outputJsonStr.substring(firstBrace, lastBrace + 1);
          } else {
            throw new Error('No JSON object found in output');
          }

          const translatedMap = JSON.parse(outputJsonStr);

          if (this.logger) {
            this.logger.debug('Translation completed', {
              elapsed: Date.now() - startTime,
              keys: Object.keys(translatedMap).length
            });
          }

          resolve(translatedMap);
        } catch (e) {
          if (this.logger) {
            this.logger.warn('Failed to parse translation JSON', {
              error: e.message,
              output: stdout.substring(0, 200),
              elapsed: Date.now() - startTime
            });
          }
          resolve(null);
        }
      });

      child.on('error', (err) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        if (this.logger) {
          this.logger.error('gemini spawn error', {
            error: err.message,
            elapsed: Date.now() - startTime
          });
        }
        reject(err);
      });
    });
  }
}
