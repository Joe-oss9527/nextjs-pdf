// src/config/schema.js
import Joi from 'joi';

export const configSchema = Joi.object({
  rootURL: Joi.string().uri().required(),
  pdfDir: Joi.string().required(),
  concurrency: Joi.number().integer().min(1).max(10).default(5),
  screenshotDelay: Joi.number().integer().min(0).default(500),
  navLinksSelector: Joi.string().required(),
  contentSelector: Joi.string().required(),
  ignoreURLs: Joi.array().items(Joi.string()).default([]),
  maxRetries: Joi.number().integer().min(1).default(3),
  retryDelay: Joi.number().integer().min(0).default(1000),
  pageTimeout: Joi.number().integer().min(1000).default(30000),
  imageTimeout: Joi.number().integer().min(1000).default(10000),
  allowedDomains: Joi.array().items(Joi.string()).default(['rc.nextjs.org', 'nextjs.org']),
  logLevel: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),
  
  // 第七阶段新增配置项
  metadata: Joi.object({
    enabled: Joi.boolean().default(true),
    directory: Joi.string().default('metadata')
  }).default(),
  
  output: Joi.object({
    finalPdfDirectory: Joi.string().default('finalPdf'),
    tempDirectory: Joi.string().default('.temp')
  }).default(),
  
  pdf: Joi.object({
    quality: Joi.string().valid('low', 'medium', 'high').default('high'),
    compression: Joi.boolean().default(true),
    bookmarks: Joi.boolean().default(true),
    maxMemoryMB: Joi.number().integer().min(100).max(2000).default(500)
  }).default(),
  
  // Python服务配置
  pythonExecutable: Joi.string().default('python3'),
  pythonTimeout: Joi.number().integer().min(30000).max(600000).default(300000),
  maxBuffer: Joi.number().integer().min(1048576).default(10485760)
});
