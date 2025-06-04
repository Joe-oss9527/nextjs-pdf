// src/utils/compat.js
// 这是一个临时的兼容层，用于在重构过程中保持代码运行
// 完成所有重构后应该删除此文件

import { delay as newDelay, isIgnored as newIsIgnored } from './common.js';

// 导出CommonJS风格的模块，以兼容现有代码
export const delay = newDelay;
export const isIgnored = newIsIgnored;

// 为了兼容require语法
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { delay, isIgnored };
}
