module.exports = {
  rootURL: "https://docs.anthropic.com/claude/docs",
  pdfDir: "./pdfs",
  concurrency: 10,
  navLinksSelector: "main nav a[href]:not([href='#'])",
  contentSelector: "article",
  ignoreURLs: ["docs/pages", "docs/app/api-reference", "#"]
};
