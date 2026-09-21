# Window bridge implementation plan

> **For agentic workers:** Use subagent-driven-development for bounded implementation and review, with inline integration. Do not initialize Git in this non-repository directory.

**Goal:** Repair the first-batch window controls, shortcut registration, IPC and persisted settings without modifying the reference software.

**Architecture:** Keep existing routes and named preload APIs. Extract testable shortcut, storage and window-control logic, then wire existing main/preload/Vue consumers to it. Use isolated Electron data for smoke tests.

**Tech Stack:** Electron, Vue 3, electron-vite, Node built-in test runner.

**Verified 2026-09-17:** 40 regression tests, production build, 13 real Electron checks and 2 cold-restart checks passed. Checkmarks below cover implemented bridge tasks only. Physical keyboard triggering, specialized boss overlays/auto-scroll integration and platform player features remain pending; see `../window-bridge-verification.md` for limits and evidence. No Git operations were performed.

## Task 1: Safety and baseline

- [x] Archive existing src, scripts and package metadata under backups; do not include node_modules or reference directories.
- [x] Run `npm.cmd run build` in the replica and record the existing result. Git worktrees/commits are unavailable because this is not a Git repository.

## Task 2: Shortcut contract

Files: `src/shared/shortcuts.mjs`, `src/main/shortcuts.mjs`, `src/main/sites.js`, `src/main/index.js`, `src/renderer/src/views/KeywordView.vue`, `tests/shortcuts.test.mjs`.

- [x] Add failing Node tests for canonical defaults, legacy-key migration, duplicates and failed registration. Example: `assert.equal(normalizeShortcuts({ next: 'Ctrl+N' }).allNext, 'Ctrl+N')`.
- [x] Run `node --test tests/shortcuts.test.mjs` and inspect the expected failures.
- [x] Implement normalization and transactional registration, reporting failures and retaining old registrations/configuration on rejected changes. Wire `get-shortcuts`, `set-shortcuts` and `update-shortcuts` to this contract.
- [x] Replace settings-page duplicate definitions with shared constants; save once and display failure details instead of claiming success.
- [x] Re-run shortcut tests and review specification compliance before quality review.

## Task 3: Persistent storage and window behavior

Files: `src/main/storage.mjs`, `src/main/store.js`, `src/main/window-controls.mjs`, `src/main/index.js`, `src/main/sites.js`, `tests/storage.test.mjs`, `tests/window-controls.test.mjs`.

- [x] Write failing tests for real-file setting round trips, retained legacy flat keys, write errors, independent defaults, targeted opacity/fullscreen/topmost controls, auto-hide restoration and boss-key visible-state preservation. Example: `controller.setOpacity('web', 0.4); assert.equal(web.opacity, 0.4); assert.equal(main.opacity, 1)`.
- [x] Run the tests and verify expected assertions fail before implementing behavior.
- [x] Persist safely and report errors. Implement cursor-based auto-hide via opacity zero/input forwarding, with valid restoration. Save window bounds/topmost/opacity and constrain restored positions to a connected work area.
- [x] Register main IPC for sender-targeted operations, close the correct window, distinguish full-screen from topmost, and implement missing click-through controls.
- [x] Explicitly reject missing native alpha binding rather than manipulate the application as a substitute.
- [x] Re-run tests and review behavior against source before integration review.

## Task 4: Preload and page wiring

Files: `src/preload/events.mjs`, `src/preload/index.js`, `src/renderer/src/views/SiteView.vue`, `src/renderer/src/views/TestPierceView.vue`, `src/renderer/src/views/VideoView.vue`, `tests/preload-events.test.mjs`.

- [x] Add failing unsubscribe tests. Use `EventEmitter` as the IPC event boundary: subscribe, emit once, unsubscribe twice, emit again, and assert the callback ran once without exposing an Electron event object.
- [x] Run tests to confirm failure; implement safe callback wrappers with unsubscribe functions.
- [x] Expose a narrow `windowControl` bridge for get-state, opacity, topmost, fullscreen, auto-hide, close and relevant state/boss notifications. Connect page buttons to these APIs and show errors.
- [x] Add unsubscribes on page unmount. Wire the local-video transparent-window close button using sender-targeted close. Do not claim platform-specific likes/next-player controls are implemented.
- [x] Re-run tests and compile/build the actual application.

## Task 5: Isolated Electron smoke and review

Files: `scripts/window-smoke.cjs`, `package.json`, `docs/superpowers/window-bridge-verification.md`.

- [x] Add a self-terminating smoke harness using a unique temporary userData, blocked remote HTTP(S), locally loaded production renderer and actual main IPC. Do not reuse existing full-sweep scripts.
- [x] Assert real window creation, independent opacity/topmost/fullscreen, correct close, auto-hide restoration, saved state after close/reopen, event unsubscribe and native-bind rejection.
- [x] Run `npm.cmd test`, `npm.cmd run build`, `npm.cmd run test:smoke`. Global keyboard triggering requires separate runtime confirmation; do not equate dispatched callbacks with physical keyboard validation.
- [x] Request read-only spec compliance review, then quality review; fix important findings and repeat tests.
- [x] Document exact test results and remaining manual/platform-dependent checks. Update plan checkboxes only after evidence.
