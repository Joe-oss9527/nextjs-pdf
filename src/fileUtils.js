const fs = require('fs').promises;
const path = require('path');

const ensureDirectoryExists = async (dirPath) => {
  try {
    await fs.access(dirPath);
  } catch (error) {
    await fs.mkdir(dirPath, { recursive: true });
  }
};

const getPdfPath = async (url, index, pdfDir) => {
  const fileName = url.split('/').filter(s => s).pop();
  const fullFileName = `${pdfDir}/${index}-${fileName}.pdf`;
  await ensureDirectoryExists(path.dirname(fullFileName));
  return fullFileName;
};

const logFailedLink = async (pdfDir, url, index, error) => {
  const failedLinksFilePath = path.join(pdfDir, "failed.json");
  let failedLinks = [];

  try {
    const data = await fs.readFile(failedLinksFilePath, 'utf-8');
    failedLinks = JSON.parse(data);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error("Error reading failed links file:", err);
    }
  }

  failedLinks.push({ index, url, error: error.message });
  await fs.writeFile(failedLinksFilePath, JSON.stringify(failedLinks, null, 2));
};

const cleanDirectory = async (dirPath) => {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    console.error(`Error cleaning directory ${dirPath}:`, error);
    throw error;
  }
};

const saveArticleTitle = async (pdfDir, index, title) => {
  const articleTitleFilePath = path.join(pdfDir, "articleTitles.json");
  let articleTitles = {};

  try {
    const data = await fs.readFile(articleTitleFilePath, 'utf-8');
    articleTitles = JSON.parse(data);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error("Error reading article titles file:", err);
    }
  }

  articleTitles[index] = title;
  await fs.writeFile(articleTitleFilePath, JSON.stringify(articleTitles, null, 2));
};

const logImageLoadFailure = async (pdfDir, url, index) => {
  const failuresFilePath = path.join(pdfDir, "imageLoadFailures.json");
  let failures = [];

  try {
    const data = await fs.readFile(failuresFilePath, 'utf-8');
    failures = JSON.parse(data);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error("Error reading image load failures file:", err);
    }
  }

  failures.push({ index, url });
  await fs.writeFile(failuresFilePath, JSON.stringify(failures, null, 2));
};

const getImageLoadFailures = async (pdfDir) => {
  const failuresFilePath = path.join(pdfDir, "imageLoadFailures.json");
  try {
    const data = await fs.readFile(failuresFilePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];  // 如果文件不存在，返回空数组
    }
    console.error("Error reading image load failures file:", err);
    throw err;
  }
};

module.exports = { 
  ensureDirectoryExists, 
  getPdfPath, 
  logFailedLink, 
  cleanDirectory, 
  saveArticleTitle,
  logImageLoadFailure,
  getImageLoadFailures
};