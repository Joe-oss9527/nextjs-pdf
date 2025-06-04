// src/services/queueManager.js
import PQueue from 'p-queue';
import { EventEmitter } from 'events';

export class QueueManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      concurrency: options.concurrency || 5,
      interval: options.interval || 1000,
      intervalCap: options.intervalCap || 5,
      timeout: options.timeout || 30000,
      throwOnTimeout: options.throwOnTimeout || false,
      ...options
    };

    this.queue = new PQueue({
      concurrency: this.options.concurrency,
      interval: this.options.interval,
      intervalCap: this.options.intervalCap,
      timeout: this.options.timeout,
      throwOnTimeout: this.options.throwOnTimeout
    });

    this.tasks = new Map();
    this.setupEventHandlers();
  }

  /**
   * 设置事件处理器
   */
  setupEventHandlers() {
    this.queue.on('active', () => {
      this.emit('active', {
        size: this.queue.size,
        pending: this.queue.pending
      });
    });

    this.queue.on('idle', () => {
      this.emit('idle');
    });

    this.queue.on('add', () => {
      this.emit('task-added', {
        size: this.queue.size,
        pending: this.queue.pending
      });
    });

    this.queue.on('next', () => {
      this.emit('task-completed', {
        size: this.queue.size,
        pending: this.queue.pending
      });
    });
  }

  /**
   * 添加任务
   */
  async addTask(id, fn, options = {}) {
    const task = {
      id,
      fn,
      priority: options.priority || 0,
      addedAt: Date.now(),
      status: 'pending'
    };

    this.tasks.set(id, task);

    const wrappedFn = async () => {
      task.status = 'running';
      task.startedAt = Date.now();

      try {
        const result = await fn();
        task.status = 'completed';
        task.completedAt = Date.now();
        task.duration = task.completedAt - task.startedAt;
        this.emit('task-success', { id, result, task });
        return result;
      } catch (error) {
        task.status = 'failed';
        task.error = error;
        task.failedAt = Date.now();
        this.emit('task-failure', { id, error, task });
        throw error;
      }
    };

    return this.queue.add(wrappedFn, { priority: task.priority });
  }

  /**
   * 批量添加任务
   */
  async addBatch(tasks) {
    const promises = tasks.map(({ id, fn, options }) =>
      this.addTask(id, fn, options)
    );
    return Promise.allSettled(promises);
  }

  /**
   * 等待所有任务完成
   */
  async waitForIdle() {
    await this.queue.onIdle();
  }

  /**
   * 清空队列
   */
  clear() {
    this.queue.clear();
    this.tasks.clear();
    this.emit('cleared');
  }

  /**
   * 暂停队列
   */
  pause() {
    this.queue.pause();
    this.emit('paused');
  }

  /**
   * 恢复队列
   */
  resume() {
    this.queue.start();
    this.emit('resumed');
  }

  /**
   * 获取队列状态
   */
  getStatus() {
    return {
      size: this.queue.size,
      pending: this.queue.pending,
      isPaused: this.queue.isPaused,
      concurrency: this.options.concurrency,
      tasks: {
        total: this.tasks.size,
        pending: Array.from(this.tasks.values()).filter(t => t.status === 'pending').length,
        running: Array.from(this.tasks.values()).filter(t => t.status === 'running').length,
        completed: Array.from(this.tasks.values()).filter(t => t.status === 'completed').length,
        failed: Array.from(this.tasks.values()).filter(t => t.status === 'failed').length
      }
    };
  }

  /**
   * 获取任务详情
   */
  getTaskDetails(id) {
    return this.tasks.get(id);
  }

  /**
   * 更新并发数
   */
  setConcurrency(concurrency) {
    this.options.concurrency = concurrency;
    this.queue.concurrency = concurrency;
    this.emit('concurrency-changed', { concurrency });
  }
}
