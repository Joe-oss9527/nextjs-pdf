const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const isIgnored = (url, ignoreURLs) => ignoreURLs.some(ignored => url.includes(ignored));

module.exports = { delay, isIgnored };