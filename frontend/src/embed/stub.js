// @ts-nocheck
/**
 * CallSafe Embed Widget — Loader Stub
 *
 * The tiny script sites embed via <script src="…/embed.js" data-handle="…">.
 * It renders only the call button and its styles, then lazy-loads the heavy
 * calling core (embed.core.js) on first hover / focus / click. Visitors who
 * never interact with the button never download the core.
 *
 * Build: npm run build:embed  →  static/embed.js
 */

'use strict';

function validateHandle(handle) {
  return /^[a-f0-9]{16}$/.test(handle);
}

function validateSourceId(sourceId) {
  return /^[a-zA-Z0-9-_]{1,50}$/.test(sourceId);
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function checkBrowserSupport() {
  return !!(
    window.RTCPeerConnection &&
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    window.WebSocket &&
    window.Promise
  );
}

// Locate our own <script> tag. Sites inject embed.js asynchronously (append to
// document.body after window.load), so document.currentScript is unreliable —
// fall back to matching the src. embed.core.js is injected later and does not
// match "embed.js", so it can't be picked up by mistake.
function findScript() {
  const current = document.currentScript;
  if (current && /embed\.js(\?|$)/.test(current.src)) return current;
  const scripts = document.querySelectorAll('script[src*="embed.js"]');
  return scripts[scripts.length - 1] || null;
}

// Core lives in the same directory as the stub; preserve any ?query cache-buster.
function coreUrlFrom(scriptSrc) {
  return scriptSrc.replace(/embed\.js(\?[^#]*)?(#.*)?$/, 'embed.core.js$1');
}

const BUTTON_ICON =
  '<svg class="callsafe-icon" viewBox="0 0 24 24" width="18" height="18">' +
  '<path fill="currentColor" d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>' +
  '</svg>';

// Button + container styles only. The modal / call-control styles ship with the
// core and are injected when it loads.
const BUTTON_CSS = `
  .callsafe-widget { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; z-index: 999999; position: relative; }
  .callsafe-widget.position-inline { display: inline-block; }
  .callsafe-widget.position-bottom-right { position: fixed; bottom: 20px; right: 20px; }
  .callsafe-widget.position-bottom-left { position: fixed; bottom: 20px; left: 20px; }
  .callsafe-widget.position-top-right { position: fixed; top: 20px; right: 20px; }
  .callsafe-widget.position-top-left { position: fixed; top: 20px; left: 20px; }
  .callsafe-button { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 50px; padding: 14px 24px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; outline: none; display: flex; align-items: center; gap: 8px; text-decoration: none; user-select: none; -webkit-touch-callout: none; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); }
  .callsafe-button:focus { box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.3); }
  .callsafe-button:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5); }
  .callsafe-button:disabled { opacity: 0.6; cursor: not-allowed; transform: none !important; }
  .callsafe-button.size-small { padding: 8px 16px; font-size: 12px; }
  .callsafe-button.size-large { padding: 16px 28px; font-size: 16px; }
  .callsafe-icon { flex-shrink: 0; }
  .callsafe-text { white-space: nowrap; }
  @media (prefers-reduced-motion: reduce) { .callsafe-button { transition: none; } }

  /* Drag-to-move (fixed positions only). touch-action:none keeps a long-press
     drag from being stolen by the page's scroll gesture. */
  .callsafe-draggable .callsafe-button { touch-action: none; }
  .callsafe-widget.callsafe-dragging { transition: none; }
  .callsafe-widget.callsafe-dragging .callsafe-button { transform: scale(1.06); cursor: grabbing; box-shadow: 0 10px 28px rgba(102, 126, 234, 0.55); transition: none; }
`;

function renderUnsupported(scriptElement, position) {
  const message = document.createElement('div');
  message.style.cssText =
    'background:#f8d7da;color:#721c24;border:1px solid #f5c6cb;border-radius:4px;padding:12px;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;margin:10px 0;';
  message.textContent = 'Your browser does not support calling features. Please use a modern browser.';
  if (position === 'inline' && scriptElement && scriptElement.parentNode) {
    scriptElement.parentNode.insertBefore(message, scriptElement.nextSibling);
  } else if (document.body) {
    document.body.appendChild(message);
  }
}

function initStub() {
  const script = findScript();
  if (!script) {
    console.error('CallSafe: Unable to locate script element');
    return;
  }

  const config = {
    handle: script.getAttribute('data-handle'),
    sourceId: script.getAttribute('data-source-id') || 'website',
    buttonText: script.getAttribute('data-button-text') || 'Talk to us instantly',
    position: script.getAttribute('data-position') || 'bottom-right',
    theme: script.getAttribute('data-theme') || 'light',
    language: script.getAttribute('data-language') || 'en',
    size: script.getAttribute('data-size') || 'medium',
    offlineMessage: script.getAttribute('data-offline-message') || 'No agents available right now.',
    debug: script.getAttribute('data-debug') === 'true'
  };

  if (!config.handle) {
    console.error('CallSafe: data-handle attribute is required');
    return;
  }
  if (!validateHandle(config.handle)) {
    console.error('CallSafe: Invalid handle format');
    return;
  }
  if (!validateSourceId(config.sourceId)) {
    console.error('CallSafe: Invalid source ID format');
    return;
  }

  // Whitelist enum-ish attributes so a misconfigured tag can't inject arbitrary
  // class tokens into the widget/button className.
  const POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'inline'];
  const SIZES = ['small', 'medium', 'large'];
  const THEMES = ['light', 'dark'];
  if (!POSITIONS.includes(config.position)) config.position = 'bottom-right';
  if (!SIZES.includes(config.size)) config.size = 'medium';
  if (!THEMES.includes(config.theme)) config.theme = 'light';

  if (!checkBrowserSupport()) {
    renderUnsupported(script, config.position);
    return;
  }

  // Inject button-only styles once.
  if (!document.getElementById('callsafe-stub-styles')) {
    const style = document.createElement('style');
    style.id = 'callsafe-stub-styles';
    style.textContent = BUTTON_CSS;
    document.head.appendChild(style);
  }

  // Build widget container + button.
  const widgetElement = document.createElement('div');
  const draggable = config.position !== 'inline';
  widgetElement.className =
    `callsafe-widget theme-${config.theme} position-${config.position}` +
    (draggable ? ' callsafe-draggable' : '');

  const button = document.createElement('button');
  button.className = `callsafe-button size-${config.size}`;
  button.innerHTML = `${BUTTON_ICON}<span class="callsafe-text">${escapeHTML(config.buttonText)}</span>`;
  button.setAttribute('aria-label', config.buttonText);
  widgetElement.appendChild(button);

  // ---- Drag to move: long-press, then drag ---------------------------------
  // Fixed-position widgets only — an inline widget sits in the page's flow and
  // has no anchoring to override.

  const LONG_PRESS_MS = 400;
  const MOVE_CANCEL_PX = 8; // movement before the lift = a scroll or sloppy click
  const EDGE_MARGIN = 8;
  const POSITION_KEY = `callsafe:widget-position:${config.handle}`;

  let suppressNextClick = false;
  let hasCustomPosition = false;

  function clampToViewport(left, top) {
    const rect = widgetElement.getBoundingClientRect();
    const maxLeft = Math.max(EDGE_MARGIN, window.innerWidth - rect.width - EDGE_MARGIN);
    const maxTop = Math.max(EDGE_MARGIN, window.innerHeight - rect.height - EDGE_MARGIN);
    return {
      left: Math.min(Math.max(left, EDGE_MARGIN), maxLeft),
      top: Math.min(Math.max(top, EDGE_MARGIN), maxTop)
    };
  }

  // Inline left/top override the position-* class's bottom/right anchoring.
  function applyPosition(left, top) {
    widgetElement.style.left = `${left}px`;
    widgetElement.style.top = `${top}px`;
    widgetElement.style.right = 'auto';
    widgetElement.style.bottom = 'auto';
    hasCustomPosition = true;
  }

  function savePosition() {
    try {
      const rect = widgetElement.getBoundingClientRect();
      localStorage.setItem(POSITION_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
    } catch {
      // Storage blocked (private mode, sandboxed iframe). The move still holds
      // for this page view, it just won't survive a reload.
    }
  }

  function restorePosition() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(POSITION_KEY));
    } catch {
      return;
    }
    if (!saved || !isFinite(saved.left) || !isFinite(saved.top)) return;
    const p = clampToViewport(saved.left, saved.top);
    applyPosition(p.left, p.top);
  }

  function enableDrag() {
    restorePosition();

    let pressTimer = null;
    let dragging = false;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;

    button.addEventListener('pointerdown', (e) => {
      if (e.isPrimary === false || (e.pointerType === 'mouse' && e.button !== 0)) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      pressTimer = setTimeout(() => {
        pressTimer = null;
        const rect = widgetElement.getBoundingClientRect();
        originLeft = rect.left;
        originTop = rect.top;
        dragging = true;
        // A lift is never a click, even if the pointer never moves.
        suppressNextClick = true;
        widgetElement.classList.add('callsafe-dragging');
        try { button.setPointerCapture(pointerId); } catch { /* capture unsupported */ }
        if (navigator.vibrate) navigator.vibrate(10);
      }, LONG_PRESS_MS);
    });

    button.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (pressTimer) {
        if (Math.abs(dx) > MOVE_CANCEL_PX || Math.abs(dy) > MOVE_CANCEL_PX) {
          clearTimeout(pressTimer);
          pressTimer = null;
          pointerId = null;
        }
        return;
      }
      if (!dragging) return;

      e.preventDefault();
      const p = clampToViewport(originLeft + dx, originTop + dy);
      applyPosition(p.left, p.top);
    });

    function endDrag(e) {
      if (pointerId !== null && e.pointerId !== pointerId) return;
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
      if (dragging) {
        dragging = false;
        widgetElement.classList.remove('callsafe-dragging');
        try { button.releasePointerCapture(pointerId); } catch { /* already released */ }
        savePosition();
      }
      pointerId = null;
    }

    button.addEventListener('pointerup', endDrag);
    button.addEventListener('pointercancel', endDrag);

    // The lift replaces the platform long-press menu.
    button.addEventListener('contextmenu', (e) => {
      if (dragging) e.preventDefault();
    });

    // A dropped widget must stay on screen when the viewport changes.
    window.addEventListener('resize', () => {
      if (!hasCustomPosition) return;
      const rect = widgetElement.getBoundingClientRect();
      const p = clampToViewport(rect.left, rect.top);
      applyPosition(p.left, p.top);
    });
  }

  function mount() {
    if (config.position === 'inline' && script.parentNode) {
      script.parentNode.insertBefore(widgetElement, script.nextSibling);
    } else if (document.body) {
      document.body.appendChild(widgetElement);
    } else {
      setTimeout(mount, 100);
      return;
    }
    // Position restore measures the element, so it has to run once mounted.
    if (draggable) enableDrag();
  }

  mount();

  // ---- Lazy-load the calling core on demand (singleton) --------------------

  const coreUrl = coreUrlFrom(script.src);
  let corePromise = null;
  let widget = null;

  function ensureCore() {
    if (corePromise) return corePromise;
    corePromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = coreUrl;
      s.async = true;
      s.onload = () => {
        if (typeof window.__CallSafeCore === 'function') {
          try {
            widget = window.__CallSafeCore({ config, widgetElement, scriptElement: script });
            resolve(widget);
          } catch (err) {
            reject(err);
          }
        } else {
          reject(new Error('CallSafe: core loaded but factory is missing'));
        }
      };
      s.onerror = () => reject(new Error('CallSafe: failed to load calling core'));
      document.head.appendChild(s);
    });
    return corePromise;
  }

  // Prefetch on intent so the first real click feels instant, without pulling
  // the core for visitors who never engage.
  const prefetch = () => {
    ensureCore().catch(() => {});
  };
  button.addEventListener('mouseenter', prefetch, { once: true });
  button.addEventListener('focus', prefetch, { once: true });

  const textEl = button.querySelector('.callsafe-text');
  button.addEventListener('click', () => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if (widget) {
      widget.handleButtonClick();
      return;
    }
    const original = textEl ? textEl.textContent : '';
    if (textEl) textEl.textContent = 'Loading…';
    button.disabled = true;
    ensureCore()
      .then((w) => {
        if (textEl) textEl.textContent = original;
        button.disabled = false;
        w.handleButtonClick();
      })
      .catch((err) => {
        console.error(err);
        if (textEl) textEl.textContent = original;
        button.disabled = false;
      });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStub);
} else {
  initStub();
}
