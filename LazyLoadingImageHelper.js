const { delay } = require("./utils");
const { logFailedLink, removeFromFailedLinks } = require("./fileUtils");
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

async function checkAllImagesLoadedAndLog(page, fetchIndex, logFailed) {
  const allImagesLoaded = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img[loading="lazy"]')).every(
      (img) => img.complete
    );
  });

  const url = page.url();
  if (!allImagesLoaded) {
    console.warn("Not all images loaded after scrolling", url);
    // log this link to a list of failed file to retry later
    if (logFailed) {
      logFailedLink(config.pdfDir, url, fetchIndex);
      await scrollAgain(page, fetchIndex);
    }
  } else {
    console.log("All images loaded successfully");
    // remove the link from the list of failed file if it was there
    removeFromFailedLinks(config.pdfDir, url);
  }
  return allImagesLoaded;
}

async function scrollAgain(page, fetchIndex) {
  await delay(1000);
  console.log("Scrolling to page top...");
  // scroll to page top
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  console.log("ReScrolling to trigger lazy image load...");
  await loadAllLazyImages(page, fetchIndex, false);
}

async function loadAllLazyImages(page, fetchIndex, logFailed) {
  console.log("开始滚动页面...");
  await autoScroll(page);
  console.log("页面滚动完成，触发懒加载图片加载。");

  // After initial scroll, check for any lazy images that didn't load and trigger their loading
  console.log("检查页面中的懒加载图片...");
  await triggerLazyImages(page);

  // Check if all images are loaded after triggering lazy load
  console.log("检查所有图片是否加载完成...");
  await checkAllImagesLoadedAndLog(page, fetchIndex, logFailed);
}

module.exports = { loadAllLazyImages };
