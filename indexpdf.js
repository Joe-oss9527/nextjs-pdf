const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');
const async = require('async');
const PDFLib = require('pdf-lib');
const PDFDocument = PDFLib.PDFDocument;
const path = require('path');

async function main() {
    console.log('All items have been processed');
  
    const pdfDoc = await PDFDocument.create();
    for (let pdfPath of pdfDocs) {
      const pdfBytes = fs.readFileSync(pdfPath);
      const srcPdfDoc = await PDFDocument.load(pdfBytes);
      const pages = srcPdfDoc.getPages();
      for (let page of pages) {
        const [copiedPage] = await pdfDoc.copyPages(srcPdfDoc, [srcPdfDoc.getPageIndex(page)]);
        pdfDoc.addPage(copiedPage);
      }
    }
  
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('./output/merged.pdf', pdfBytes);
}

main();