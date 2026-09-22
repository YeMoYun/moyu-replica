# Huya Opacity Resize Fit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Huya opacity mode automatically refit its page whenever the native window is resized, even after a manual zoom selection.

**Architecture:** Reuse the existing `ResizeObserver -> page.resize()` path and keep the change inside the shared video-opacity controller. The controller will treat `huyaOpacity` as always auto-fitting on resize while preserving the existing opt-in auto-fit behavior for Bilibili and Kuaishou.

**Tech Stack:** Electron, Vue 3, JavaScript ES modules, Node.js built-in test runner

---

## File Structure

- Modify `tests/video-opacity.test.mjs`: encode Huya's new forced-auto-fit behavior and retain regression coverage for Bilibili/Kuaishou manual zoom.
- Modify `src/renderer/src/features/video-opacity/controller.mjs`: apply the platform-specific resize rule without changing the Vue view or other platform controllers.

### Task 1: Lock the Huya resize contract with a failing test

**Files:**
- Modify: `tests/video-opacity.test.mjs`
- Test: `tests/video-opacity.test.mjs`

- [ ] **Step 1: Preserve the existing manual-resize behavior test for unaffected platforms**

Change the loop that asserts manual zoom survives resizing so it covers only Bilibili and Kuaishou:

```js
for(const site of ['bilibili','kuaishou']){
  test(`${site} manual zoom persists across navigation; restore fits resized viewport`,async()=>{
    const h=harness(site);await h.page.load();await h.page.domReady();assert.equal(h.zoom,.39)
    await h.page.setZoom(.75);assert.equal(h.settings[`${site}Opacity.zoom`],.75)
    h.page.navigationStarted();await h.page.domReady();assert.equal(h.zoom,.75)
    h.box={width:700,height:600};await h.page.resize();assert.equal(h.zoom,.75)
    await h.page.restoreAutoFit();assert.equal(h.zoom,.55);assert.equal(h.state.autoFit,true)
  })
}
```

- [ ] **Step 2: Add the Huya forced-auto-fit regression test**

Add this test immediately after the unaffected-platform loop:

```js
test('huya resize restores automatic fit after a manual zoom selection',async()=>{
  const h=harness('huya')
  await h.page.load();await h.page.domReady();assert.equal(h.zoom,.39)
  await h.page.setZoom(.75);assert.equal(h.state.autoFit,false)
  h.box={width:700,height:600};await h.page.resize()
  assert.equal(h.zoom,.55)
  assert.equal(h.state.autoFit,true)
  assert.equal(h.settings['huyaOpacity.zoom'],.55)
  assert.equal(h.settings['huyaOpacity.autoFit'],true)
})
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```powershell
node --test tests/video-opacity.test.mjs
```

Expected: the new Huya test fails because the actual zoom remains `0.75` instead of becoming `0.55`.

### Task 2: Implement Huya-only forced fitting on resize

**Files:**
- Modify: `src/renderer/src/features/video-opacity/controller.mjs`
- Test: `tests/video-opacity.test.mjs`

- [ ] **Step 1: Change the shared resize operation with a Huya-specific condition**

Replace the existing `resize` member with:

```js
resize: () => enqueue(async epoch => {
  if (state.ready && (state.autoFit || platform.key === 'huyaOpacity')) {
    await applyZoom(fittedZoom(), true, epoch)
  }
}),
```

This keeps all existing generation, disposal, fit calculation, persistence, and rollback behavior.

- [ ] **Step 2: Run the focused test and verify GREEN**

Run:

```powershell
node --test tests/video-opacity.test.mjs
```

Expected: all tests in `tests/video-opacity.test.mjs` pass.

- [ ] **Step 3: Run the core regression suite**

Run:

```powershell
npm test
```

Expected: all project unit tests pass, including unchanged behavior for Bilibili and Kuaishou.

- [ ] **Step 4: Build the Electron application**

Run:

```powershell
npm run build
```

Expected: Electron Vite build completes successfully.

- [ ] **Step 5: Commit the bug fix**

```powershell
git add tests/video-opacity.test.mjs src/renderer/src/features/video-opacity/controller.mjs docs/superpowers/plans/2026-09-22-huya-opacity-resize-fit.md
git commit -m "fix: refit huya opacity page on resize"
```

