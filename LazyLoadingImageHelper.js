const { delay } = require("./utils");
const { logFailedLink } = require("./fileUtils");
const config = require("./config");
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
          // console.log(
          //   `[NodeConsole] 已滚动的距离: ${scrolledDistance}, 总高度: ${scrollHeightAfter} 当前URL: ${currentPageUrl}`
          // );

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

async function ensureImagesLoaded(page, timeout = 2000) {
  const result = await page.evaluate(async (timeout) => {
    const selectors = document.querySelectorAll('img[loading="lazy"]');
    const loadedOrTimedOut = await Promise.race([
      Promise.all(
        Array.from(selectors).map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                img.addEventListener("load", resolve, { once: true });
                img.addEventListener("error", resolve, { once: true });
              })
        )
      ),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), timeout)),
    ]);
    return loadedOrTimedOut === "timeout" ? "timeout" : "complete";
  }, timeout);

  if (result === "timeout") {
    const url = page.url();
    console.warn("Waiting for images timed out: ", url);
    // log this link to a list of failed file to retry later
    logFailedLink(config.pdfDir, url);
  }
}

async function triggerLazyImages(page) {
  const lazyImages = await page.$$eval('img[loading="lazy"]', (imgs) =>
    imgs
      .filter((img) => !img.complete)
      .map((img) => img.getBoundingClientRect().top + window.scrollY)
  );

  for (const position of lazyImages) {
    await page.evaluate((position) => {
      window.scrollTo(0, position);
    }, position);
    console.log("Scrolling to trigger lazy image load...");
    await delay(1000); // Delay to allow image to load
  }
}

async function loadAllLazyImages(page) {
  console.log("开始滚动页面...");
  await autoScroll(page);
  console.log("页面滚动完成，触发懒加载图片加载。");

  // After initial scroll, check for any lazy images that didn't load and trigger their loading
  console.log("检查页面中的懒加载图片...");
  await triggerLazyImages(page);

  console.log("等待所有懒加载图片加载...");
  await ensureImagesLoaded(page);
  console.log("所有懒加载图片应该已经加载。");
}

module.exports = { loadAllLazyImages };
