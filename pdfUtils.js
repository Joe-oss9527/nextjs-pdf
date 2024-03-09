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

const extractSubfolder = (url) => {
  return url.match(/\/app\/(.*?)\/|\/pages\/(.*?)\//)?.[1] || "";
};

const getPdfPath = async (url, index, pdfDir) => {
  const urlParts = url.split("/");
  const fileName = urlParts[urlParts.length - 1] || "index";
  const subfolder = extractSubfolder(url);
  const appDir = subfolder ? `${pdfDir}/${subfolder}` : pdfDir;
  await ensureDirectoryExists(appDir);
  return `${appDir}/${index}-${fileName}.pdf`;
};

module.exports = {
  mergePDFsInDirectory,
  mergePDFsForRootAndSubdirectories,
  getPdfPath,
};
