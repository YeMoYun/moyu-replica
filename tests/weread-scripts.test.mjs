import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

let scripts = {};
try {
  scripts = await import('../src/renderer/src/features/weread/page-scripts.mjs');
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

// Only the browser boundary is simulated: exported functions are serialized and
// executed unmodified, exactly like Electron executeJavaScript in the guest.
class Style {
  constructor(owner) { this.owner = owner; this.values = new Map(); }
  get cssText() { return this.owner.attributes.get('style') ?? ''; }
  set cssText(value) { this.owner.attributes.set('style', value); this.values.clear(); }
  setProperty(name, value, priority = '') {
    this.values.set(name, { value, priority });
    this.owner.attributes.set('style', `${this.cssText}${name}:${value}${priority ? ' !important' : ''};`);
  }
  getPropertyValue(name) { return this.values.get(name)?.value ?? ''; }
}

class Element {
  constructor(tag, document) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = document;
    this.attributes = new Map(); this.children = []; this.parentNode = null;
    this.style = new Style(this); this.width = 320;
    this.classList = {
      contains: (name) => this.className.split(/\s+/).includes(name),
      add: (name) => { if (!this.classList.contains(name)) this.className = `${this.className} ${name}`.trim(); },
      remove: (name) => { this.className = this.className.split(/\s+/).filter((entry) => entry !== name).join(' '); }
    };
  }
  get id() { return this.getAttribute('id') ?? ''; }
  set id(value) { this.setAttribute('id', value); }
  get className() { return this.getAttribute('class') ?? ''; }
  set className(value) { this.setAttribute('class', value); }
  get parentElement() { return this.parentNode; }
  get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] ?? null; }
  get isConnected() { return this === this.ownerDocument.documentElement || Boolean(this.parentNode?.isConnected); }
  get childElementCount() { return this.children.length; }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'style') this.style.values.clear(); }
  removeAttribute(name) { this.attributes.delete(name); }
  appendChild(child) { return this.insertBefore(child, null); }
  insertBefore(child, next) {
    if (next && next.parentNode !== this) throw new Error('NotFoundError');
    child.remove(); const index = next ? this.children.indexOf(next) : this.children.length;
    this.children.splice(index, 0, child); child.parentNode = this; return child;
  }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    const result = [];
    for (const child of this.children) {
      if (selector.startsWith('.') ? child.classList.contains(selector.slice(1)) : child.id === selector.slice(1)) result.push(child);
      result.push(...child.querySelectorAll(selector));
    }
    return result;
  }
  get scrollWidth() { return this.width; }
  getBoundingClientRect() {
    const maximum = Number.parseFloat(this.style.getPropertyValue('max-width'));
    return { width: Number.isFinite(maximum) ? Math.min(this.width, maximum) : this.width, height: 48 };
  }
}

function page({ controls = true, width = 800 } = {}) {
  const document = { createElement: (tag) => new Element(tag, document) };
  document.documentElement = document.createElement('html');
  document.documentElement.scrollHeight = 5000; document.documentElement.scrollTop = 0;
  document.documentElement.clientWidth = width;
  document.body = document.createElement('body'); document.documentElement.appendChild(document.body);
  document.querySelector = (selector) => document.documentElement.querySelector(selector);
  document.getElementById = (id) => document.documentElement.querySelector(`#${id}`);
  const parent = document.createElement('section'); document.body.appendChild(parent);
  const reader = document.createElement('div'); reader.className = 'readerControls original';
  reader.setAttribute('style', 'position: fixed; color: blue;');
  const button = document.createElement('button'); button.setAttribute('style', 'display: none;'); reader.appendChild(button);
  const unstyled = document.createElement('button'); reader.appendChild(unstyled);
  const tip = document.createElement('span'); tip.className = 'wr_tooltip_item wr_tooltip_item--right other';
  tip.setAttribute('style', 'color: green;'); tip.setAttribute('data-wr-tip-moved', 'original'); button.appendChild(tip);
  const sibling = document.createElement('aside');
  if (controls) parent.appendChild(reader);
  parent.appendChild(sibling);
  const frames = new Map(); const cancelled = []; const listeners = new Map(); let nextId = 1; let time = 0;
  const window = {
    innerWidth: width, innerHeight: 600, pageYOffset: 0,
    scrollBy(_x, amount) { this.pageYOffset = Math.min(4400, this.pageYOffset + amount); },
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); }
  };
  const context = vm.createContext({ document, window, performance: { now: () => time },
    requestAnimationFrame: (callback) => { const id = nextId++; frames.set(id, callback); return id; },
    cancelAnimationFrame: (id) => { cancelled.push(id); frames.delete(id); }
  });
  return { document, window, reader, button, unstyled, tip, parent, sibling, frames, cancelled, listeners,
    run(name, ...args) {
      assert.equal(typeof scripts[name], 'function', `missing exported ${name}`);
      const result = vm.runInContext(`(${scripts[name].toString()})(${args.map((arg) => JSON.stringify(arg)).join(',')})`, context);
      return result === undefined ? undefined : JSON.parse(JSON.stringify(result));
    },
    tick(delta = 16.67) { time += delta; const entries = [...frames.values()]; frames.clear(); entries.forEach((callback) => callback(time)); }
  };
}

