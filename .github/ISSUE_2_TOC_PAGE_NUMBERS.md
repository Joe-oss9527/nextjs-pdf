# Bug: TOC shows "Page [number]" instead of actual page titles in merged PDF

## Problem Description

The PDF table of contents (TOC) displays generic labels like "Page 0", "Page 1", "Page 2" instead of the actual page titles extracted from the documentation. This makes navigation difficult and defeats the purpose of the hierarchical section structure.

## Evidence

### Visual Evidence
See `image.png` showing TOC structure in merged PDF:

```
▸ Getting started
    Page 0          ← Should be "Overview"
    Page 1          ← Should be "Quickstart"
    Page 2          ← Should be "Common workflows"
    Page 3          ← Should be "Claude Code on the web"
▸ Build with Claude Code
    Page 4          ← Should be "Sub-agents"
    Page 5          ← Should be "Plugins"
    Page 6          ← Should be "Skills"
    ...
    Page 14         ← Should be "Troubleshooting"
▸ Deployment
    Page 15         ← Should be "Third-party integrations"
    ...
▸ Administration
▸ Configuration
▸ Reference
▸ Resources
```

### Metadata Analysis

**File: `pdfs/metadata/articleTitles.json`**
```json
{}
```
**Status**: ❌ EMPTY - No titles were saved during scraping

**File: `pdfs/metadata/sectionStructure.json`**
```json
{
  "sections": [
    {
      "index": 0,
      "title": "Getting started",
      "entryUrl": "https://code.claude.com/docs/en/overview",
      "pages": [
        { "index": "0", "url": "https://code.claude.com/docs/en/overview", "order": 1 },
        { "index": "1", "url": "https://code.claude.com/docs/en/quickstart", "order": 2 },
        ...
      ]
    },
    ...
  ]
}
```
**Status**: ✅ Contains section hierarchy and URLs, but NO page titles

**File: `pdfs/metadata/progress.json`**
```json
{
  "processedUrls": [
    "https://code.claude.com/docs/en/sub-agents",
    "https://code.claude.com/docs/en/overview",
    ...
  ],
  "stats": {
    "total": 44,
    "processed": 44,
    "failed": 0
  }
}
```
**Status**: ✅ Shows all 44 pages processed successfully

### Log Analysis

From `runlog.txt`, checking for title extraction:
```bash
# No log entries like:
# "提取到标题 [0]: Overview"
# "提取到标题 [1]: Quickstart"
```

This confirms titles were NOT extracted during scraping.

## Root Cause Analysis

### Code Analysis

**Location 1: Title Extraction (src/core/scraper.js:876-887)**

```javascript
// 提取页面标题
const title = await page.evaluate((selector) => {
  const contentElement = document.querySelector(selector);
  if (!contentElement) return '';

  // 尝试多种标题提取方式
  const h1 = contentElement.querySelector('h1');
  const title = contentElement.querySelector('title, .title, .page-title');
  const heading = contentElement.querySelector('h2, h3');

  return (h1?.innerText || title?.innerText || heading?.innerText || '').trim();
}, this.config.contentSelector);
```

**Issues with this approach:**

1. **Scope limitation**: Searches only within `#content-area`
   - Page `<title>` tag is in `<head>`, not `#content-area`
   - Selector `title` finds `<title>` element but it's not a child of `#content-area`
   - Result: Always returns empty string

2. **Next.js SPA structure**: For code.claude.com:
   ```html
   <html>
     <head>
       <title>Overview | Claude Code</title>  <!-- NOT in #content-area -->
     </head>
     <body>
       <div id="content-area">
         <article>
           <!-- h1 might be here, but styled/positioned differently -->
         </article>
       </div>
     </body>
   </html>
   ```

3. **Fallback selector issues**:
   - `.title` class rarely used in modern frameworks
   - `.page-title` specific to certain doc frameworks
   - `h1` might not be the first element or might be in navigation

**Location 2: Title Saving (src/core/scraper.js:968-972)**

```javascript
// 如果有标题，保存标题映射（使用字符串索引以匹配Python期望）
if (title) {
  await this.metadataService.saveArticleTitle(String(index), title);
  this.logger.debug(`提取到标题 [${index}]: ${title}`);
}
```

**Issues**:
- Silent failure: If `title` is empty, nothing happens
- No warning log when title extraction fails
- No validation before PDF merge

**Location 3: PDF Merger (src/python/pdf_merger.py)**

