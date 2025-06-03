// src/main.js
const Scraper = require('./scraper/Scraper');
const { cleanDirectory, ensureDirectoryExists } = require('./utils/fileUtils');
const { getConfig } = require('./config/configLoader');
const executePythonScript = require('./executePythonScript');
const path = require('path');

/**
 * 执行PDF合并的Python脚本
 */
async function mergePdfs() {
  try {
    console.log('\nMerging PDF files...');
    const scriptPath = path.join(__dirname, '..', 'scripts', 'mergePdf.py');
    const output = await executePythonScript(scriptPath);
    console.log('PDF merge completed successfully');
    return output;
  } catch (error) {
    console.error('Error executing PDF merge script:', error);
    throw error;
  }
}

/**
 * 主函数
 */
async function main() {
  let exitCode = 0;
  
  try {
    console.log('=== Next.js Documentation PDF Generator ===\n');
    
    // 加载配置
    const config = getConfig();
    console.log(`Target URL: ${config.rootURL}`);
    console.log(`Output directory: ${config.pdfDir}`);
    console.log(`Concurrency: ${config.concurrency}`);
    console.log('');
    
    // 询问用户是否清理目录
    if (process.argv.includes('--clean')) {
      console.log('Cleaning output directory...');
      await cleanDirectory(config.pdfDir);
    } else {
      console.log('Ensuring output directory exists...');
      await ensureDirectoryExists(config.pdfDir);
    }
    
    // 运行爬虫
    const scraper = new Scraper();
    await scraper.run();
    
    // 合并PDF文件
    if (!process.argv.includes('--no-merge')) {
      await mergePdfs();
    }
    
    console.log('\n✓ All tasks completed successfully!');
    
  } catch (error) {
    console.error('\n✗ Fatal error:', error.message);
    console.error(error.stack);
    exitCode = 1;
    
  } finally {
    // 确保进程正确退出
    process.exit(exitCode);
  }
}

// 错误处理
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n\nReceived SIGINT, shutting down gracefully...');
  process.exit(0);
});

// 运行主函数
if (require.main === module) {
  main();
}

module.exports = { main };