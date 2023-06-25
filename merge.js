const { PDFDocument } = require('pdf-lib');
const fs = require('fs-extra');
const path = require('path');

async function mergePdfs(directory) {
    const files = await fs.readdir(directory);
    const pdfFiles = files.filter(file => file.endsWith('.pdf'));

    const mergedPdf = await PDFDocument.create();

    for (let i = 0; i < pdfFiles.length; i++) {
        const pdfBytes = await fs.readFile(path.join(directory, pdfFiles[i]));
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());

        for (const page of pages) {
            mergedPdf.addPage(page);
        }
    }

    const mergedPdfFile = await mergedPdf.save();
    await fs.writeFile(path.join(directory, 'merged.pdf'), mergedPdfFile);
    console.log('PDFs have been merged successfully!');
}

mergePdfs('./output');  // replace './pdfs' with your directory
