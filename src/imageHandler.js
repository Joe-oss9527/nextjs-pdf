const setupImageLoadingObserver = async (page) => {
  await page.evaluate(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src && !img.src) {
            img.src = img.dataset.src;
          } else if (img.loading === 'lazy' && !img.complete) {
            img.loading = 'eager';
          }
          observer.unobserve(img);
        }
      });
    }, { rootMargin: "200px" });

    document.querySelectorAll('img').forEach(img => observer.observe(img));
  });
};

const checkAllImagesLoaded = async (page) => {
  return page.evaluate(() => {
    const images = Array.from(document.querySelectorAll('img'));
    return images.every(img => {
      if (img.complete && img.naturalWidth !== 0) return true;
      if (!img.src && !img.dataset.src) {
        console.warn('Image without src or data-src:', img.outerHTML);
        return true;
      }
      return false;
    });
  });
};

const waitForImagesWithTimeout = async (page, timeout) => {
  try {
    await page.waitForFunction(() => {
      const images = Array.from(document.querySelectorAll('img'));
      return images.every(img => {
        if (img.complete && img.naturalWidth !== 0) return true;
        if (!img.src && !img.dataset.src) return true;
        return false;
      });
    }, { timeout });
  } catch (error) {
    console.warn('Timeout waiting for images to load, proceeding anyway');
  }
};

module.exports = { setupImageLoadingObserver, checkAllImagesLoaded, waitForImagesWithTimeout };