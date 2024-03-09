// 自动滚动到页面底部以确保动态内容加载
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      let totalHeight = 0;
      const distance = 150;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });
}

// delay函数
function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

module.exports = { autoScroll, delay };
