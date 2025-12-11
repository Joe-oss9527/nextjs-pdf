// tests/services/geminiClient.test.js
import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { GeminiClient } from '../../src/services/geminiClient.js';

describe('GeminiClient', () => {
  const createLogger = () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  });

  test('translateJson 应该解析有效的 JSON 输出', async () => {
    const logger = createLogger();

    const spawn = jest.fn(() => {
      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      const handlers = {};

      const child = {
        stdout,
        stderr,
        stdin: {
          write: jest.fn(),
          end: jest.fn()
        },
        kill: jest.fn(),
        on: (event, handler) => {
          handlers[event] = handler;
        }
      };

      // 模拟异步输出和正常退出
      process.nextTick(() => {
        stdout.emit('data', Buffer.from('{"id1":"你好","id2":"世界"}'));
        handlers.close && handlers.close(0);
      });

      return child;
    });

    const client = new GeminiClient({
      timeoutMs: 5000,
      logger,
      spawn
    });

    const inputMap = { id1: 'hello', id2: 'world' };
    const result = await client.translateJson({
      instructions: 'translate',
      inputMap
    });

    expect(result).toEqual({
      id1: '你好',
      id2: '世界'
    });
  });

  test('当子进程退出码非 0 时应该抛出错误', async () => {
    const logger = createLogger();

    const spawn = jest.fn(() => {
      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      const handlers = {};

      const child = {
        stdout,
        stderr,
        stdin: {
          write: jest.fn(),
          end: jest.fn()
        },
        kill: jest.fn(),
        on: (event, handler) => {
          handlers[event] = handler;
        }
      };

      process.nextTick(() => {
        stderr.emit('data', Buffer.from('error message'));
        handlers.close && handlers.close(1);
      });

      return child;
    });

    const client = new GeminiClient({
      timeoutMs: 5000,
      logger,
      spawn
    });

    await expect(
      client.translateJson({
        instructions: 'translate',
        inputMap: { id: 'text' }
      })
    ).rejects.toThrow(/gemini-cli exited with code 1/);

    expect(logger.error).toHaveBeenCalled();
  });
});

