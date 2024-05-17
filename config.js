module.exports = {
  rootURL: "https://zed.dev/docs",
  pdfDir: "./pdfs",
  concurrency: 10,
  navLinksSelector: "nav.sidebar a[href]:not([href='#'])",
  contentSelector: "main",
  ignoreURLs: ["docs/pages", "docs/app/api-reference"]
};
