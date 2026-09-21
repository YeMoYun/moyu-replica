// These exports run in the guest page after Function#toString serialization.
// Keep every dependency inside the function or in the guest's window/document.
export function showReaderControls() {
  const previous = window.__wrReplicaControlsState;
  if (previous?.controls.isConnected && previous.wrapper.isConnected && previous.controls.parentNode === previous.wrapper) {
    previous.reposition();
    return { shown: true, children: previous.controls.childElementCount };
  }
  if (previous) {
    window.removeEventListener('resize', previous.reposition);
    for (const saved of previous.attributes) {
      for (const [name, present, value] of saved.values) {
        if (!present) saved.node.removeAttribute(name);
        else saved.node.setAttribute(name, value);
      }
    }
    if (previous.controls.parentNode === previous.wrapper) {
      const parent = previous.parent?.isConnected ? previous.parent : document.body;
      parent.insertBefore(previous.controls, previous.next?.parentNode === parent ? previous.next : null);
    }
    previous.wrapper.remove();
    delete window.__wrReplicaControlsState;
  }
  const controls = document.querySelector('.readerControls');
  if (!controls || !document.body) throw new Error('未找到微信读书控制栏，请先打开阅读页面并等待加载完成');

  const oldWrapper = document.getElementById('__wr-ctrl-float__');
  if (oldWrapper) {
    if (controls.parentNode === oldWrapper) document.body.appendChild(controls);
    oldWrapper.remove();
  }
  const attributes = [];
  const save = (node, names) => attributes.push({ node, values: names.map((name) => [name, node.hasAttribute(name), node.getAttribute(name)]) });
  save(controls, ['style']);
  const children = Array.from(controls.children);
  for (const child of children) save(child, ['style']);
  const tips = Array.from(controls.querySelectorAll('.wr_tooltip_item--right'));
  // Save tooltip attributes before child overrides, including a direct-child tip.
  for (const tip of tips) {
    const existing = attributes.find((entry) => entry.node === tip);
    if (existing) existing.values.push(['class', tip.hasAttribute('class'), tip.getAttribute('class')], ['data-wr-tip-moved', tip.hasAttribute('data-wr-tip-moved'), tip.getAttribute('data-wr-tip-moved')]);
    else save(tip, ['style', 'class', 'data-wr-tip-moved']);
  }
  const parent = controls.parentNode;
  const next = controls.nextSibling;
  const wrapper = document.createElement('div');
  wrapper.id = '__wr-ctrl-float__';
  wrapper.style.cssText = 'position:fixed;left:20%;top:50%;transform:translateY(-50%);z-index:2147483647;display:flex;flex-direction:row;align-items:center;gap:6px;box-sizing:border-box;background:rgb(233 189 125 / 95%);border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);padding:4px 8px;';
  const layout = document.createElement('style');
  layout.textContent = '#__wr-ctrl-float__ > .readerControls{position:static!important;transform:none!important;top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;display:flex!important;flex-direction:row!important;align-items:center!important;gap:6px!important;visibility:visible!important;opacity:1!important;width:auto!important;height:auto!important;overflow:visible!important;z-index:auto!important;flex-shrink:0!important}#__wr-ctrl-float__ > .readerControls > .readerControls_item{display:flex!important;visibility:visible!important;opacity:1!important;flex-shrink:0!important}#__wr-ctrl-float__ .wr_tooltip_item{color:#ff0000!important}';
  wrapper.appendChild(layout);
  document.body.appendChild(wrapper);
  wrapper.appendChild(controls);
  // Keep absent inline style attributes absent. The wrapper stylesheet above
  // supplies the visual overrides while source styles can be restored exactly.
  if (controls.hasAttribute('style')) {
    for (const [name, value] of Object.entries({ position: 'static', transform: 'none', top: 'auto', right: 'auto', bottom: 'auto', left: 'auto', display: 'flex', 'flex-direction': 'row', 'align-items': 'center', gap: '6px', visibility: 'visible', opacity: '1', width: 'auto', height: 'auto', overflow: 'visible', 'z-index': 'auto', 'flex-shrink': '0' })) {
      controls.style.setProperty(name, value, 'important');
    }
  }
  for (const child of children) {
    if (child.hasAttribute('style')) {
      for (const [name, value] of Object.entries({ display: 'flex', visibility: 'visible', opacity: '1', 'flex-shrink': '0' })) child.style.setProperty(name, value, 'important');
    }
  }
  for (const tip of tips) {
    tip.setAttribute('data-wr-tip-moved', '1');
    tip.classList.remove('wr_tooltip_item--right');
    tip.classList.add('wr_tooltip_item--top');
    if (tip.hasAttribute('style')) tip.style.setProperty('color', '#ff0000', 'important');
  }
  const reposition = () => {
    const viewport = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    const margin = Math.min(8, viewport / 4);
    const available = Math.max(1, viewport - margin * 2);
    wrapper.style.setProperty('max-width', `${available}px`);
    // A toolbar wider than the viewport stays accessible through horizontal
    // scrolling, instead of losing offscreen buttons or collapsing them.
    const naturalWidth = Math.max(wrapper.scrollWidth || 0, wrapper.getBoundingClientRect().width);
    const width = Math.min(naturalWidth, available);
    wrapper.style.setProperty('overflow-x', naturalWidth > available ? 'auto' : 'visible');
    wrapper.style.setProperty('left', `${Math.max(margin, Math.min(viewport * 0.2 - width / 2, viewport - margin - width))}px`);
  };
  reposition();
  window.addEventListener('resize', reposition);
  window.__wrReplicaControlsState = { controls, parent, next, wrapper, attributes, reposition };
  return { shown: true, children: controls.childElementCount };
}

