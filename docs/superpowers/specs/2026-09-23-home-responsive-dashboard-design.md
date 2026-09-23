# Responsive Home Dashboard Design

**Date:** 2026-09-23

## Goal

Make the home dashboard show every functional entry without vertical scrolling in the current 1234 by 808 outer window, whose renderer viewport is approximately 1234 by 770, while preserving the existing MoYuMaster visual style and all behavior.

## Scope

This change is limited to the home renderer layout in `src/renderer/src/views/HomeView.vue` and its regression coverage.

It must not change:

- any home entry label, order, click handler, or availability state;
- the five-mode video chooser;
- transparency-mode windows or their controls;
- feature-window opening, centering, persistence, or foreground behavior;
- any other renderer view or main-process route.

## Approved Layout

The home page uses a compact four-row structure:

1. a header containing the centered logo and logout action;
2. an optional shortcut/action error banner;
3. a flexible dashboard containing the six functional groups;
4. the advertisement-cover entry.

At the current desktop window size, the dashboard is a strict three-column by two-row grid. The six cards are equal-height within their rows and all remain visible at once.

The existing dark radial background, card colors, typography hierarchy, button treatment, and hover/focus behavior remain visually recognizable. Compactness comes from reducing header height, logo size, card padding, heading spacing, grid gaps, and button height. No control is removed or hidden.

## Responsive Rules

- Above 900 CSS pixels, use the compact three-column by two-row dashboard.
- At 900 CSS pixels and below, use two columns and allow the page to scroll as needed.
- Below 620 pixels, use one column and keep the existing mobile logout treatment.
- At viewport heights of 650 CSS pixels and below, stop compressing controls and allow vertical scrolling.
- At normal desktop height, the dashboard consumes the remaining viewport space between the optional error banner and footer entry.
- The shortcut error banner keeps its content and warning styling but uses tighter vertical spacing. When absent, the dashboard automatically receives the freed space.

These breakpoints are layout boundaries rather than new application settings.

## Content Requirements

All current entries remain present:

- Reading: WeChat Reading, Tomato Novel, Jinjiang Literature City, local reading.
- Web: web client and Zhihu.
- Video: Douyin, Bilibili, Huya, Douyu, Kuaishou, custom website, and local video.
- Game: standalone mode.
- Disguise: WeChat, DingTalk, and Feishu.
- System: personal center, shortcut settings, clear cache, operation guide, and customer service.
- Footer: advertisement cover.

The local-video button continues to span the full card width. Wrapping labels remain readable and centered.

## Implementation Boundary

Prefer CSS-only layout changes inside `HomeView.vue`. The Vue template and script should remain unchanged unless a test proves a minimal semantic hook is necessary. Use viewport-aware grid sizing and media queries rather than JavaScript resize listeners or whole-page `transform: scale(...)`.

The page retains scrolling as a safe fallback for unusually narrow windows, short windows, long error messages, or increased operating-system text scaling.

## Failure and Accessibility Behavior

- Content must never be clipped merely to satisfy the no-scroll desktop target.
- Keyboard focus styles remain visible.
- Buttons retain practical click targets; below the compact desktop limit, scrolling is preferred over further shrinking.
- A long error banner may increase page height and enable scrolling rather than overlap the dashboard.

## Verification

Add a focused regression test that first fails against the current fixed-height layout and then proves the approved responsive contract is present without changing entry wiring.

Verify the final result at:

- the target 1234 by 808 outer desktop window: all six groups and the advertisement entry visible without home-page scrolling in its renderer viewport;
- a 900 by 650 renderer viewport: responsive fallback remains usable;
- the existing 620-pixel mobile boundary: one-column layout and logout placement remain intact.

Reuse existing home-entry and interaction tests to ensure no functional entry or action changes.
