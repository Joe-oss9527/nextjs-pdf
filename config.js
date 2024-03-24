module.exports = {
  rootURL: "https://docs.anthropic.com/claude/prompt-library",
  pdfDir: "./pdfs",
  concurrency: 10,
  navLinksSelector: ".examples-grid a[href]:not([href='#'])",
  contentSelector: "#content",
  ignoreURLs: ["docs/pages", "docs/app/api-reference", "#"]
};
