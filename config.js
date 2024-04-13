module.exports = {
  rootURL: "https://quarto.org/docs/guide",
  pdfDir: "./pdfs",
  concurrency: 10,
  navLinksSelector: "nav.sidebar a[href]:not([href='#'])",
  contentSelector: "main",
  ignoreURLs: ["docs/pages", "docs/app/api-reference"]
};