The Python merger expects titles in `articleTitles.json`:
```python
def load_article_titles(self, metadata_dir):
    titles_file = os.path.join(metadata_dir, 'articleTitles.json')
    if os.path.exists(titles_file):
        with open(titles_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def create_toc(self, sections, article_titles):
    for section in sections:
        for page in section['pages']:
            index = str(page['index'])
            title = article_titles.get(index, f"Page {index}")  # ← Falls back to "Page {index}"
```

When `articleTitles.json` is empty, all pages get "Page X" labels.

## Why Title Extraction Fails

### Theory 1: Selector Scope Issue
The `page.evaluate()` receives `#content-area` as context, but `document.querySelector('title')` always returns null because `<title>` is not within that scope.

**Test this theory:**
```javascript
// Current code (WRONG - searches within contentElement)
const contentElement = document.querySelector(selector);
const title = contentElement.querySelector('title');  // Always null

// Should be (searches document)
const title = document.querySelector('title');
```

### Theory 2: Timing Issue
Title extraction happens before React hydration completes:
1. Page loads
2. `domcontentloaded` fires
3. Extract title ← React hasn't rendered h1 yet
4. Apply PDF styles
5. Generate PDF ← Now h1 is rendered but title already empty

### Theory 3: CSS Display Issue
The h1 might be hidden, sticky, or absolutely positioned:
```css
h1 {
  position: absolute;
  top: -9999px;  /* Screen reader only */
}
```

`innerText` returns empty for hidden elements.

## Impact

- **User experience**: Cannot navigate PDF effectively
- **Accessibility**: Screen readers announce "Page 0" instead of actual content
- **Defeats purpose**: Hierarchical TOC (commits 41971db, 137ef52) becomes useless
- **All doc sites affected**: Issue affects ANY documentation site, not just Claude Code

## Steps to Reproduce

1. Run scraper:
   ```bash
   make clean && make run
   ```

2. Check metadata after scraping:
   ```bash
   cat pdfs/metadata/articleTitles.json
   # Output: {}
   ```

3. Open merged PDF:
   ```bash
   xdg-open pdfs/finalPdf-oasis/Claude-Docs_*.pdf
   ```

4. Expand any TOC section → See "Page 0", "Page 1" labels

## Expected Behavior

TOC should display actual page titles extracted from `document.title` or `h1`:

```
▸ Getting started
    Overview
    Quickstart
    Common workflows
    Claude Code on the web
▸ Build with Claude Code
    Sub-agents
    Plugins
    Skills
    Output styles
    Hooks guide
    Headless mode
    GitHub Actions
    GitLab CI/CD
    MCP integration
    SDK migration guide
    Troubleshooting
...
```

## Suggested Solutions

### Solution 1: Quick Fix (Simplest - Recommended for immediate fix)

Extract `document.title` directly (most reliable):

```javascript
// src/core/scraper.js:876-887
const title = await page.evaluate(() => {
  // 1. Try document title (most reliable)
  const docTitle = document.title;
  if (docTitle) {
    // Remove common suffixes: " | Claude Code", " - Documentation", etc.
    return docTitle.split(/[|\-–]/).

[0].trim();
  }

  // 2. Fallback to h1 in content
  const h1 = document.querySelector('h1');
  if (h1?.innerText?.trim()) {
    return h1.innerText.trim();
  }

  // 3. Last resort: URL path
  const path = window.location.pathname;
  return path.split('/').pop() || '';
});
```

**Benefits**:
- Works immediately
- `document.title` always available
- No scope issues

**Tradeoffs**:
- May include site name (need to clean)

### Solution 2: Better Extraction (Comprehensive)

Try multiple sources in priority order:

```javascript
// src/core/scraper.js:876-900
const title = await page.evaluate(() => {
  // Priority 1: document.title (cleaned)
  const docTitle = document.title;
  if (docTitle) {
    const cleaned = docTitle
      .split(/[|\-–]/)
      .map(s => s.trim())
      .filter(s => s && s.toLowerCase() !== 'documentation')
      [0];
    if (cleaned) return cleaned;
  }

  // Priority 2: h1 in content area
  const contentArea = document.querySelector('#content-area');
  if (contentArea) {
    const h1 = contentArea.querySelector('h1');
    if (h1?.innerText?.trim()) return h1.innerText.trim();
  }

  // Priority 3: h1 anywhere
  const h1 = document.querySelector('h1');
  if (h1?.innerText?.trim()) return h1.innerText.trim();

  // Priority 4: Breadcrumb last item
  const breadcrumb = document.querySelector('[aria-label="breadcrumb"] a:last-child, .breadcrumb a:last-child');
  if (breadcrumb?.innerText?.trim()) return breadcrumb.innerText.trim();

  // Priority 5: meta title
  const metaTitle = document.querySelector('meta[property="og:title"]');
  if (metaTitle?.content) return metaTitle.content.trim();

  // Priority 6: URL path (last resort)
  const path = window.location.pathname;
  const segment = path.split('/').filter(Boolean).pop();
  return segment ? segment.replace(/[-_]/g, ' ') : 'Untitled';
});

// Log warning if no title found
if (!title || title === 'Untitled') {
  this.logger.warn(`Failed to extract title for page [${index}]: ${url}`);
}
```

