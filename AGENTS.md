# Repository Guidelines

## Project Structure & Module Organization
- `src/` — Node.js app code.
  - `src/app.js` (entry point)
  - `src/core/` (DI container, setup, scraper orchestration)
  - `src/services/` (browserPool, pageManager, PDF/image/path/queue services)
  - `src/config/` (schema, loader, validator), root `config.json`
  - `src/utils/` (logger, errors, url, common)
  - `src/python/` (PyMuPDF merge scripts)
- `tests/` mirrors `src/` (e.g., `tests/services/fileService.test.js`).
- Generated artifacts under `pdfs/` are gitignored.

## Build, Test, and Development Commands
- `make install` — install Node + Python deps (creates `venv/`).
- `make run` or `npm start` — scrape and generate PDFs.
- `make clean` — remove `pdfs/*`, metadata, temp.
- `npm test` or `make test` — run Jest tests.
- `npm run lint` / `npm run lint:fix` — ESLint checks and fixes.
- Doc targets: `npm run docs:openai`, `npm run docs:claude`, `npm run docs:list`.
- Kindle presets: `make kindle-<device>` (`kindle7`, `paperwhite`, `oasis`, `scribe`).

## Coding Style & Naming Conventions
- JavaScript ESM (`type: module`), Node ≥ 16. Use async/await.
- Indent 2 spaces; camelCase for vars/functions, PascalCase for classes.
- Service files end with `Service` and managers with `Manager` (e.g., `PythonMergeService.js`).
- Use `createLogger` (`src/utils/logger.js`); avoid raw `console` in app code.
- Lint with `eslint.config.js`; run `npm run lint` before PRs.

## Testing Guidelines
- Framework: Jest with Babel; tests live in `tests/**/*.test.js`.
- Mirror source structure (e.g., `src/core/setup.js` → `tests/core/setup.test.js`).
- Cover new public functions and error paths; run `npm test` locally.

## Commit & Pull Request Guidelines
- Conventional Commits: `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`.
- PRs include: clear description, linked issues, reproduction/verification notes, and relevant before/after logs or PDF paths.

## Security & Configuration Tips
- Change targets and Kindle profiles via `config.json` and `config-profiles/`.
- Keep `allowedDomains` strict; default headless browser is recommended.
- Do not commit PDFs, logs, or `venv/` (already in `.gitignore`).

## Scraping Notes (OpenAI Codex docs)
- Prefer stable content selectors: `#track-content, main #track-content, main .space-y-12` before falling back to `main/article` so full articles are captured.
- When un-hiding `.hidden` elements, skip nav/aside/TOC and modal overlays (search dialogs) to avoid blank-overlay PDFs.
- Hide ToC/PageActions/copy-link UI (`TableOfContents` astro island, `PageActions`, `[data-anchor-id]`) before printing to keep content clean.
- If only the first screen prints, clone the main content container into `document.body` and set `html/body` height/overflow to auto/visible to force multi-page output.
