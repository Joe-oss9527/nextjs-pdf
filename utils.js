const config = require("./config");
// 自动滚动到页面底部以确保动态内容加载
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const scrollHeight = document.body.scrollHeight;
      const distance = 300;
      const interval = 500;

      const timer = setInterval(() => {
        window.scrollBy(0, distance);

        if (window.scrollY + window.innerHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, interval);
    });
  });
}

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

module.exports = { autoScroll, delay, isIgnored };
