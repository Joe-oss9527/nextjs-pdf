const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

async function mergePDFsInDirectory(directoryPath, outputFileName) {
    const files = fs.readdirSync(directoryPath).filter(file => file.endsWith('.pdf'));
    const pdfPaths = files.map(file => path.join(directoryPath, file));
    if (pdfPaths.length === 0) return; // 如果没有PDF文件，则跳过

    const mergedPdf = await PDFDocument.create();
    for (const pdfPath of pdfPaths) {
        const pdfBytes = fs.readFileSync(pdfPath);
        const pdf = await PDFDocument.load(pdfBytes);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach(page => mergedPdf.addPage(page));
    }
    const mergedPdfBytes = await mergedPdf.save();
    fs.writeFileSync(outputFileName, mergedPdfBytes);
    console.log(`Merged PDF saved as: ${outputFileName}`);
}

async function mergePDFsForRootAndSubdirectories(pdfDir) {
    const currentDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    // 合并根目录下的PDF文件
    const rootOutputFileName = path.join(pdfDir, `nextjs-doc_${currentDate}.pdf`);
    await mergePDFsInDirectory(pdfDir, rootOutputFileName);

    // 遍历并合并所有子目录下的PDF文件
    const directories = fs.readdirSync(pdfDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    for (const directory of directories) {
        const directoryPath = path.join(pdfDir, directory);
        const outputFileName = path.join(pdfDir, `${directory}_${currentDate}.pdf`);
        await mergePDFsInDirectory(directoryPath, outputFileName);
    }
}

module.exports = { mergePDFsInDirectory, mergePDFsForRootAndSubdirectories };
