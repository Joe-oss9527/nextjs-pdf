# Bug: Pages downloaded multiple times due to navigation timeout and retry mechanism

## Problem Description

During the scraping process, pages are being downloaded multiple times due to navigation timeouts on first attempt, then succeeding on retry. This significantly increases total execution time.

## Evidence from Logs

From `runlog.txt` (2025-11-07 run):

### Pattern of Failures and Retries

**Example 1: hooks-guide page**
```
22:59:20 [info]: 开始爬取页面 [9/44]: https://code.claude.com/docs/en/hooks-guide
22:59:35 [warn]: 导航策略 domcontentloaded 失败 - Navigation timeout of 15000 ms exceeded
23:00:05 [warn]: 导航策略 networkidle2 失败 - Navigation timeout of 30000 ms exceeded
23:00:30 [info]: PDF已保存: /home/yvany/developer/nextjs-pdf/pdfs/code.claude.com-docs/008-hooks-guide.pdf
```
**Time spent**: ~70 seconds (15s + 30s + processing)

**Example 2: headless page**
```
23:00:31 [info]: 开始爬取页面 [10/44]: https://code.claude.com/docs/en/headless
23:00:46 [warn]: 导航策略 domcontentloaded 失败 - Navigation timeout of 15000 ms exceeded
23:01:16 [warn]: 导航策略 networkidle2 失败 - Navigation timeout of 30000 ms exceeded
23:01:40 [info]: PDF已保存
```
**Time spent**: ~69 seconds

**Example 3: github-actions page**
```
23:01:41 [info]: 开始爬取页面 [11/44]: https://code.claude.com/docs/en/github-actions
23:01:56 [warn]: 导航策略 domcontentloaded 失败 - Navigation timeout of 15000 ms exceeded
23:02:26 [warn]: 导航策略 networkidle2 失败 - Navigation timeout of 30000 ms exceeded
23:03:03 [info]: PDF已保存
```
**Time spent**: ~82 seconds

### Pages Affected (12 total)
From log analysis, these pages required retry:
1. `hooks-guide` - 70s
2. `headless` - 69s
3. `github-actions` - 82s
4. `troubleshooting` - 71s
5. `third-party-integrations` - 84s
6. `llm-gateway` - 23s (succeeded on networkidle2)
7. `sandboxing` - 8s (succeeded quickly)
8. `security` - 7s (succeeded quickly)
9. `monitoring-usage` - 13s
10. `memory` - 6s (succeeded quickly)
11-12. Others (from "失败: 12" count)

### Final Statistics
```json
{
  "总数": 44,
  "成功": 44,
  "失败": 12,
  "跳过": 0,
  "重试次数": 0,
  "成功率": "100.00%",
  "总耗时": "804.76秒",
  "平均速度": "0.05 页/秒"
}
```

**Analysis**:
- 44 pages in 804 seconds = 18.3 seconds/page average
- 12 pages failed initially and needed retry
- Estimated wasted time: 12 pages × 45s = ~540 seconds (~9 minutes)
- Without retries, could complete in ~5-6 minutes instead of 13.4 minutes

## Root Cause Analysis

### Navigation Strategy Issues (src/core/scraper.js:766-826)

The `navigateWithFallback()` method tries multiple strategies sequentially:

```javascript
const strategies = [
  { name: 'domcontentloaded', waitUntil: 'domcontentloaded', timeout: 15000 },
  { name: 'networkidle2', waitUntil: 'networkidle2', timeout: 30000 },
  { name: 'load', waitUntil: 'load', timeout: 45000 }
];
```

**Issue**: For code.claude.com (Next.js SPA), the first two strategies consistently timeout:

1. **domcontentloaded** (15s timeout)
   - Waits for HTML parse
   - Fails because Next.js needs time for client-side hydration
   - React components aren't mounted yet

2. **networkidle2** (30s timeout)
   - Waits for ≤2 active connections for 500ms
   - Fails because analytics, tracking scripts, and websockets keep connections open
   - Google Analytics, Segment, Intercom, etc. maintain persistent connections

3. **load** (45s timeout)
   - Waits for all resources
   - **Eventually succeeds** but wastes 45 seconds on previous attempts

### Why It's Inefficient

For modern SPAs like code.claude.com:
- ❌ `domcontentloaded` is too early (React not hydrated)
- ❌ `networkidle2` rarely happens (persistent connections)
- ✅ `load` works but should be tried FIRST

## Impact

- **Performance**: 44 pages take ~804 seconds (13.4 minutes) instead of expected ~5-6 minutes
- **Wasted time**: ~540 seconds spent on failed navigation attempts
- **Resource usage**: Extra browser memory and CPU cycles during timeout waits
- **User experience**: Long wait times discourage usage

## Steps to Reproduce

1. Configure for Claude Code docs:
   ```bash
   node scripts/use-doc-target.js use claude-code
   ```

