# Responsive Home Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fit all six home functional groups and the advertisement-cover entry inside the current desktop window while retaining readable responsive fallbacks for short and narrow windows.

**Architecture:** Keep the Vue template, entry wiring, and main process unchanged. Add a real Electron viewport regression to the existing smoke harness, then replace only the scoped home CSS with a four-row page grid whose dashboard uses a compact three-by-two layout and switches to scrollable two- or one-column layouts at the approved breakpoints.

**Tech Stack:** Vue 3 single-file components, scoped CSS Grid, Electron 31, Node.js assertions, existing Electron smoke harness

---

## File Structure

- Modify `scripts/window-smoke.cjs`: assert the rendered home page fits a 1234 by 770 desktop viewport and exposes a two-column fallback at 900 by 650.
- Modify `src/renderer/src/views/HomeView.vue`: implement the approved compact four-row home layout and responsive breakpoints without changing template or script behavior.

### Task 1: Capture the responsive contract in a real Electron window

**Files:**
- Modify: `scripts/window-smoke.cjs`

- [ ] **Step 1: Add the failing desktop-fit and compact-fallback smoke check**

Insert this check after `home exposes seven video entries and five-mode chooser` and before the preload check:

```js
await check('home dashboard fits desktop viewport and keeps a readable compact fallback',async()=>{
  home.setContentSize(1234,770)
  await pause(150)
  const desktop=await evaluate(home,`(()=>{
    const page=document.querySelector('.home')
    const groups=[...document.querySelectorAll('.dashboard .group')]
    const footer=document.querySelector('.ad-cover-entry')
    return {
      groups:groups.length,
      clientHeight:page.clientHeight,
      scrollHeight:page.scrollHeight,
      footerBottom:Math.ceil(footer.getBoundingClientRect().bottom)
    }
  })()`)
  assert.equal(desktop.groups,6)
  assert.ok(desktop.scrollHeight<=desktop.clientHeight+1,`desktop home scrolls: ${desktop.scrollHeight}/${desktop.clientHeight}`)
  assert.ok(desktop.footerBottom<=desktop.clientHeight+1,`footer bottom ${desktop.footerBottom} exceeds ${desktop.clientHeight}`)

  home.setContentSize(900,650)
  await pause(150)
  const compact=await evaluate(home,`(()=>{
    const dashboard=document.querySelector('.dashboard')
    return {
      columns:getComputedStyle(dashboard).gridTemplateColumns.split(' ').filter(Boolean).length,
      buttons:document.querySelectorAll('.dashboard button').length
    }
  })()`)
  assert.equal(compact.columns,2)
  assert.equal(compact.buttons,22)

  home.setContentSize(1234,770)
  await pause(100)
})
```

- [ ] **Step 2: Run the existing built application and verify RED**

Run:

```powershell
node --check scripts/window-smoke.cjs
npm run build
npm run test:smoke
```

Expected: syntax and build succeed; smoke fails at `home dashboard fits desktop viewport and keeps a readable compact fallback` because the current home page has a scroll height greater than its 770-pixel client height.

### Task 2: Implement the compact four-row responsive layout

**Files:**
- Modify: `src/renderer/src/views/HomeView.vue`

- [ ] **Step 1: Replace only the home layout CSS before the existing mobile rule**

Keep the template and script unchanged. Replace the current declarations for `.home`, `.top`, `.logo`, `.logo span`, `.logout`, `.app-error`, `.dashboard`, `.group`, `.group h3`, `.grid`, `.grid button`, and `.ad-cover-entry` with:

```css
.home {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  width: 100%;
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  color: #f7f8ff;
  background: radial-gradient(circle at 50% 0, #292b4b 0, #20223e 38%, #191a31 100%);
  font-family: "Microsoft YaHei", sans-serif;
}

.top {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 84px;
}

.logo {
  font-size: 42px;
  font-weight: 800;
  letter-spacing: 1px;
  text-shadow: 0 4px 20px #0008;
}

.logo span {
  margin-left: 10px;
  font-size: 34px;
}

.logout {
  position: absolute;
  top: 22px;
  right: 28px;
  color: #fff;
  font-size: 15px;
  cursor: pointer;
  background: none;
  border: 0;
}

.app-error {
  margin: 0 30px 10px;
  padding: 8px 12px;
  color: #664d03;
  line-height: 1.35;
  background: #fff3cd;
  border: 1px solid #d6b76a;
  border-radius: 8px;
}

.dashboard {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 14px 24px;
  min-height: 0;
  padding: 0 30px;
}

.group {
  min-height: 0;
  padding: 12px 16px;
  box-sizing: border-box;
  background: #35364d;
  border: 1px solid #4b4d69;
  border-radius: 15px;
  box-shadow: 0 16px 30px #0c0d1b33;
}

.group h3 {
  margin: 0 0 8px;
  padding-bottom: 6px;
  color: #9db5ff;
  font-size: 21px;
  line-height: 1.2;
  border-bottom: 1px solid #50516b;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.grid button {
  min-height: 40px;
  padding: 4px 8px;
  color: #fff;
  font-size: 15px;
  line-height: 1.2;
  cursor: pointer;
  background: #5b5c73;
  border: 1px solid transparent;
  border-radius: 10px;
}

.ad-cover-entry {
  display: block;
  margin: 9px auto 11px;
  color: #4f9aff;
  font-size: 15px;
  cursor: pointer;
  background: none;
  border: 0;
}
```

Keep the existing hover/focus and `.grid .wide` rules unchanged.

- [ ] **Step 2: Add the short-window and narrow-window fallback rules**

Replace the existing `@media (max-width: 900px)` block with these rules:

```css
@media (max-width: 900px), (max-height: 650px) {
  .home {
    grid-template-rows: auto auto auto auto;
  }

  .dashboard {
    grid-template-rows: none;
  }

  .group {
    min-height: 220px;
  }
}

@media (max-width: 900px) {
  .dashboard {
    grid-template-columns: 1fr 1fr;
  }

  .logo {
    font-size: 38px;
  }
}
```

Keep the existing `@media (max-width: 620px)` block so the dashboard becomes one column and logout remains outside the centered title flow.

- [ ] **Step 3: Build and verify GREEN in the real Electron smoke**

Run:

```powershell
npm run build
npm run test:smoke
```

Expected: build succeeds; the new home-layout check passes at both viewports; all existing smoke checks and the restart run pass with isolated user data and remote requests blocked.

- [ ] **Step 4: Run the focused home interaction regressions**

Run:

```powershell
node --test tests/home-view.test.mjs tests/home-video-entry.test.mjs tests/home-errors.test.mjs
```

Expected: all focused tests pass, proving that entry wiring, chooser behavior, errors, and mobile logout behavior remain unchanged.

- [ ] **Step 5: Confirm the patch contains no unrelated functional changes**

Run:

```powershell
git diff --check
git diff -- src/renderer/src/views/HomeView.vue scripts/window-smoke.cjs
```

Expected: no whitespace errors; the Vue template and script are unchanged; the only functional test addition is the home viewport check.

- [ ] **Step 6: Commit the responsive dashboard**

```powershell
git add src/renderer/src/views/HomeView.vue scripts/window-smoke.cjs docs/superpowers/plans/2026-09-23-home-responsive-dashboard.md
git commit -m "fix: fit home dashboard to desktop window"
```
