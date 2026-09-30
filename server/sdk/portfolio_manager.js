/**
 * Portfolio Manager SDK v2 (portfolio_manager.js)
 *
 *   <script src="https://admin.example.com/api/portfolio_manager.js" data-key="pk_..." async></script>
 *
 * `data-key` is your account's publishable API key (Integration page). It picks whose portfolio
 * is loaded and where form submissions and analytics go. Without it the server's default site is used.
 *
 * - Loads ALL portfolio content from the admin API in one request, including images
 *   (as base64 data URIs), and keeps it in sessionStorage. Every page load renders instantly
 *   from that cache AND asks the server whether the content changed (a few-byte
 *   "not_modified" reply when it didn't), so admin edits show up on the next normal refresh.
 * - Tracks page views, time on page and resume downloads (silently, never blocks the page).
 * - Handles contact forms  <form data-abishek-contact>  and testimonial forms
 *   <form data-abishek-testimonial>  (photos are downscaled and sent as a base64 string).
 *
 * API: window.PortfolioManager
 *   .ready                      Promise<data>   resolves with the first available data
 *   .data / .version            current data and content version
 *   .onData(cb)                 subscribe; called now (if loaded) and on every update. Returns unsubscribe.
 *   .getPortfolioData(cb?)      Promise<{status, data}> (legacy shape)
 *   .refresh()                  force a network reload
 *   .clearCache()
 *   .sendMessage(formOrObject)  Promise
 *   .submitTestimonial(formOrObjectOrFormData)  Promise
 *   .trackEvent(type, data), .trackResumeDownload(fileName)
 * Events: window 'portfolio:data' (detail: {data, version, source}), 'portfolio:error'.
 *
 * Script attributes: data-key="pk_..." (your API key)
 *                    data-api="https://admin.example.com"
 *                    data-cache-ttl="0" (seconds to trust the cache without asking the server;
 *                    default 0 = check on every page load)
 *                    data-track="false" (disable analytics)  data-inline-images="false"
 */