export function hideReaderControls() {
  const state = window.__wrReplicaControlsState;
  if (state) {
    window.removeEventListener('resize', state.reposition);
    for (const saved of state.attributes) {
      for (const [name, present, value] of saved.values) {
        if (!present) saved.node.removeAttribute(name);
        else saved.node.setAttribute(name, value);
      }
    }
    // If WeRead replaced the original subtree, never put controls into a
    // detached parent or remove them with their floating wrapper.
    const parent = state.parent?.isConnected ? state.parent : document.body;
    if (parent) parent.insertBefore(state.controls, state.next?.parentNode === parent ? state.next : null);
    state.wrapper.remove();
    delete window.__wrReplicaControlsState;
  }
  return { shown: false };
}

export function startAutoScroll(speed) {
  if (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 1 || speed > 10) throw new Error('自动滚动速度必须为 1 至 10 的数字');
  const previous = window.__wrReplicaScrollState;
  if (previous) {
    previous.running = false;
    if (previous.id !== null) cancelAnimationFrame(previous.id);
  }
  const state = { running: true, id: null, lastTime: performance.now(), accumulated: 0 };
  window.__wrReplicaScrollState = state;
  const smoothScroll = (currentTime) => {
    if (!state.running || window.__wrReplicaScrollState !== state) return;
    const delta = Math.max(0, currentTime - state.lastTime);
    state.lastTime = currentTime;
    state.accumulated += speed * 0.12 * (delta > 100 ? 16.67 : delta) / 16.67;
    if (state.accumulated >= 1) {
      const movement = Math.floor(state.accumulated);
      window.scrollBy(0, movement);
      state.accumulated -= movement;
    }
    const container = document.scrollingElement || document.documentElement || document.body;
    const top = window.pageYOffset || container.scrollTop || 0;
    if (top + window.innerHeight >= container.scrollHeight - 2) {
      state.running = false;
      state.id = null;
      return;
    }
    state.id = requestAnimationFrame(smoothScroll);
  };
  state.id = requestAnimationFrame(smoothScroll);
  return { scrolling: true, speed };
}

export function stopAutoScroll() {
  const state = window.__wrReplicaScrollState;
  if (state) {
    state.running = false;
    if (state.id !== null) cancelAnimationFrame(state.id);
    delete window.__wrReplicaScrollState;
  }
  return { scrolling: false };
}

export function cleanupWeReadPage() {
  // Intentionally inline restoration: this export must serialize independently
  // without imports, host closures, or invoking another module export.
  const scroll = window.__wrReplicaScrollState;
  if (scroll) {
    scroll.running = false;
    if (scroll.id !== null) cancelAnimationFrame(scroll.id);
    delete window.__wrReplicaScrollState;
  }
  const state = window.__wrReplicaControlsState;
  if (state) {
    window.removeEventListener('resize', state.reposition);
    for (const saved of state.attributes) {
      for (const [name, present, value] of saved.values) {
        if (!present) saved.node.removeAttribute(name);
        else saved.node.setAttribute(name, value);
      }
    }
    const parent = state.parent?.isConnected ? state.parent : document.body;
    if (parent) parent.insertBefore(state.controls, state.next?.parentNode === parent ? state.next : null);
    state.wrapper.remove();
    delete window.__wrReplicaControlsState;
  }
  return { shown: false, scrolling: false };
}
