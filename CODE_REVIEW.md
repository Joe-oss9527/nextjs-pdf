# Code Review Report

## Summary
- Identified an unbounded timeout in the Python merge execution helper that can terminate successful runs and raise spurious errors.
- Found mismatched queue event names between the scraper and queue manager that suppress expected task telemetry logs.

## Detailed Findings

### 1. Python merge timeout is never cleared
- **Location:** `src/services/PythonMergeService.js`
- **Issue:** `_executePython` registers a `setTimeout` that never gets cleared when the spawned process exits normally. Once the timeout elapses it still runs, attempts to send `SIGTERM` to an already finished process, and rejects the promise. This can surface as `kill ESRCH` or "execution timeout" errors even though the merge succeeded, and the rejection after `resolve` risks triggering unhandled promise rejections.
- **Recommendation:** Store the timeout handle, clear it inside both the `'close'` and `'error'` handlers, and guard the timeout callback against already-resolved executions (e.g., by tracking a settled flag).
- **References:** `setTimeout` logic without a matching `clearTimeout` at lines 325-352.【F:src/services/PythonMergeService.js†L321-L352】

### 2. Scraper never receives queue completion/failure events
- **Location:** `src/core/scraper.js`, `src/services/queueManager.js`
- **Issue:** The scraper listens for camelCase events (`'taskCompleted'`, `'taskFailed'`), but the queue manager emits kebab-case names (`'task-completed'`, `'task-failure'`). As a result, the scraper never logs task completion/failure, depriving operators of visibility and making debugging harder.
- **Recommendation:** Align the emitted event names with the listener expectations—either change the emission to camelCase or update the scraper to subscribe to the kebab-case variants.
- **References:** Listener registrations in the scraper (lines 43-64) vs. emitted names in the queue manager (lines 33-90).【F:src/core/scraper.js†L43-L64】【F:src/services/queueManager.js†L33-L90】

## Suggested Next Steps
1. Patch `_executePython` to clear the timeout promptly and guard against double-settlement.
2. Standardize queue event naming so the scraper's listeners fire as intended.

