/* Shared in-app feedback widget for the Wrath & Glory tools.
   Opens a modal, verifies the user via Cloudflare Turnstile, and POSTs to the
   feedback Worker, which creates a GitHub issue server-side.
   NO secret is present in this file — the GitHub token lives only in the Worker. */
(function () {
  'use strict';

  var WORKER_URL = 'https://wng-feedback.quadrakev.workers.dev/';
  var TURNSTILE_SITE_KEY = '0x4AAAAAADkJ0Wf2O6G7oo4y';

  var app = location.pathname.indexOf('/bestiary/') !== -1 ? 'bestiary' : 'creator';

  // Best-effort deploy version, read from this script's own ?v= query param.
  var version = '';
  try {
    var s = (document.currentScript && document.currentScript.src) || '';
    if (s) version = new URL(s).searchParams.get('v') || '';
  } catch (e) { /* ignore */ }

  var modal = null;
  var widgetId = null;
  var turnstileReady = false;

  function currentSection() {
    var active = document.querySelector('.tab-btn.active');
    var label = active ? active.textContent.trim() : '';
    var hash = location.hash || '';
    return (label + ' ' + hash).trim();
  }

  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html;
    return d.firstElementChild;
  }

  function buildModal() {
    modal = el(
      '<div class="fb-overlay hidden">' +
      '<div class="fb-modal" role="dialog" aria-modal="true" aria-labelledby="fb-title">' +
      '<div class="fb-header"><h2 id="fb-title">Report Feedback</h2>' +
      '<button class="fb-close" type="button" aria-label="Close">&times;</button></div>' +
      '<div class="fb-body">' +
      '<div class="fb-types">' +
      '<label><input type="radio" name="fb-type" value="bug" checked> Bug</label>' +
      '<label><input type="radio" name="fb-type" value="feature"> Feature request</label>' +
      '</div>' +
      '<label class="fb-label">Title' +
      '<input type="text" class="fb-input" id="fb-title-input" maxlength="150" placeholder="Brief summary"></label>' +
      '<label class="fb-label">Details' +
      '<textarea class="fb-input" id="fb-details-input" rows="5" maxlength="5000" placeholder="What happened, or what you would like to see"></textarea></label>' +
      '<div id="fb-turnstile" class="fb-turnstile"></div>' +
      '<div class="fb-msg" id="fb-msg" role="status"></div>' +
      '</div>' +
      '<div class="fb-footer">' +
      '<button class="fb-btn fb-cancel" type="button">Cancel</button>' +
      '<button class="fb-btn fb-submit" type="button">Submit</button>' +
      '</div></div></div>'
    );
    document.body.appendChild(modal);
    modal.querySelector('.fb-close').addEventListener('click', close);
    modal.querySelector('.fb-cancel').addEventListener('click', close);
    modal.querySelector('.fb-submit').addEventListener('click', submit);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) close();
    });
  }

  // Turnstile loads async; render lazily once it (and the modal) are ready.
  function ensureTurnstile() {
    if (turnstileReady) {
      if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
      return;
    }
    if (window.turnstile && document.getElementById('fb-turnstile')) {
      widgetId = window.turnstile.render('#fb-turnstile', { sitekey: TURNSTILE_SITE_KEY });
      turnstileReady = true;
    } else {
      setTimeout(ensureTurnstile, 300);
    }
  }

  function setMsg(text, kind) {
    var m = document.getElementById('fb-msg');
    if (!m) return;
    m.textContent = text || '';
    m.className = 'fb-msg' + (kind ? ' fb-' + kind : '');
  }

  function open() {
    if (!modal) buildModal();
    modal.classList.remove('hidden');
    setMsg('', '');
    ensureTurnstile();
    setTimeout(function () {
      var t = document.getElementById('fb-title-input');
      if (t) t.focus();
    }, 50);
  }

  function close() {
    if (modal) modal.classList.add('hidden');
  }

  function submit() {
    var titleEl = document.getElementById('fb-title-input');
    var detailsEl = document.getElementById('fb-details-input');
    var checked = modal.querySelector('input[name="fb-type"]:checked');
    var title = (titleEl.value || '').trim();
    var details = (detailsEl.value || '').trim();
    var type = checked ? checked.value : 'bug';

    if (!title) { setMsg('Please enter a title.', 'error'); titleEl.focus(); return; }

    var token = (window.turnstile && widgetId !== null) ? window.turnstile.getResponse(widgetId) : '';
    if (!token) { setMsg('Please complete the spam check.', 'error'); return; }

    var btn = modal.querySelector('.fb-submit');
    btn.disabled = true;
    setMsg('Submitting…', '');

    fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: type, title: title, details: details, turnstileToken: token,
        app: app, page: currentSection(), version: version, userAgent: navigator.userAgent
      })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok && res.j && res.j.ok) {
          setMsg('Thanks! Opened issue #' + res.j.number + '.', 'success');
          titleEl.value = '';
          detailsEl.value = '';
          if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
        } else {
          setMsg('Could not submit: ' + ((res.j && res.j.error) || 'unknown error') + '.', 'error');
          if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
        }
      })
      .catch(function () {
        setMsg('Network error — please try again.', 'error');
        if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
      })
      .finally(function () { btn.disabled = false; });
  }

  function init() {
    var btns = document.querySelectorAll('#btn-feedback, .btn-feedback');
    Array.prototype.forEach.call(btns, function (b) {
      b.addEventListener('click', open);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
