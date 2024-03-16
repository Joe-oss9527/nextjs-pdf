const fs = require("fs").promises;
const path = require("path");
const config = require("./config");
const url = new URL(config.rootURL);
const domain = url.hostname;

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

async function logFailedLink(pdfDir, url, index) {
  const failedLinksFilePath = path.join(pdfDir, "failed.json");
  let failedLinks = [];

  try {
    // 尝试读取现有的失败链接
    const data = await fs.readFile(failedLinksFilePath, "utf-8");
    failedLinks = JSON.parse(data);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error("Error reading failed links file:", err);
    }
  }

  // 将新的失败链接添加到数组中
  failedLinks.push({ index, url });

  // 将数组写入文件
  await fs.writeFile(failedLinksFilePath, JSON.stringify(failedLinks, null, 2));
}

async function readFailedLinks(pdfDir) {
  const failedLinksFilePath = path.join(pdfDir, "failed.json");
  try {
    const data = await fs.readFile(failedLinksFilePath, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    if (err.code === "ENOENT") {
      console.log("failed.json file not found");
      return [];
    } else {
      console.error("Error reading failed links file:", err);
      return [];
    }
  }
}

async function removeFromFailedLinks(pdfDir, url) {
  const failedLinksFilePath = path.join(pdfDir, "failed.json");
  try {
    const data = await fs.readFile(failedLinksFilePath, "utf-8");
    const failedLinks = JSON.parse(data);
    const updatedFailedLinks = failedLinks.filter((link) => link.url !== url);
    await fs.writeFile(
      failedLinksFilePath,
      JSON.stringify(updatedFailedLinks, null, 2)
    );
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error("Error removing failed link from file:", err);
    }
  }
}

const extractSubfolder = (url) => {
  // 尝试匹配 /app/, /pages/中的任意一个，然后提取其后的第一个路径段，考虑到路径可能是URL的最后一部分
  const match = url.match(/\/(app|pages)\/(.*?)(\/|$)/);
  return match ? { type: match[1], name: match[2] } : null;
};

// Utility function to extract the last part of the URL as file name
function extractFileName(url) {
  return url
    .split("/")
    .filter((s) => s)
    .pop();
}
// Function to log the type of URL being processed
function logUrlType(url, type) {
  console.log("====================================");
  console.log(`${type} url: `, url);
  console.log("====================================");
}

// Function to determine the directory based on URL
function determineDirectory(url, pdfDir) {
  const match = extractSubfolder(url);
  if (match) {
    // 根据匹配的类型构造前缀
    const prefix = `${match.type}-`;
    // Log the URL type based on the pattern
    logUrlType(url, match.type.charAt(0).toUpperCase() + match.type.slice(1));
    // Return the determined directory path
    return `${pdfDir}/${prefix}${match.name}`;
  } else {
    // If no pattern matches, return the default pdfDir
    console.warn("URL does not match any known patterns.");
    return `${pdfDir}/${domain}-docs`;
  }
}

async function getPdfPath(url, index, pdfDir) {
  const fileName = extractFileName(url);

  // Determine the directory based on URL
  const appDir = determineDirectory(url, pdfDir);

  // Ensure the directory exists
  await ensureDirectoryExists(appDir);

  // Full file name for saving
  const fullFileName = `${appDir}/${index}-${fileName}.pdf`;

  // log url and pdf file name to log file
  logFileName(pdfDir, url, fullFileName);

  return fullFileName;
}

function logFileName(pdfDir, url, fullFileName) {
  // 将 URL 和 PDF 文件名以分隔的形式写入日志文件
  const logFileName = `${pdfDir}/log.txt`;
  const logContent = `----------\n${new Date().toISOString()} - URL: ${url}\nFilename: ${fullFileName}\n----------\n`;
  fs.appendFile(logFileName, logContent, (err) => {
    if (err) {
      console.error("Error appending to log file:", err);
    }
  });
}

module.exports = {
  ensureDirectoryExists,
  cleanDirectory,
  logFailedLink,
  readFailedLinks,
  removeFromFailedLinks,
  getPdfPath
};
