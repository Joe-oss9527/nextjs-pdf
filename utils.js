const config = require("./config");
// 自动滚动到页面底部以确保动态内容加载
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const distance = 300; // 每次滚动的距离
      const interval = 500; // 滚动间隔

      const scrollOnce = () => {
        window.scrollBy(0, distance);
        setTimeout(() => {
          const scrollHeightAfter = document.body.scrollHeight; // 当前文档的总高度
          const scrolledDistance = window.scrollY + window.innerHeight; // 已滚动的距离（包括视窗高度）
          const currentPageUrl = window.location.href; // 获取当前页面的URL

          // 在控制台打印已滚动的距离和总高度
          // 使用特定前缀标记重要的 console.log 调用
          console.log(
            `[NodeConsole] 已滚动的距离: ${scrolledDistance}, 总高度: ${scrollHeightAfter} 当前URL: ${currentPageUrl}`
          );

          // 加入1像素的容差值处理滚动完成的判断
          if (scrolledDistance + 1 >= scrollHeightAfter) {
            resolve();
          } else {
            scrollOnce();
          }
        }, interval);
      };

      scrollOnce();
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
