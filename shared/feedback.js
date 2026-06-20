/* Shared in-app feedback widget for the Wrath & Glory tools.
   Opens a modal, verifies the user via Cloudflare Turnstile, and POSTs to the
   feedback Worker, which creates a GitHub issue server-side.
   NO secret is present in this file — the GitHub token lives only in the Worker. */
(function () {
  'use strict';

  var WORKER_URL = 'https://wng-feedback.quadrakev.workers.dev/';
  var TURNSTILE_SITE_KEY = '0x4AAAAAADkJ0Wf2O6G7oo4y';

  var IMAGE_ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  var IMAGE_MAX_DIM = 1600;                  // longest edge after downscale
  var IMAGE_TARGET_BYTES = 3 * 1024 * 1024;  // aim to keep the upload under ~3 MB
  var IMAGE_MAX_SOURCE_BYTES = 25 * 1024 * 1024; // reject huge files before decoding

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
  var pendingImage = null; // { contentType, dataBase64 } once a screenshot is processed

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
      '<label class="fb-label">Screenshot (optional)' +
      '<input type="file" class="fb-file" id="fb-image-input" accept="image/png,image/jpeg,image/webp,image/gif"></label>' +
      '<div class="fb-preview hidden" id="fb-preview">' +
      '<img class="fb-preview-img" id="fb-preview-img" alt="Screenshot preview">' +
      '<button class="fb-preview-remove" type="button" id="fb-image-remove" aria-label="Remove screenshot">&times;</button>' +
      '</div>' +
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
    modal.querySelector('#fb-image-input').addEventListener('change', onImageChange);
    modal.querySelector('#fb-image-remove').addEventListener('click', clearImage);
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

  function clearImage() {
    pendingImage = null;
    var input = document.getElementById('fb-image-input');
    if (input) input.value = '';
    var img = document.getElementById('fb-preview-img');
    if (img) img.removeAttribute('src');
    var prev = document.getElementById('fb-preview');
    if (prev) prev.classList.add('hidden');
  }

  function supportsWebp() {
    try {
      return document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch (e) { return false; }
  }

  function onImageChange(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) { clearImage(); return; }
    if (IMAGE_ALLOWED.indexOf(file.type) === -1) {
      setMsg('Image must be PNG, JPEG, WebP, or GIF.', 'error');
      clearImage();
      return;
    }
    if (file.size > IMAGE_MAX_SOURCE_BYTES) {
      setMsg('That image is too large (max 25 MB).', 'error');
      clearImage();
      return;
    }
    var submitBtn = modal.querySelector('.fb-submit');
    if (submitBtn) submitBtn.disabled = true;
    setMsg('Processing image…', '');
    processImage(file).then(function (result) {
      pendingImage = result;
      var img = document.getElementById('fb-preview-img');
      var prev = document.getElementById('fb-preview');
      if (img) img.src = 'data:' + result.contentType + ';base64,' + result.dataBase64;
      if (prev) prev.classList.remove('hidden');
      setMsg('', '');
    }).catch(function () {
      setMsg('Could not process that image — please try another.', 'error');
      clearImage();
    }).finally(function () {
      if (submitBtn) submitBtn.disabled = false;
    });
  }

  // Downscale + re-encode in the browser so uploads stay small. Re-drawing to a
  // canvas also strips EXIF/metadata (a privacy bonus). Falls back to JPEG when
  // the browser can't encode WebP.
  function processImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        URL.revokeObjectURL(url);
        var w = image.naturalWidth, h = image.naturalHeight;
        if (!w || !h) { reject(new Error('bad image')); return; }
        var scale = Math.min(1, IMAGE_MAX_DIM / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        canvas.getContext('2d').drawImage(image, 0, 0, cw, ch);
        var type = supportsWebp() ? 'image/webp' : 'image/jpeg';
        var qualities = [0.85, 0.7, 0.55];
        var i = 0;
        (function tryEncode() {
          canvas.toBlob(function (blob) {
            if (!blob) { reject(new Error('encode failed')); return; }
            if (blob.size > IMAGE_TARGET_BYTES && i < qualities.length - 1) {
              i++;
              tryEncode();
              return;
            }
            var fr = new FileReader();
            fr.onload = function () {
              var s = fr.result || '';
              var comma = s.indexOf(',');
              resolve({ contentType: type, dataBase64: comma >= 0 ? s.slice(comma + 1) : s });
            };
            fr.onerror = function () { reject(new Error('read failed')); };
            fr.readAsDataURL(blob);
          }, type, qualities[i]);
        })();
      };
      image.onerror = function () { URL.revokeObjectURL(url); reject(new Error('load failed')); };
      image.src = url;
    });
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

    var payload = {
      type: type, title: title, details: details, turnstileToken: token,
      app: app, page: currentSection(), version: version, userAgent: navigator.userAgent
    };
    if (pendingImage) {
      payload.imageBase64 = pendingImage.dataBase64;
      payload.imageContentType = pendingImage.contentType;
    }

    fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok && res.j && res.j.ok) {
          setMsg('Thanks! Opened issue #' + res.j.number + '.', 'success');
          titleEl.value = '';
          detailsEl.value = '';
          clearImage();
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
