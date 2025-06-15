// src/config/schema.js
import Joi from 'joi';

export const configSchema = Joi.object({
  rootURL: Joi.string().uri().required(),
  baseUrl: Joi.string().uri().optional()
    .description('Base URL prefix - only crawl URLs under this path'),
  pdfDir: Joi.string().required(),
  concurrency: Joi.number().integer().min(1).max(10).default(5),
  screenshotDelay: Joi.number().integer().min(0).default(500),
  navLinksSelector: Joi.string().required(),
  contentSelector: Joi.string().required(),
  ignoreURLs: Joi.array().items(Joi.string()).default([]),
  maxRetries: Joi.number().integer().min(1).default(3),
  retryDelay: Joi.number().integer().min(0).default(1000),
  pageTimeout: Joi.number().integer().min(1000).default(30000),
  browserTimeout: Joi.number().integer().min(1000).default(45000),
  navigationRetries: Joi.number().integer().min(1).default(4),
  imageTimeout: Joi.number().integer().min(1000).default(10000),
  browser: Joi.object({
    headless: Joi.boolean().default(true),
    userAgent: Joi.string().optional()
  }).default(),
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
    engine: Joi.string().valid('puppeteer', 'pandoc', 'both').default('puppeteer'),
    theme: Joi.string().valid('light', 'dark').default('light'),
    preserveCodeHighlighting: Joi.boolean().default(true),
    enableCodeWrap: Joi.boolean().default(true),
    fontSize: Joi.string().default('14px'),
    fontFamily: Joi.string().default('system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'),
    codeFont: Joi.string().default('SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace'),
    quality: Joi.string().valid('low', 'medium', 'high').default('high'),
    compression: Joi.boolean().default(true),
    bookmarks: Joi.boolean().default(true),
    maxMemoryMB: Joi.number().integer().min(100).max(2000).default(500),
    pandoc: Joi.object({
      pdfEngine: Joi.string().valid('weasyprint', 'prince', 'wkhtmltopdf', 'pagedjs-cli').default('weasyprint'),
      cssFile: Joi.string().default('src/styles/pdf.css'),
      options: Joi.array().items(Joi.string()).default(['--standalone', '--self-contained'])
    }).default()
  }).default(),
  
  // Python服务配置
  python: Joi.object({
    executable: Joi.string().default('./venv/bin/python'),
    timeout: Joi.number().integer().min(30000).max(600000).default(300000)
  }).default(),
  
  pythonExecutable: Joi.string().default('python3'),
  pythonTimeout: Joi.number().integer().min(30000).max(600000).default(300000),
  maxBuffer: Joi.number().integer().min(1048576).default(10485760)
});
