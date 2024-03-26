const puppeteer = require("puppeteer");
const fs = require("fs");
const pdf = require("html-pdf"); // Example using html-pdf library

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: {
      width: 0,
      height: 0,
    },
    args: ["--start-maximized"],
  });
  const page = await browser.newPage();

  // Navigate to the webpage containing the examples
  await page.goto("https://platform.openai.com/examples", {
    waitUntil: "networkidle2",
  });

  // Wait for at least one button to be loaded in the DOM
  await page.waitForSelector('div.icon-item[role="button"]');

  // Select all div elements that act as buttons to trigger the modals
  const exampleDivs = await page.$$eval(
    'div.icon-item[role="button"]',
    (divs) =>
      divs.map((div, index) => ({
        index: index,
        title: div.querySelector(".icon-item-title").innerText.trim(),
      })),
  );

  console.log("exampleDivs", exampleDivs);

  for (let { index, title } of exampleDivs) {
    // Click on the div to open the modal
    await page.evaluate((i) => {
      document.querySelectorAll('div.icon-item[role="button"]')[i].click();
    }, index);

    // Wait for the modal to fully load
    await page.waitForSelector("#example-modal .modal-dialog", {
      visible: true,
    });

    // Extract the HTML of the modal content
    const modalContentHTML = await page.$eval(
      "#example-modal .modal-dialog",
      (element) => element.innerHTML,
    );

    // Use the extracted HTML content to generate a PDF (using an external library like html-pdf)
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, "_"); // Sanitize the title
    pdf
      .create(modalContentHTML)
      .toFile(`${index}_${sanitizedTitle}.pdf`, function (err, res) {
        if (err) return console.log(err);
        console.log(`Saved PDF for ${title}`);
      });

    // Close the modal by clicking outside of it
    await page.click("body");

    // Wait for the modal to close before proceeding
    await page.waitForSelector("#example-modal .modal-dialog", {
      hidden: true,
    });
  }

  console.log("All examples have been processed.");

  // Close the browser
  await browser.close();
})();
