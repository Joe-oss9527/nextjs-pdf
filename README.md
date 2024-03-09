# Next.js Docs PDF Scraper

This project is a web scraper that fetches the Next.js documentation pages and converts them into PDF files. It utilizes the Puppeteer library to automate the web browsing process and generate PDF files from the rendered web pages.

## Features

- Scrapes the navigation links from the Next.js documentation website
- Generates PDF files for each documentation page
- Organizes PDF files into subdirectories based on the URL pattern
- Merges PDF files for the root directory and each subdirectory
- Supports retrying failed requests with exponential backoff
- Configurable concurrency for parallel scraping
- Logging and error handling

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Configure the project by modifying the `config.js` file
4. Run the scraper: `node main.js`

## Configuration

The project configuration is located in the `config.js` file. Here are the available options:

- `rootURL`: The root URL of the website to scrape
- `pdfDir`: The directory where the PDF files will be saved
- `concurrency`: The maximum number of concurrent scraping tasks
- `navLinksSelector`: The CSS selector for navigation links
- `contentSelector`: The CSS selector for the main content area
- `ignoreURLs`: An array of URL patterns to ignore when scraping

## Project Structure

- `main.js`: The entry point of the application
- `scraper.js`: Contains the `Scraper` class for scraping tasks
- `pdfUtils.js`: Utility functions for merging PDF files and determining file paths
- `fileUtils.js`: Utility functions for managing directories
- `utils.js`: Helper functions for scrolling and delaying
- `config.js`: Configuration file for the project

## Dependencies

- `puppeteer`: Library for automating web browsing
- `async`: Library for managing asynchronous control flow
- `pdf-lib`: Library for manipulating and merging PDF files

## License

This project is licensed under the [MIT License](LICENSE).