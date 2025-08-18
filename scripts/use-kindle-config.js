#!/usr/bin/env node

/**
 * Kindle配置切换脚本
 * 用于快速切换到不同的Kindle设备配置
 * 使用深度合并策略，只覆盖配置文件中指定的部分
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// 配置文件路径 - 使用安全的路径解析
const CONFIG_FILE = path.resolve(rootDir, 'config.json');
const PROFILES_DIR = path.resolve(rootDir, 'config-profiles');

/**
 * 验证文件路径是否安全（防止路径遍历攻击）
 * @param {string} filePath - 待验证的文件路径
 * @returns {boolean} - 路径是否安全
 */
function validateSafePath(filePath) {
  const resolvedPath = path.resolve(filePath);
  return resolvedPath.startsWith(rootDir);
}

// 设备配置映射
const DEVICE_PROFILES = {
  'kindle7': 'kindle7.json',
  'paperwhite': 'kindle-paperwhite.json',
  'oasis': 'kindle-oasis.json',
  'scribe': 'kindle-scribe.json'
};

// 获取命令行参数
const args = process.argv.slice(2);
const command = args[0];
const device = args[1];

/**
 * 深度合并两个对象（带循环引用保护）
 * @param {Object} target - 目标对象
 * @param {Object} source - 源对象
 * @param {WeakSet} visited - 访问过的对象集合（防止循环引用）
 * @returns {Object} - 合并后的对象
 */
function deepMerge(target, source, visited = new WeakSet()) {
  // 基本类型检查
  if (!target || typeof target !== 'object') target = {};
  if (!source || typeof source !== 'object') return target;
  
  // 循环引用检查
  if (visited.has(source)) {
    throw new Error('Circular reference detected in configuration');
  }
  visited.add(source);
  
  const result = { ...target };
  
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const value = source[key];
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // 递归合并对象
        result[key] = deepMerge(result[key] || {}, value, visited);
      } else {
        // 直接赋值（基本类型和数组）
        result[key] = value;
      }
    }
  }
  
  return result;
}

/**
 * 验证配置对象的基本结构
 * @param {Object} config - 配置对象
 * @returns {boolean} - 配置是否有效
 */
function validateConfigStructure(config) {
  if (!config || typeof config !== 'object') {
    return false;
  }
  
  // 基本结构验证
  const requiredFields = ['rootURL', 'baseUrl', 'pdfDir'];
  for (const field of requiredFields) {
    if (!(field in config)) {
      console.error(`❌ 配置缺少必需字段: ${field}`);
      return false;
    }
  }
  
  return true;
}


// 帮助信息
function showHelp() {
  console.log(`
Kindle配置切换工具

使用方法:
  node scripts/use-kindle-config.js <command> [device]

命令:
  use <device>    切换到指定设备配置
  reset           重置为基础配置（移除所有Kindle优化）
  list            列出所有可用配置
  current         显示当前配置状态
  help            显示帮助信息

设备选项:
  kindle7         Kindle 7英寸基础版
  paperwhite      Kindle Paperwhite
  oasis           Kindle Oasis
  scribe          Kindle Scribe

示例:
  node scripts/use-kindle-config.js use kindle7
  node scripts/use-kindle-config.js reset
  node scripts/use-kindle-config.js current

说明:
  设备配置文件只包含需要覆盖的选项，
  其他配置项将继承自基础config.json
  `);
}

// 切换到指定配置
function useConfig(deviceName) {
  // 输入验证
  if (!deviceName || typeof deviceName !== 'string') {
    console.error('❌ 设备名称必须是有效字符串');
    return;
  }

  // 检查设备名称是否在允许列表中
  if (!DEVICE_PROFILES[deviceName]) {
    console.error(`❌ 未知设备: ${deviceName}`);
    console.log('可用设备: ' + Object.keys(DEVICE_PROFILES).join(', '));
    return;
  }

  const profileFile = path.resolve(PROFILES_DIR, DEVICE_PROFILES[deviceName]);

  // 安全路径验证
  if (!validateSafePath(profileFile)) {
    console.error('❌ 无效的配置文件路径');
    return;
  }

  if (!validateSafePath(CONFIG_FILE)) {
    console.error('❌ 无效的配置文件路径');
    return;
  }

  if (!fs.existsSync(profileFile)) {
    console.error(`❌ 配置文件不存在: ${profileFile}`);
    return;
  }

  if (!fs.existsSync(CONFIG_FILE)) {
    console.error(`❌ 基础配置文件不存在: ${CONFIG_FILE}`);
    return;
  }

  try {
    // 读取并验证基础配置
    const baseConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (!validateConfigStructure(baseConfig)) {
      console.error('❌ 基础配置文件结构无效');
      return;
    }

    // 读取并验证设备配置
    const deviceConfig = JSON.parse(fs.readFileSync(profileFile, 'utf8'));
    if (!deviceConfig || typeof deviceConfig !== 'object') {
      console.error('❌ 设备配置文件格式无效');
      return;
    }

    // 深度合并配置
    const mergedConfig = deepMerge(baseConfig, deviceConfig);

    // 验证合并后的配置
    if (!validateConfigStructure(mergedConfig)) {
      console.error('❌ 合并后的配置无效');
      return;
    }

    // 安全地保存配置
    const configContent = JSON.stringify(mergedConfig, null, 2);
    fs.writeFileSync(CONFIG_FILE, configContent, { encoding: 'utf8', mode: 0o644 });
    
    console.log(`✅ 已切换到 ${deviceName} 配置`);
    
    // 显示配置详情
    if (deviceConfig.pdf) {
      console.log('\n应用的PDF设置:');
      Object.entries(deviceConfig.pdf).forEach(([key, value]) => {
        console.log(`  - ${key}: ${value}`);
      });
    }
    if (deviceConfig.output?.finalPdfDirectory) {
      console.log(`  - 输出目录: ${deviceConfig.output.finalPdfDirectory}`);
    }

  } catch (error) {
    console.error('❌ 配置文件处理失败:', error.message);
    return;
  }
}

