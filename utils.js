const config = require("./config");

// delay函数
function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

// check if the url is ignored
function isIgnored(url) {
  if (config.ignoreURLs.some((substring) => url.includes(substring))) {
    return true;
  }
  return false;
}

module.exports = { delay, isIgnored };
