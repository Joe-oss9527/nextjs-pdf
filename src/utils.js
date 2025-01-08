const config = require('./configLoader');
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const isIgnored = (url, ignoreURLs) => {
  // 检查URL是否以rootURL开头
  if (!url.startsWith(config.rootURL)) {
    return true;
  }
  
  // 检查是否匹配忽略规则
  return ignoreURLs.some(ignored => url.includes(ignored));
};

module.exports = { delay, isIgnored };