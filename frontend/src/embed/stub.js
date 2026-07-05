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
  .callsafe-button { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 50px; padding: 14px 24px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; outline: none; display: flex; align-items: center; gap: 8px; text-decoration: none; user-select: none; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); }
  .callsafe-button:focus { box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.3); }
  .callsafe-button:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5); }
  .callsafe-button:disabled { opacity: 0.6; cursor: not-allowed; transform: none !important; }
  .callsafe-button.size-small { padding: 8px 16px; font-size: 12px; }
  .callsafe-button.size-large { padding: 16px 28px; font-size: 16px; }
  .callsafe-icon { flex-shrink: 0; }
  .callsafe-text { white-space: nowrap; }
  @media (prefers-reduced-motion: reduce) { .callsafe-button { transition: none; } }
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
  widgetElement.className = `callsafe-widget theme-${config.theme} position-${config.position}`;

  const button = document.createElement('button');
  button.className = `callsafe-button size-${config.size}`;
  button.innerHTML = `${BUTTON_ICON}<span class="callsafe-text">${escapeHTML(config.buttonText)}</span>`;
  button.setAttribute('aria-label', config.buttonText);
  widgetElement.appendChild(button);

  if (config.position === 'inline' && script.parentNode) {
    script.parentNode.insertBefore(widgetElement, script.nextSibling);
  } else if (document.body) {
    document.body.appendChild(widgetElement);
  } else {
    setTimeout(() => document.body && document.body.appendChild(widgetElement), 100);
  }

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