(function () {
  'use strict';
  if (window.PortfolioManager && window.PortfolioManager.__v === 2) return;

  var script = document.currentScript ||
    document.querySelector('script[src*="portfolio_manager.js"],script[src*="embed.js"],script[src*="tracker.js"]');
  var attr = function (name) { return script ? script.getAttribute(name) : null; };

  var BASE = (function () {
    var explicit = attr('data-api');
    if (explicit) return explicit.replace(/\/+$/, '');
    try {
      if (script && script.src) return new URL(script.src, location.href).origin;
    } catch (e) { /* ignore */ }
    return location.origin;
  })();

  // Sent as ?key= (not a header) so every request stays a "simple" CORS request and beacons work.
  var KEY = (attr('data-key') || attr('data-api-key') || '').trim();
  var withKey = function (url) {
    return KEY ? url + (url.indexOf('?') === -1 ? '?' : '&') + 'key=' + encodeURIComponent(KEY) : url;
  };
  var ENDPOINTS = {
    bundle: withKey(BASE + '/api/portfolio'),
    message: withKey(BASE + '/api/messages/send'),
    testimonial: withKey(BASE + '/api/testimonials/submit'),
    collect: withKey(attr('data-endpoint') || BASE + '/api/analytics/collect')
  };
  // One cache per key, so two portfolios on the same origin never mix their data.
  var CACHE_KEY = 'pm_portfolio_cache_v2' + (KEY ? '_' + KEY.slice(-12) : '');
  var SID_KEY = 'pm_sid';
  // Default 0: revalidate on every page load so admin edits appear on a normal refresh.
  var TTL_MS = Math.max(0, Number(attr('data-cache-ttl')) || 0) * 1000;
  var TRACK = attr('data-track') !== 'false';
  var INLINE = attr('data-inline-images') !== 'false';

  // ------------------------------------------------------------------ storage helpers

  function ssGet(key) {
    try { return window.sessionStorage.getItem(key); } catch (e) { return null; }
  }
  function ssSet(key, value) {
    try { window.sessionStorage.setItem(key, value); return true; } catch (e) { return false; }
  }
  function ssRemove(key) {
    try { window.sessionStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  function randomId() {
    if (window.crypto && crypto.getRandomValues) {
      var a = new Uint8Array(12);
      crypto.getRandomValues(a);
      return 'sid_' + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    }
    return 'sid_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  var sessionId = ssGet(SID_KEY) || ssGet('ab_portfolio_sid');
  if (!sessionId) {
    sessionId = randomId();
    ssSet(SID_KEY, sessionId);
  }

  // ------------------------------------------------------------------ data loading

  var state = { data: null, version: null, source: null, fetchedAt: 0 };
  var listeners = [];

  function readCache() {
    var raw = ssGet(CACHE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { ssRemove(CACHE_KEY); return null; }
  }

  function writeCache(bundle) {
    bundle.fetched_at = Date.now();
    if (ssSet(CACHE_KEY, JSON.stringify(bundle))) return;
    // Quota exceeded: keep the text content, let images load from their URLs (HTTP-cached).
    ssRemove(CACHE_KEY);
    ssSet(CACHE_KEY, JSON.stringify({ version: bundle.version, data: bundle.data, media: null, fetched_at: bundle.fetched_at, lite: true }));
  }

  /** Swap media URLs for inline data URIs. */
  function hydrate(node, media) {
    if (!media) return node;
    if (typeof node === 'string') return media[node] || node;
    if (Array.isArray(node)) return node.map(function (n) { return hydrate(n, media); });
    if (node && typeof node === 'object') {
      var out = {};
      for (var k in node) if (Object.prototype.hasOwnProperty.call(node, k)) out[k] = hydrate(node[k], media);
      return out;
    }
    return node;
  }

  function publish(bundle, source) {
    state.data = hydrate(bundle.data, bundle.media);
    state.version = bundle.version;
    state.source = source;
    state.fetchedAt = bundle.fetched_at || Date.now();
    api.data = state.data;
    api.version = state.version;
    applySeo(state.data);
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](state.data, { version: state.version, source: source }); } catch (e) { console.error('[PortfolioManager] listener error', e); }
    }
    try {
      window.dispatchEvent(new CustomEvent('portfolio:data', { detail: { data: state.data, version: state.version, source: source } }));
    } catch (e) { /* old browsers */ }
  }

  function applySeo(data) {
    if (!data || !data.seo || script && script.getAttribute('data-seo') === 'false') return;
    var seo = data.seo;
    if (seo.site_title) document.title = seo.site_title;
    var setMeta = function (name, content, prop) {
      if (!content) return;
      var sel = prop ? 'meta[property="' + name + '"]' : 'meta[name="' + name + '"]';
      var el = document.head.querySelector(sel);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(prop ? 'property' : 'name', name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    setMeta('description', seo.description);
    setMeta('keywords', seo.keywords);
    setMeta('author', seo.author);
    setMeta('theme-color', seo.theme_color);
    setMeta('og:title', seo.site_title, true);
    setMeta('og:description', seo.description, true);
    if (seo.og_image_url && seo.og_image_url.indexOf('data:') !== 0) setMeta('og:image', seo.og_image_url, true);
  }

  var inflight = null;

  function load(force) {
    var cached = readCache();
    if (cached && cached.data && !state.data) publish(cached, 'cache');
    if (!force && cached && cached.fetched_at && Date.now() - cached.fetched_at < TTL_MS) {
      return Promise.resolve(state.data);
    }
    if (inflight) return inflight;

    var url = ENDPOINTS.bundle + (ENDPOINTS.bundle.indexOf('?') === -1 ? '?' : '&') + 'inline=' + (INLINE ? '1' : '0');
    if (cached && cached.version && !force && !cached.lite) url += '&since=' + encodeURIComponent(cached.version);

    inflight = fetch(url, { method: 'GET', credentials: 'omit', headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' while loading portfolio data');
        return res.json();
      })
      .then(function (res) {
        if (res.status === 'not_modified' && cached) {
          cached.fetched_at = Date.now();
          ssSet(CACHE_KEY, JSON.stringify(cached));
          if (!state.data) publish(cached, 'cache');
          return state.data;
        }
        var bundle = { version: res.version, data: res.data, media: res.media || null, generated_at: res.generated_at };
        writeCache(bundle);
        if (!cached || cached.version !== bundle.version || !state.data) publish(bundle, 'network');
        return state.data;
      })
      .catch(function (err) {
        try { window.dispatchEvent(new CustomEvent('portfolio:error', { detail: { error: err } })); } catch (e) { /* ignore */ }
        if (state.data) return state.data;
        throw err;
      })
      .then(function (data) { inflight = null; return data; }, function (err) { inflight = null; throw err; });
    return inflight;
  }

  // ------------------------------------------------------------------ analytics

  function deviceType() {
    var ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return 'tablet';
    if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Opera M(obi|ini)/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  function sendEvent(type, extra, beacon) {
    if (!TRACK) return;
    var body = JSON.stringify({
      session_id: sessionId,
      event_type: type,
      path: location.pathname + (location.hash && type === 'section_view' ? location.hash : ''),
      referrer: document.referrer || '',
      title: document.title || '',
      device_type: deviceType(),
      screen: window.screen ? screen.width + 'x' + screen.height : '',
      extra_data: extra || {}
    });
    // text/plain keeps this a "simple" CORS request (no preflight) and works with sendBeacon.
    if (beacon && navigator.sendBeacon) {
      try {
        if (navigator.sendBeacon(ENDPOINTS.collect, new Blob([body], { type: 'text/plain' }))) return;
      } catch (e) { /* fall through */ }
    }
    try {
      fetch(ENDPOINTS.collect, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body, keepalive: true, credentials: 'omit' })
        .catch(function () { /* never interfere with the page */ });
    } catch (e) { /* ignore */ }
  }

  var active = 0;
  var since = Date.now();
  var visible = !document.hidden;
  function tick() {
    if (visible) {
      var now = Date.now();
      active += Math.floor((now - since) / 1000);
      since = now - ((now - since) % 1000);
    }
  }

  if (TRACK) {
    sendEvent('pageview', { url: location.href });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        tick();
        visible = false;
        sendEvent('time_spent', { duration_seconds: active }, true);
      } else {
        since = Date.now();
        visible = true;
      }
    });
    window.addEventListener('pagehide', function () {
      tick();
      sendEvent('time_spent', { duration_seconds: active, exit: true }, true);
    });
    setInterval(function () {
      tick();
      if (active > 0 && visible) sendEvent('time_spent', { duration_seconds: active });
    }, 20000);

    document.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('a,button') : null;
      if (!el) return;
      var href = (el.getAttribute('href') || '').toLowerCase();
      var marker = ((el.getAttribute('data-track') || '') + ' ' + (el.getAttribute('data-analytics') || '')).toLowerCase();
      var text = (el.textContent || '').trim().toLowerCase();
      var isResume = marker.indexOf('resume') !== -1 || href.indexOf('resume') !== -1 || /\.pdf($|\?)/.test(href) ||
        (el.getAttribute('download') || '').toLowerCase().indexOf('resume') !== -1 || text.indexOf('download cv') !== -1;
      if (isResume) {
        sendEvent('resume_download', { file_name: href.split('/').pop() || 'resume.pdf', link_text: text.slice(0, 80) });
      } else if (el.tagName === 'A' && /^https?:/i.test(href) && href.indexOf(location.host) === -1) {
        sendEvent('outbound_click', { url: href.slice(0, 300) });
      }
    }, true);
  }

  // ------------------------------------------------------------------ submissions

  function postJson(url, payload) {
    return fetch(url, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.message || 'Request failed (' + res.status + ')');
          err.status = res.status;
          err.code = data.code;
          err.errors = data.errors;
          err.retryAfter = data.retry_after;
          throw err;
        }
        return data;
      });
    });
  }

  function formToObject(form) {
    var out = {};
    var fd = new FormData(form);
    fd.forEach(function (value, key) {
      if (typeof value === 'string') out[key] = value;
    });
    return out;
  }

  /** Downscale an image File in the browser and return a base64 data URI (the "binary string"). */
  function fileToDataUri(file, maxSide) {
    maxSide = maxSide || 512;
    return new Promise(function (resolve, reject) {
      if (!file || !file.size) return resolve(null);
      if (!/^image\//.test(file.type)) return reject(new Error('Please choose an image file (JPG, PNG or WebP).'));
      if (file.size > 15 * 1024 * 1024) return reject(new Error('Image is too large (max 15 MB).'));
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read the image file.')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('Could not read the image file.')); };
        img.onload = function () {
          var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          var uri = canvas.toDataURL('image/webp', 0.85);
          if (uri.indexOf('data:image/webp') !== 0) uri = canvas.toDataURL('image/jpeg', 0.85);
          resolve(uri);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function sendMessage(input, cb) {
    var payload = input instanceof HTMLFormElement ? formToObject(input) : Object.assign({}, input || {});
    payload.session_id = sessionId;
    var p = postJson(ENDPOINTS.message, payload);
    return withCallback(p, cb);
  }

  function submitTestimonial(input, cb) {
    var photoFile = null;
    var payload;
    if (input instanceof HTMLFormElement) {
      payload = formToObject(input);
      var fileInput = input.querySelector('input[type="file"][name="photo"]');
      photoFile = fileInput && fileInput.files && fileInput.files[0];
    } else if (typeof FormData !== 'undefined' && input instanceof FormData) {
      payload = {};
      input.forEach(function (value, key) {
        if (typeof value === 'string') payload[key] = value;
        else if (key === 'photo') photoFile = value;
      });
    } else {
      payload = Object.assign({}, input || {});
      if (payload.photo && typeof payload.photo !== 'string') {
        photoFile = payload.photo;
        delete payload.photo;
      }
    }
    payload.session_id = sessionId;
    var p = fileToDataUri(photoFile, 512).then(function (uri) {
      if (uri) payload.photo = uri;
      return postJson(ENDPOINTS.testimonial, payload);
    });
    return withCallback(p, cb);
  }

  function withCallback(promise, cb) {
    if (typeof cb === 'function') promise.then(function (d) { cb(null, d); }, function (e) { cb(e, null); });
    return promise;
  }

  // Automatic form handling ----------------------------------------------------------

  function showResult(form, selector, ok, text) {
    var box = form.querySelector(selector) || form.querySelector('.form-response');
    if (box) {
      box.className = box.className.replace(/\s*(alert-success|alert-danger|is-success|is-error)/g, '') + (ok ? ' alert-success is-success' : ' alert-danger is-error');
      box.textContent = text;
      box.style.display = 'block';
      box.setAttribute('role', ok ? 'status' : 'alert');
    } else {
      window.alert(text);
    }
    try {
      form.dispatchEvent(new CustomEvent(ok ? 'portfolio:submitted' : 'portfolio:failed', { bubbles: true, detail: { message: text } }));
    } catch (e) { /* ignore */ }
  }

  function wireForm(selector, responseSelector, action, busyText) {
    document.addEventListener('submit', function (e) {
      var form = e.target && e.target.closest ? e.target.closest(selector) : null;
      if (!form) return;
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"],input[type="submit"]');
      var original = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.innerHTML = busyText; }
      action(form)
        .then(function (res) {
          showResult(form, responseSelector, true, res.message || 'Thank you!');
          form.reset();
        })
        .catch(function (err) {
          showResult(form, responseSelector, false, err.message || 'Something went wrong. Please try again.');
        })
        .then(function () {
          if (btn) { btn.disabled = false; btn.innerHTML = original; }
        });
    });
  }

  wireForm('form[data-abishek-contact],form#contact-form,form.abishek-contact-form', '.contact-response', sendMessage, 'Sending…');
  wireForm('form[data-abishek-testimonial],form#testimonial-form,form.abishek-testimonial-form', '.testimonial-response', submitTestimonial, 'Submitting…');

  // ------------------------------------------------------------------ public API

  var api = {
    __v: 2,
    baseUrl: BASE,
    sessionId: sessionId,
    data: null,
    version: null,
    ready: null,
    onData: function (cb) {
      listeners.push(cb);
      if (state.data) {
        try { cb(state.data, { version: state.version, source: state.source }); } catch (e) { console.error(e); }
      }
      return function () { listeners = listeners.filter(function (x) { return x !== cb; }); };
    },
    getPortfolioData: function (cb) {
      var p = (state.data ? Promise.resolve(state.data) : api.ready).then(function (data) {
        return { status: 'success', version: state.version, data: data };
      });
      return withCallback(p, cb);
    },
    refresh: function () { return load(true); },
    clearCache: function () { ssRemove(CACHE_KEY); },
    sendMessage: sendMessage,
    submitTestimonial: submitTestimonial,
    fileToDataUri: fileToDataUri,
    trackEvent: function (type, data) { sendEvent(type || 'custom', data); },
    trackResumeDownload: function (fileName, extra) {
      var d = extra || {};
      d.file_name = fileName || 'resume.pdf';
      sendEvent('resume_download', d);
    }
  };

  api.ready = load(false);
  api.ready.catch(function (err) { console.warn('[PortfolioManager] could not load portfolio data:', err.message); });

  window.PortfolioManager = api;
  window.Abishek = window.AbishekPortfolio = window.AbishekEmbed = window.AbishekTracker = api;
  window.sendMessage = function (d, cb) { return api.sendMessage(d, cb); };
  window.submitTestimonial = function (d, cb) { return api.submitTestimonial(d, cb); };
  window.getPortfolioData = function (cb) { return api.getPortfolioData(cb); };

  try { window.dispatchEvent(new CustomEvent('portfolio:sdk-ready', { detail: { api: api } })); } catch (e) { /* ignore */ }
})();
