const fs = require('fs').promises;

async function ensureDirectoryExists(dirPath) {
    try {
        await fs.access(dirPath);
    } catch (error) {
        await fs.mkdir(dirPath, { recursive: true });
    }
}

async function cleanDirectory(dirPath) {
    try {
        await fs.rm(dirPath, { recursive: true, force: true });
        await fs.mkdir(dirPath);
    } catch (error) {
        console.error(`Error managing directory ${dirPath}:`, error);
        throw error; // Rethrow to handle it in the caller
    }
}

function logFailedLink(pdfDir, url) {
  // 将 URL 和 PDF 文件名以分隔的形式写入日志文件
  const logFileName = `${pdfDir}/failed.txt`;
  const logContent = `${url}\n`;
  fs.appendFile(logFileName, logContent);
}

module.exports = { ensureDirectoryExists, cleanDirectory, logFailedLink };
