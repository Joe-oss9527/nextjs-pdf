const fs = require('fs');
const path = require('path');

const loadConfig = () => {
  const configPath = path.join(__dirname, '..', 'config.json');
  const rawConfig = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(rawConfig);
  
  // 转换相对路径为绝对路径
  config.pdfDir = path.join(__dirname, '..', config.pdfDir);
  
  return config;
};

module.exports = loadConfig();