### Solution 3: Validation and Fallback

Add validation before merge:

```javascript
// src/app.js (before merge)
const titles = await this.metadataService.getArticleTitles();
const titleCount = Object.keys(titles).length;
const pageCount = this.progressTracker.getStats().processed;

if (titleCount === 0) {
  this.logger.error('⚠️  No article titles extracted! PDF TOC will show page numbers only.');
  this.logger.info('💡 Consider running: node scripts/extract-titles-from-urls.js');
} else if (titleCount < pageCount) {
  this.logger.warn(`⚠️  Only ${titleCount}/${pageCount} titles extracted. Some TOC entries will show page numbers.`);
}
```

Create recovery script:

```javascript
// scripts/extract-titles-from-urls.js
import { metadataService } from '../src/services/metadataService.js';
import path from 'path';

const urlMapping = await metadataService.getUrlMapping();
const titles = {};

for (const [url, index] of Object.entries(urlMapping)) {
  // Extract title from URL path
  const segment = new URL(url).pathname.split('/').filter(Boolean).pop();
  const title = segment
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  titles[String(index)] = title;
}

await metadataService.saveArticleTitles(titles);
console.log(`✅ Extracted ${Object.keys(titles).length} titles from URLs`);
```

### Solution 4: Extract During URL Collection (Long-term)

Extract titles during sidebar parsing:

```javascript
// src/core/scraper.js:_collectUrlsFromEntryPoint()
const links = await page.evaluate((selector) => {
  const elements = document.querySelectorAll(selector);
  return Array.from(elements).map(a => ({
    url: a.href,
    title: a.textContent.trim()  // ← Capture title from sidebar
  }));
}, this.config.navLinksSelector);

// Store titles immediately
for (const link of links) {
  await this.metadataService.saveArticleTitle(index, link.title);
}
```

**Benefits**:
- Titles captured early
- Sidebar usually has clean titles
- No extraction issues

## Recommended Implementation Plan

1. **Immediate**: Deploy Solution 1 (document.title) → Works in 99% of cases
2. **Short-term**: Add validation warnings → Helps debug issues
3. **Medium-term**: Implement Solution 2 (comprehensive) → Handles edge cases
4. **Long-term**: Extract during URL collection → Most robust

## Related Code Locations

- `src/core/scraper.js:876-887` - Title extraction logic
- `src/core/scraper.js:968-972` - Title saving logic
- `src/services/metadataService.js:12-18` - `saveArticleTitle()` method
- `src/python/pdf_merger.py` - TOC generation (uses articleTitles.json)
- `src/app.js` - Add validation before merge

## Testing Plan

```bash
# 1. Apply fix
# 2. Clean and run
make clean && make run

# 3. Verify titles extracted
cat pdfs/metadata/articleTitles.json
# Should show: {"0": "Overview", "1": "Quickstart", ...}

# 4. Check logs
grep "提取到标题" runlog.txt
# Should show: 提取到标题 [0]: Overview

# 5. Open PDF and check TOC
xdg-open pdfs/finalPdf-oasis/*.pdf
```

## Environment

- **Target**: code.claude.com (Next.js SPA)
- **Configuration**: `contentSelector: "#content-area"`
- **Total pages**: 44
- **Sections**: 7 (defined in sectionEntryPoints)
- **Current behavior**: All titles empty
- **Expected behavior**: All titles populated

## Additional Notes

This bug affects ALL documentation sites scraped with this tool, not just Claude Code docs. The hierarchical TOC feature (commits 41971db, 137ef52) is essentially non-functional without proper title extraction.

## References

- HTML `<title>` element: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/title
- Puppeteer page.evaluate(): https://pptr.dev/api/puppeteer.page.evaluate
- PyMuPDF TOC generation: https://pymupdf.readthedocs.io/en/latest/recipes-toc.html
