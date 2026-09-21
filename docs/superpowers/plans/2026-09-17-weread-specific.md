# WeRead specific controls implementation plan

> **For agentic workers:** Use subagent-driven-development for the isolated webpage-script task and two-stage read-only review. Integrate in the current non-Git directory; do not create a repository or modify reference files.

**Goal:** Replace every generic control visible in ordinary `/weRead` with the recording's compact native-reading controls, and implement their actual behavior.

**Architecture:** Dedicated WeReadView loads the real site in webview. A renderer controller owns preferences/CSS/lifecycle; serializable webpage functions manage real DOM controls and scrolling. Existing sender-targeted windowControl remains authoritative for native window state.

**Tech Stack:** Vue 3, Electron, electron-vite, Node test runner.

## Task 1: Safety and webpage scripts

- [x] Archive current src/scripts/package/config and record fresh baseline tests. No Git initialization.
- [x] Before implementation add failing `tests/weread-scripts.test.mjs` for reversible real-controls DOM relocation, missing-controls errors and cumulative scroll/cleanup.
- [x] Create `src/renderer/src/features/weread/page-scripts.mjs`, exporting self-contained `showReaderControls`, `hideReaderControls`, `startAutoScroll(speed)`, `stopAutoScroll`, `cleanupWeReadPage`. Main use is `webview.executeJavaScript('(' + fn.toString() + ')(' + args.map(JSON.stringify).join(',') + ')')`. Functions cannot close over module variables.
- [x] Read-only specification review then quality review; address important findings. Actual DOM behavior is additionally checked by Task 4.

## Task 2: Renderer lifecycle controller

- [x] Add failing `tests/weread-controller.test.mjs` exercising actual controller with Electron webview/settings boundaries. After transparent-on/show-controls/hide-controls, state.transparent must remain true, preference writes only reflect the user toggle, and live CSS is restored.
- [x] Create `controller.mjs` exporting `createWeReadState()` and `createWeReadController({state,getWebview,settings})`. Public async actions: load, domReady, setTransparent, toggleReaderControls, setZoom, setStyle, resetStyle, setScrollbarHidden, setAutoScroll, setSpeed, setHidden, dispose; navigationStarted invalidates old document resources. State supplies transparent/controlsShown/zoom/backgroundColor/fontColor/scrollbarHidden/autoScrollEnabled/speed/hidden/ready/lastAddress.
- [x] CSS handles owned by this controller only; serialize actions, reject stale document operations, reapply settings on new DOM, preserve temporary transparency and scroll pause independently from preferences. Use settingApi keys from approved spec, no custom preload required.
- [x] Node tests pass; preserve existing regressions (65 total tests pass).

## Task 3: Compact Vue page and routing

- [x] Add failing `tests/weread-view.test.mjs`: `/weRead` must reference WeReadView.vue, other site/ad routes remain unchanged, template has compact named icon actions and no generic address/full-screen/back-forward controls. Execute setup methods when practical; real click assertions in Task 4.
- [x] Create WeReadView.vue with inline SVG compact icons (not emoji substitutions), 30px original-color toolbar, no-drag buttons/drag spacer, white-eye recovery, dark opacity dialog (0.1–1, 0.01), true readerControls toggle, visible errors, More functions and cleanup.
- [x] Replace only the ordinary WeRead route component import with `../views/WeReadView.vue`; keep route name and metadata unchanged.
- [x] Native actions call windowControl; state subscription updates controls and temporary scroll pause from state.hidden. Subscribe to stop-or-continue to toggle autoScroll preference; obtain actual shortcut labels using get-shortcuts. No old controls rendered in the ordinary WeRead window.
- [x] Build and compile the new page; inspect actual rendered screenshot.

## Task 4: Isolated Electron smoke and handoff

- [x] Add scripts/weread-smoke.cjs plus run-weread-smoke.mjs and test:weread npm command.
- [x] Use unique temporary userData, block remote HTTP(S), load production main/preload/Vue, create real WeRead window, replace guest content with local HTML containing readerControls, controls with preexisting styles and long paragraphs. Test via real renderer icon clicks and read guest DOM.
- [x] Verify no generic controls, show/hide eye, native topmost/opacity, CSS transparency without native dimming, temporary transparency and true DOM relocation/restoration, failure reporting, slider precision, More functions, hidden/boss pause/resume, refresh reapplication, reopen/restart saved settings. Never claim online site compatibility or physical keyboard validation from local fixtures.
- [x] Run npm.cmd test, npm.cmd run build, npm.cmd run test:smoke, npm.cmd run test:weread; verify source archive hash unchanged.
- [x] Read-only reviews and verification completed; no important findings remain. Exact counts, screenshots, pending manual checks and backup recorded in `docs/superpowers/weread-verification.md`.