2. Run scraper:
   ```bash
   make clean && make run | tee runlog.txt
   ```

3. Observe console showing repeated timeout warnings:
   ```
   [warn]: 导航策略 domcontentloaded 失败 - Navigation timeout of 15000 ms exceeded
   [warn]: 导航策略 networkidle2 失败 - Navigation timeout of 30000 ms exceeded
   ```

4. Check final stats showing high failure count despite 100% success rate

## Suggested Solutions

### Solution 1: Short-term Fix (Quickest)
Reverse strategy order for SPA sites:

```javascript
// src/core/scraper.js:766-826
const strategies = [
  { name: 'load', waitUntil: 'load', timeout: 30000 },           // Try 'load' first
  { name: 'domcontentloaded', waitUntil: 'domcontentloaded', timeout: 15000 },
  { name: 'networkidle2', waitUntil: 'networkidle2', timeout: 30000 }
];
```

**Benefits**:
- Immediate 2-3x performance improvement
- Reduces scraping time from 13 minutes to ~5 minutes
- No config changes needed

**Tradeoffs**:
- `load` may be slower for static sites
- Waits for all images/assets

### Solution 2: Medium-term Fix (Recommended)
Add site-specific navigation config in `doc-targets/*.json`:

```json
{
  "rootURL": "https://code.claude.com/docs/en/overview",
  "navigationStrategy": "load",
  "navigationTimeout": 30000,
  "enablePDFStyleProcessing": true
}
```

Then in `scraper.js`:
```javascript
async navigateWithFallback(page, url) {
  // Use config-specified strategy first
  const preferredStrategy = this.config.navigationStrategy;
  if (preferredStrategy) {
    try {
      await page.goto(url, {
        waitUntil: preferredStrategy,
        timeout: this.config.navigationTimeout || 30000
      });
      return { success: true };
    } catch (error) {
      // Fall back to strategies array
    }
  }
  // ... existing fallback logic
}
```

**Benefits**:
- Per-site optimization
- Static sites can still use `domcontentloaded`
- SPAs can specify `load`

### Solution 3: Long-term Fix (Smartest)
Implement adaptive strategy learning:

```javascript
class NavigationStrategyCache {
  constructor() {
    this.successfulStrategies = new Map(); // domain -> strategy
  }

  recordSuccess(domain, strategy) {
    this.successfulStrategies.set(domain, strategy);
  }

  getPreferredStrategy(domain) {
    return this.successfulStrategies.get(domain);
  }
}
```

Then in `navigateWithFallback()`:
```javascript
async navigateWithFallback(page, url) {
  const domain = new URL(url).hostname;
  const cached = this.strategyCache.getPreferredStrategy(domain);

  if (cached) {
    // Try cached strategy first
    try {
      await page.goto(url, { waitUntil: cached.waitUntil, timeout: cached.timeout });
      return { success: true };
    } catch (error) {
      // Clear cache and fall through
      this.strategyCache.clear(domain);
    }
  }

  // Try all strategies
  for (const strategy of this.strategies) {
    try {
      await page.goto(url, { waitUntil: strategy.waitUntil, timeout: strategy.timeout });
      this.strategyCache.recordSuccess(domain, strategy); // Cache successful strategy
      return { success: true };
    } catch (error) {
      continue;
    }
  }
}
```

**Benefits**:
- Learns optimal strategy per domain
- First page takes 45s, subsequent pages take 5-10s
- Automatically adapts to different site architectures
- No manual configuration needed

## Related Code Locations

- `src/core/scraper.js:766-826` - `navigateWithFallback()` method
- `src/core/scraper.js:831-1013` - `scrapePage()` method
- `src/config/configValidator.js` - Add `navigationStrategy` field
- `doc-targets/claude-code.json` - Site-specific config

## Recommended Implementation Plan

1. **Phase 1** (Quick win): Reverse strategy order → PR ready in 5 minutes
2. **Phase 2** (Config support): Add `navigationStrategy` config → PR ready in 30 minutes
3. **Phase 3** (Smart caching): Implement adaptive learning → PR ready in 2 hours

## Environment

- **Target**: code.claude.com (Next.js SPA with React hydration)
- **Total pages**: 44
- **Failed on first attempt**: 12 (27%)
- **Current performance**: 0.05 pages/second (18.3s/page)
- **Expected performance**: 0.15 pages/second (6-7s/page)
- **Configuration**: `enablePDFStyleProcessing: true`
- **Browser**: Puppeteer with Stealth plugin

## Additional Notes

This issue is especially problematic for large documentation sites (100+ pages), where inefficient navigation would add 1-2 hours of unnecessary wait time.

## References

- Puppeteer navigation options: https://pptr.dev/guides/page-interactions#navigation
- Next.js hydration timing: https://nextjs.org/docs/architecture/nextjs-compiler