test('exports five independently serializable page functions', () => {
  for (const name of ['showReaderControls', 'hideReaderControls', 'startAutoScroll', 'stopAutoScroll', 'cleanupWeReadPage']) assert.equal(typeof scripts[name], 'function', `missing exported ${name}`);
});

test('missing genuine reader controls throws a visible Chinese error without a wrapper', () => {
  const p = page({ controls: false });
  assert.throws(() => p.run('showReaderControls'), /未找到.*控制栏/);
  assert.equal(p.document.getElementById('__wr-ctrl-float__'), null);
});

test('show is idempotent, horizontal, source colored, and viewport clamped', () => {
  const p = page({ width: 400 });
  assert.equal(p.run('showReaderControls').shown, true);
  const wrapper = p.document.getElementById('__wr-ctrl-float__');
  p.run('showReaderControls');
  assert.equal(p.document.body.querySelectorAll('#__wr-ctrl-float__').length, 1);
  assert.equal(p.reader.parentNode, wrapper);
  assert.match(wrapper.style.cssText, /rgb\(233 189 125 \/ 95%\)/);
  assert.match(wrapper.style.cssText, /border-radius:8px/);
  assert.equal(p.reader.style.getPropertyValue('flex-direction'), 'row');
  assert.equal(p.reader.style.getPropertyValue('gap'), '6px');
  assert.equal(p.button.style.getPropertyValue('display'), 'flex');
  assert.equal(p.tip.classList.contains('wr_tooltip_item--top'), true);
  assert.equal(p.tip.style.getPropertyValue('color'), '#ff0000');
  const left = Number.parseFloat(wrapper.style.getPropertyValue('left'));
  assert.ok(left >= 8 && left + wrapper.width <= p.window.innerWidth - 8);
});

test('hide restores exact attributes, every child style, tooltip data and original DOM position', () => {
  const p = page();
  const originals = [p.reader, p.button, p.unstyled, p.tip].map((node) => [...node.attributes]);
  p.run('showReaderControls'); p.run('hideReaderControls');
  assert.equal(p.reader.parentNode, p.parent); assert.equal(p.reader.nextSibling, p.sibling);
  [p.reader, p.button, p.unstyled, p.tip].forEach((node, index) => assert.deepEqual([...node.attributes], originals[index]));
  assert.equal(p.document.getElementById('__wr-ctrl-float__'), null);
  assert.equal(p.listeners.size, 0);
  assert.equal(p.run('hideReaderControls').shown, false);
});

test('removed original parent or sibling does not destroy the genuine controls', () => {
  const p = page(); p.run('showReaderControls'); p.parent.remove(); p.run('hideReaderControls');
  assert.equal(p.reader.parentNode, p.document.body); assert.equal(p.reader.isConnected, true);
  const second = page(); second.run('showReaderControls'); second.sibling.remove(); second.run('hideReaderControls');
  assert.equal(second.reader.parentNode, second.parent);
});

