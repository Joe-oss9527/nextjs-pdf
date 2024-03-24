module.exports = {
  rootURL: "https://developers.cloudflare.com/ai-gateway",
  pdfDir: "./pdfs",
  concurrency: 10,
  navLinksSelector: ".DocsSidebar--nav-section a[href]:not([href='#'])",
  contentSelector: "article",
  ignoreURLs: ["docs/pages", "docs/app/api-reference"]
};
