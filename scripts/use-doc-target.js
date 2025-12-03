#!/usr/bin/env node

/**
 * 文档站点配置切换脚本
 * 用于在不同的文档来源之间快速切换（OpenAI / Claude Code 等）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const CONFIG_FILE = path.resolve(rootDir, 'config.json');
const TARGETS_DIR = path.resolve(rootDir, 'doc-targets');

const DOC_TARGETS = {
  'openai': 'openai-docs.json',
  'claude-code': 'claude-code.json',
  'cloudflare-blog': 'cloudflare-blog.json',
  'anthropic-research': 'anthropic-research.json',
  'claude-blog': 'claude-blog.json'
};

function validateSafePath(targetPath) {
  const resolved = path.resolve(targetPath);
  return resolved.startsWith(rootDir);
}

function deepMerge(target, source) {
  if (!target || typeof target !== 'object') target = {};
  if (!source || typeof source !== 'object') return target;

  const result = { ...target };

  for (const key of Object.keys(source)) {
    const value = source[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = deepMerge(result[key] || {}, value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

function validateConfigStructure(config) {
  const requiredFields = ['rootURL', 'baseUrl', 'pdfDir'];
  return requiredFields.every(field => typeof config[field] === 'string' && config[field].trim());
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function showHelp() {
  console.log(`
文档站点配置切换工具

用法:
  node scripts/use-doc-target.js <command> [target]

命令:
  use <target>    切换到指定站点 (openai, claude-code)
  list            列出可用站点
  current         显示当前根URL和域名
  help            查看帮助

示例:
  node scripts/use-doc-target.js use claude-code
  node scripts/use-doc-target.js use openai
  node scripts/use-doc-target.js current
  `);
}

function listTargets() {
  console.log('可用文档站点配置:');
  Object.keys(DOC_TARGETS).forEach(key => {
    console.log(`  - ${key}`);
  });
}

function showCurrentConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error('❌ 找不到 config.json');
    process.exit(1);
  }

  const config = readJSON(CONFIG_FILE);
  console.log('\n当前文档配置:');
  console.log(`  Root URL      : ${config.rootURL}`);
  console.log(`  Base URL      : ${config.baseUrl || '(未设置)'}`);
  console.log(`  允许域名       : ${Array.isArray(config.allowedDomains) ? config.allowedDomains.join(', ') : '(未设置)'}`);
  const entryPoints = Array.isArray(config.sectionEntryPoints) ? config.sectionEntryPoints.length : 0;
  console.log(`  额外入口数量   : ${entryPoints}`);
  console.log(`  内容选择器     : ${config.contentSelector || '(未设置)'}`);
  console.log(`  样式处理       : enablePDFStyleProcessing=${config.enablePDFStyleProcessing === true ? 'true' : 'false'}`);
  console.log('');
}

function useTarget(targetName) {
  if (!DOC_TARGETS[targetName]) {
    console.error(`❌ 未知站点: ${targetName}`);
    console.log('可用站点: ' + Object.keys(DOC_TARGETS).join(', '));
    process.exit(1);
  }

  if (!validateSafePath(CONFIG_FILE)) {
    console.error('❌ 无效的配置文件路径');
    process.exit(1);
  }

  const targetFile = path.resolve(TARGETS_DIR, DOC_TARGETS[targetName]);
  if (!validateSafePath(targetFile)) {
    console.error('❌ 无效的站点配置路径');
    process.exit(1);
  }

  if (!fs.existsSync(CONFIG_FILE)) {
    console.error('❌ 基础配置文件不存在');
    process.exit(1);
  }

  if (!fs.existsSync(targetFile)) {
    console.error(`❌ 站点配置文件不存在: ${targetFile}`);
    process.exit(1);
  }

  const baseConfig = readJSON(CONFIG_FILE);
  const targetConfig = readJSON(targetFile);
  const mergedConfig = deepMerge(baseConfig, targetConfig);

  if (!validateConfigStructure(mergedConfig)) {
    console.error('❌ 合并后的配置缺少必要字段 (rootURL/baseUrl/pdfDir)');
    process.exit(1);
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(mergedConfig, null, 2));
  console.log(`✅ 已切换到 ${targetName} 文档配置`);
  showCurrentConfig();
}

function main() {
  const [command, target] = process.argv.slice(2);

  switch (command) {
    case 'use':
      if (!target) {
        console.error('❌ 请选择站点名称');
        listTargets();
        process.exit(1);
      }
      useTarget(target);
      break;
    case 'list':
      listTargets();
      break;
    case 'current':
      showCurrentConfig();
      break;
    case 'help':
    default:
      showHelp();
      break;
  }
}

main();
