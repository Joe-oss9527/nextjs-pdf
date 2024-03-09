// https://stackoverflow.com/a/77889148
// https://github.com/puppeteer/puppeteer/issues/1597#issuecomment-351945645
// https://pptr.dev/guides/configuration/#configuration-files
// https://pptr.dev/api/puppeteer.configuration
/**
* @type {import("puppeteer").Configuration}
*/
module.exports = {
    // Changes the cache location for Puppeteer.
    downloadBaseUrl:"https://cdn.npmmirror.com/binaries/chrome-for-testing",
};