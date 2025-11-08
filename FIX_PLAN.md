# Remediation Plan for Code Review Findings

## 1. Resolve unbounded Python merge timeout
- [ ] Audit `_executePython` in `src/services/PythonMergeService.js` to capture the handle from `setTimeout`.
- [ ] Introduce a `settled` flag to guard double resolution/rejection paths.
- [ ] Clear the timeout in both the `'close'` and `'error'` event handlers, and immediately before manual rejection.
- [ ] Add unit coverage in `tests/services/PythonMergeService.test.js` to assert that successful runs clear timers and that timeouts reject exactly once.

## 2. Align scraper and queue manager task events
- [ ] Decide on a single naming convention (camelCase) for queue task lifecycle events.
- [ ] Update `src/services/queueManager.js` to emit `'taskCompleted'`/`'taskFailed'` (and adjust other related events if necessary).
- [ ] Update `src/core/scraper.js` listeners to match any renamed events and ensure logging is triggered.
- [ ] Extend tests under `tests/core/scraper.test.js` and `tests/services/queueManager.test.js` to verify the event flow end-to-end.

## 3. Regression validation
- [ ] Run `npm test` to cover new and existing suites.
- [ ] Execute an integration scrape via `npm start` (or `make run`) against a small target list to confirm absence of spurious timeout errors and presence of queue telemetry logs.