// 重置为基础配置
function resetConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error(`❌ 配置文件不存在: ${CONFIG_FILE}`);
    return;
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

  // 检查是否有Kindle优化设置
  if (!config.pdf?.kindleOptimized) {
    console.log('ℹ️  当前配置已经是基础配置');
    return;
  }

  // 移除Kindle特定设置
  const resetConfig = { ...config };
  if (resetConfig.pdf) {
    delete resetConfig.pdf.kindleOptimized;
    delete resetConfig.pdf.deviceProfile;
    delete resetConfig.pdf.codeFontSize;
    delete resetConfig.pdf.lineHeight;
    delete resetConfig.pdf.maxCodeLineLength;
    delete resetConfig.pdf.pageFormat;
    delete resetConfig.pdf.preferCSSPageSize;
    delete resetConfig.pdf.tagged;
    delete resetConfig.pdf.bookmarks;
    
    // 重置为默认值
    resetConfig.pdf.fontSize = '14px';
    resetConfig.pdf.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif';
    resetConfig.pdf.codeFont = 'SFMono-Regular, Consolas, \'Liberation Mono\', Menlo, monospace';
    resetConfig.pdf.format = 'A4';
    
    // 移除自定义margins，恢复默认
    delete resetConfig.pdf.margin;
  }

  // 重置输出目录
  if (resetConfig.output) {
    resetConfig.output.finalPdfDirectory = 'finalPdf';
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(resetConfig, null, 2));
  console.log('✅ 已重置为基础配置');
}

// 显示当前配置状态
function showCurrentConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error('❌ 配置文件不存在');
    return;
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  
  console.log('\n当前配置状态:');
  console.log('=====================================');
  
  if (config.pdf) {
    console.log('PDF设置:');
    console.log(`  - 字体大小: ${config.pdf.fontSize || '14px'}`);
    console.log(`  - 代码字体大小: ${config.pdf.codeFontSize || '13px'}`);
    console.log(`  - 行高: ${config.pdf.lineHeight || '1.5'}`);
    console.log(`  - 页面格式: ${config.pdf.format || 'A4'}`);
    console.log(`  - 代码行长度: ${config.pdf.maxCodeLineLength || '80'}`);
    console.log(`  - Kindle优化: ${config.pdf.kindleOptimized ? '✅ 已启用' : '❌ 未启用'}`);
    console.log(`  - PDF书签: ${config.pdf.bookmarks !== false ? '✅ 已启用' : '❌ 未启用'}`);
    
    if (config.pdf.kindleOptimized && config.pdf.deviceProfile) {
      console.log(`  - 设备配置: 📱 ${config.pdf.deviceProfile}`);
    }
  }
  
  if (config.output) {
    console.log('\n输出设置:');
    console.log(`  - PDF目录: ${config.output.finalPdfDirectory || 'finalPdf'}`);
  }
  
  console.log('=====================================');
}

// 列出所有配置
function listConfigs() {
  console.log('\n可用配置:');
  console.log('=====================================');
  
  for (const [name, file] of Object.entries(DEVICE_PROFILES)) {
    const profileFile = path.join(PROFILES_DIR, file);
    
    if (fs.existsSync(profileFile)) {
      const config = JSON.parse(fs.readFileSync(profileFile, 'utf8'));
      console.log(`\n📱 ${name}:`);
      if (config.pdf) {
        console.log(`   字体: ${config.pdf.fontSize || '继承'}`);
        console.log(`   代码: ${config.pdf.codeFontSize || '继承'}`);
        console.log(`   格式: ${config.pdf.format || '继承'}`);
        console.log(`   行长: ${config.pdf.maxCodeLineLength || '继承'}字符`);
      }
      if (config.output?.finalPdfDirectory) {
        console.log(`   输出: ${config.output.finalPdfDirectory}`);
      }
    }
  }
  console.log('\n=====================================');
  console.log('提示: 配置文件只包含需要覆盖的选项');
  console.log('      其他选项将从基础config.json继承');
}

// 主程序
function main() {
  switch (command) {
    case 'use':
      if (!device) {
        console.error('❌ 请指定设备名称');
        showHelp();
      } else {
        useConfig(device);
      }
      break;
    
    case 'reset':
      resetConfig();
      break;
    
    case 'list':
      listConfigs();
      break;
    
    case 'current':
      showCurrentConfig();
      break;
    
    case 'help':
    case undefined:
      showHelp();
      break;
    
    default:
      console.error(`❌ 未知命令: ${command}`);
      showHelp();
  }
}

// 运行主程序
main();