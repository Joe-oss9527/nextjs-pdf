const fs = require("fs").promises;
const path = require("path");

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

module.exports = {
  ensureDirectoryExists,
  cleanDirectory,
  logFailedLink,
  readFailedLinks,
  removeFromFailedLinks,
};