test('resize reclamps floating controls and hide removes the listener', () => {
  const p = page(); p.run('showReaderControls'); p.window.innerWidth = 350;
  assert.equal(typeof p.listeners.get('resize'), 'function'); p.listeners.get('resize')();
  const wrapper = p.document.getElementById('__wr-ctrl-float__');
  const left = Number.parseFloat(wrapper.style.getPropertyValue('left'));
  assert.ok(left >= 8 && left + wrapper.width <= 342);
  p.run('hideReaderControls'); assert.equal(p.listeners.size, 0);
});

test('toolbar wider than a narrow viewport is horizontally scrollable, not clipped offscreen', () => {
  const p = page({ width: 220 }); p.run('showReaderControls');
  const wrapper = p.document.getElementById('__wr-ctrl-float__');
  assert.equal(wrapper.style.getPropertyValue('overflow-x'), 'auto');
  assert.equal(wrapper.style.getPropertyValue('max-width'), '204px');
  assert.equal(wrapper.style.getPropertyValue('left'), '8px');
  assert.equal(p.button.style.getPropertyValue('flex-shrink'), '0');
});

test('a direct-child tooltip restores exact style and absent direction marker', () => {
  const p = page(); p.reader.appendChild(p.tip); p.tip.removeAttribute('data-wr-tip-moved');
  p.run('showReaderControls'); p.run('cleanupWeReadPage');
  assert.equal(p.tip.getAttribute('style'), 'color: green;');
  assert.equal(p.tip.getAttribute('data-wr-tip-moved'), null);
  assert.equal(p.tip.className, 'wr_tooltip_item wr_tooltip_item--right other');
});

test('a cancelled stale animation callback cannot restart after speed change or stop', () => {
  const p = page(); p.run('startAutoScroll', 1); const stale = [...p.frames.values()][0];
  p.run('startAutoScroll', 10); stale(100); assert.equal(p.frames.size, 1);
  const active = [...p.frames.values()][0]; p.run('stopAutoScroll'); active(100);
  assert.equal(p.frames.size, 0); assert.equal(p.window.pageYOffset, 0);
});

test('speed 1 accumulates subpixel distance rather than rounding every frame', () => {
  const p = page(); assert.equal(p.run('startAutoScroll', 1).scrolling, true);
  for (let frame = 0; frame < 8; frame++) p.tick();
  assert.equal(p.window.pageYOffset, 0); p.tick(); assert.equal(p.window.pageYOffset, 1);
});

test('speed 10 uses source 0.12 factor and clamps background resume delta', () => {
  const p = page(); p.run('startAutoScroll', 10); p.tick(); assert.equal(p.window.pageYOffset, 1);
  p.tick(50000); assert.equal(p.window.pageYOffset, 2);
});

test('restarting cancels old loop and stop cancels the last active animation', () => {
  const p = page(); p.run('startAutoScroll', 1); const original = [...p.frames.keys()][0];
  p.run('startAutoScroll', 10); assert.ok(p.cancelled.includes(original)); assert.equal(p.frames.size, 1);
  assert.equal(p.run('stopAutoScroll').scrolling, false); assert.equal(p.frames.size, 0);
  p.tick(); assert.equal(p.window.pageYOffset, 0);
});

test('invalid speeds are rejected without creating a loop', () => {
  for (const speed of [0, 11, -1, '5', null]) {
    const p = page(); assert.throws(() => p.run('startAutoScroll', speed), /1.*10/); assert.equal(p.frames.size, 0);
  }
});

test('bottom automatically halts and cleanup restores DOM while cancelling scroll', () => {
  const p = page(); p.window.pageYOffset = 4400; p.run('startAutoScroll', 5); p.tick(); assert.equal(p.frames.size, 0);
  p.window.pageYOffset = 0; p.run('startAutoScroll', 5); p.run('showReaderControls');
  assert.deepEqual(p.run('cleanupWeReadPage'), { shown: false, scrolling: false });
  assert.equal(p.frames.size, 0); assert.equal(p.reader.parentNode, p.parent);
  assert.equal(p.button.getAttribute('style'), 'display: none;'); assert.equal(p.unstyled.getAttribute('style'), null);
  assert.equal(p.tip.className, 'wr_tooltip_item wr_tooltip_item--right other');
  assert.equal(p.document.getElementById('__wr-ctrl-float__'), null); assert.equal(p.listeners.size, 0);
});
