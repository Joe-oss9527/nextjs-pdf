const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const { ensureDirectoryExists } = require("./fileUtils");
const config = require("./config"); // Assuming the config file is in the same directory
const url = new URL(config.rootURL);
const domain = url.hostname;

async function mergePDFsInDirectory(directoryPath, outputFileName) {
  const files = fs
    .readdirSync(directoryPath)
    .filter((file) => file.endsWith(".pdf"));

  // 根据文件名中的索引进行排序
  // 假设文件名格式为: "001-your-first-pdf.pdf", "002-your-second-pdf.pdf", ...
  files.sort((a, b) => {
    const aIndex = parseInt(a.split("-")[0], 10);
    const bIndex = parseInt(b.split("-")[0], 10);
    return aIndex - bIndex;
  });

  const pdfPaths = files.map((file) => path.join(directoryPath, file));
  if (pdfPaths.length === 0) return; // 如果没有PDF文件，则跳过

  const mergedPdf = await PDFDocument.create();
  for (const pdfPath of pdfPaths) {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdf = await PDFDocument.load(pdfBytes);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }
  const mergedPdfBytes = await mergedPdf.save();
  fs.writeFileSync(outputFileName, mergedPdfBytes);
  console.log(`Merged PDF saved as: ${outputFileName}`);
}

async function mergePDFsForRootAndSubdirectories(pdfDir) {
  const currentDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  // 合并根目录下的PDF文件
  const rootOutputFileName = path.join(pdfDir, `${domain}_${currentDate}.pdf`);
  await mergePDFsInDirectory(pdfDir, rootOutputFileName);

  // 遍历并合并所有子目录下的PDF文件
  const directories = fs
    .readdirSync(pdfDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  for (const directory of directories) {
    const directoryPath = path.join(pdfDir, directory);
    const outputFileName = path.join(pdfDir, `${directory}_${currentDate}.pdf`);
    await mergePDFsInDirectory(directoryPath, outputFileName);
  }
}

// 处理app, pages
const extractSubfolder = (url) => {
  // 尝试匹配 /app/, /pages/中的任意一个，然后提取其后的第一个路径段
  const match = url.match(/\/(app|pages)\/(.*?)\//);
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
    return pdfDir;
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

  return fullFileName;
}

module.exports = {
  mergePDFsInDirectory,
  mergePDFsForRootAndSubdirectories,
  getPdfPath,
};
