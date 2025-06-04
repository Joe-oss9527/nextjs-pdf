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
  logLevel: Joi.string().valid('debug', 'info', 'warn', 'error').default('info')
});
