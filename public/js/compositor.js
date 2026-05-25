/**
 * WiseProjection — Moteur de Compositing 4 Couches
 * Wise Design © 2025
 *
 * Layer 1 : Background (video, image, couleur, WebRTC)
 * Layer 2 : Watermark Logo (surimpression permanente)
 * Layer 3 : Textes & Typographies (versets, lyrics, annonces)
 * Layer 4 : Overlays (alertes, bandeaux, LT, QR codes)
 */

'use strict';

const WPCompositor = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  //  CONSTANTES
  // ══════════════════════════════════════════════════════════════════════════

  const TRANSITIONS = {
    fade     : _transFade,
    slide_up : _transSlideUp,
    slide_dn : _transSlideDown,
    zoom     : _transZoom,
    blur     : _transBlur,
    wipe     : _transWipe,
    none     : _transNone,
  };

  const DEFAULT_STYLE = {
    fontFamily    : "'Inter', 'Noto Sans', sans-serif",
    fontSize      : '6vw',
    fontWeight    : '700',
    color         : '#ffffff',
    textShadow    : '0 3px 30px rgba(0,0,0,.95)',
    lineHeight    : '1.3',
    textAlign     : 'center',
    position      : 'bottom',       // 'top' | 'center' | 'bottom'
    transition    : 'fade',
    overlayOpacity: 55,
    subFontSize   : '2.6vw',
    subColor      : 'rgba(255,255,255,.8)',
    refFontSize   : '2vw',
  };

  let _root   = null;
  let _config = Object.assign({}, DEFAULT_STYLE);
  let _state  = {
    bgMode   : 'black',
    bgUrl    : '',
    bgColor  : '#000000',
    bgStream : null,
    mainText : '',
    subText  : '',
    refText  : '',
    logoUrl  : '',
    logoPos  : 'top-right',
    logoOpacity: 0.5,
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  INITIALISATION
  // ══════════════════════════════════════════════════════════════════════════

  function init(rootEl, config = {}) {
    _root   = typeof rootEl === 'string' ? document.getElementById(rootEl) : rootEl;
    _config = Object.assign({}, DEFAULT_STYLE, config);
    _buildDOM();
    _applyBaseCSS();
    return this;
  }

  function _buildDOM() {
    _root.style.cssText = `
      position:fixed;inset:0;width:100%;height:100%;
      background:#000;overflow:hidden;cursor:none;
      font-family:${_config.fontFamily};
    `;
    _root.innerHTML = `
      <!-- Layer 1: Background -->
      <div id="wp-l1" style="position:absolute;inset:0;z-index:0;background:#000;">
        <img  id="wp-bg-img" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;display:none;will-change:transform;" alt=""/>
        <video id="wp-bg-vid" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;display:none;will-change:transform;" autoplay loop muted playsinline></video>
        <video id="wp-bg-rtc" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;display:none;will-change:transform;" autoplay playsinline muted></video>
      </div>

      <!-- Overlay assombri -->
      <div id="wp-overlay" style="position:absolute;inset:0;z-index:1;background:rgba(0,0,0,.55);pointer-events:none;"></div>

      <!-- Layer 2: Watermark Logo -->
      <div id="wp-l2" style="position:absolute;z-index:2;pointer-events:none;">
        <img id="wp-logo" src="" style="height:54px;opacity:.55;display:none;filter:drop-shadow(0 2px 8px rgba(0,0,0,.6));" alt="logo"/>
      </div>

      <!-- Layer 3: Textes -->
      <div id="wp-l3" style="position:absolute;z-index:3;width:92%;left:4%;pointer-events:none;transition:all .3s ease;">
        <div id="wp-main" style="will-change:opacity,transform;"></div>
        <div id="wp-sub"  style="margin-top:.6vw;will-change:opacity,transform;"></div>
        <div id="wp-ref"  style="margin-top:.4vw;will-change:opacity,transform;"></div>
      </div>

      <!-- Layer 4: Overlays -->
      <div id="wp-l4" style="position:absolute;inset:0;z-index:4;pointer-events:none;">
        <!-- Lower Third -->
        <div id="wp-lt" style="position:absolute;bottom:0;left:0;right:0;display:none;"></div>
        <!-- Tag / Toast -->
        <div id="wp-tag" style="position:absolute;top:4vh;left:50%;transform:translateX(-50%);display:none;
          background:rgba(79,127,255,.9);color:#fff;padding:8px 24px;border-radius:30px;
          font-size:1.6vw;font-weight:600;backdrop-filter:blur(8px);
          box-shadow:0 4px 24px rgba(0,0,0,.4);white-space:nowrap;"></div>
        <!-- Alert Crèche -->
        <div id="wp-alert" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
          display:none;background:rgba(220,38,38,.95);color:#fff;padding:24px 40px;border-radius:16px;
          font-size:2.5vw;font-weight:700;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,.6);"></div>
        <!-- Bandeau déroulant -->
        <div id="wp-ticker" style="position:absolute;bottom:0;left:0;right:0;
          background:rgba(15,23,42,.88);color:#fbbf24;font-size:1.6vw;font-weight:600;
          padding:10px 0;display:none;overflow:hidden;white-space:nowrap;">
          <span id="wp-ticker-text" style="display:inline-block;animation:wp-scroll 20s linear infinite;padding-left:100%;"></span>
        </div>
      </div>

      <!-- Layer 5: Caméra Caller (phone) -->
      <video id="wp-cam" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:10;display:none;" autoplay playsinline muted></video>

      <!-- Animation CSS -->
      <style>
        @keyframes wp-scroll { 0%{transform:translateX(0)} 100%{transform:translateX(-100%)} }
        @keyframes wp-fadein { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes wp-fadeout{ from{opacity:1} to{opacity:0} }
        #wp-l3.anim-fade { animation: wp-fadein .45s ease both; }
        #wp-l3.anim-slide-up { animation: wp-fadein .35s ease both; }
        #wp-logo { transition: opacity .3s; }
      </style>
    `;

    _positionTextLayer();
  }

  function _applyBaseCSS() {
    const l3 = _q('#wp-l3');
    const main = _q('#wp-main');
    const sub  = _q('#wp-sub');
    const ref  = _q('#wp-ref');

    if (main) main.style.cssText = `
      font-size:${_config.fontSize};font-weight:${_config.fontWeight};
      color:${_config.color};text-shadow:${_config.textShadow};
      line-height:${_config.lineHeight};text-align:${_config.textAlign};
    `;
    if (sub) sub.style.cssText = `
      font-size:${_config.subFontSize};color:${_config.subColor};
      text-align:${_config.textAlign};text-shadow:${_config.textShadow};
    `;
    if (ref) ref.style.cssText = `
      font-size:${_config.refFontSize};color:rgba(255,255,255,.5);
      text-align:${_config.textAlign};letter-spacing:.05em;
    `;
    _updateOverlay();
  }

  function _positionTextLayer() {
    const l3 = _q('#wp-l3');
    if (!l3) return;
    const pos = _config.position;
    l3.style.top = l3.style.bottom = l3.style.transform = '';
    if (pos === 'top')    { l3.style.top    = '8%'; }
    else if (pos === 'center') { l3.style.top = '50%'; l3.style.transform = 'translateY(-50%)'; }
    else                  { l3.style.bottom = '10%'; }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  API LAYER 1 — BACKGROUND
  // ══════════════════════════════════════════════════════════════════════════

  function setBg(bg) {
    if (!bg) { _setBlack(); return; }
    _state.bgMode = bg.mode || 'black';

    const img = _q('#wp-bg-img');
    const vid = _q('#wp-bg-vid');
    const rtc = _q('#wp-bg-rtc');
    const l1  = _q('#wp-l1');

    // Reset
    if (img) img.style.display = 'none';
    if (vid) vid.style.display = 'none';

    switch (bg.mode) {
      case 'black':
        l1.style.background = '#000';
        break;
      case 'color':
        l1.style.background = bg.color || '#000';
        break;
      case 'gradient':
        l1.style.background = bg.gradient || 'linear-gradient(135deg,#0f172a,#1e3a5f)';
        break;
      case 'image':
        if (img && bg.url) {
          img.src = bg.url;
          img.style.display = 'block';
          l1.style.background = '#000';
        }
        break;
      case 'video':
        if (vid && bg.url) {
          vid.src = bg.url;
          vid.style.display = 'block';
          vid.play().catch(() => {});
          l1.style.background = '#000';
        }
        break;
      case 'stream':
        // Stream WebRTC reçu
        if (rtc && bg.stream) {
          rtc.srcObject = bg.stream;
          rtc.style.display = 'block';
          rtc.style.zIndex = '5';
          rtc.play().catch(() => {});
        }
        break;
    }
    _updateOverlay();
  }

  function _setBlack() {
    const l1 = _q('#wp-l1');
    if (l1) l1.style.background = '#000';
    ['#wp-bg-img','#wp-bg-vid','#wp-bg-rtc'].forEach(id => {
      const el = _q(id);
      if (el) el.style.display = 'none';
    });
  }

  function _updateOverlay() {
    const ov = _q('#wp-overlay');
    if (ov) ov.style.background = `rgba(0,0,0,${(_config.overlayOpacity || 55) / 100})`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  API LAYER 2 — WATERMARK LOGO
  // ══════════════════════════════════════════════════════════════════════════

  function setLogo({ url, position = 'top-right', opacity = 0.5, size = 54 } = {}) {
    const logo = _q('#wp-logo');
    const l2   = _q('#wp-l2');
    if (!logo || !l2) return;

    if (!url) { logo.style.display = 'none'; return; }

    logo.src = url;
    logo.style.display  = 'block';
    logo.style.height   = size + 'px';
    logo.style.opacity  = opacity;

    // Positionnement
    const PAD = '2.5vw';
    l2.style.cssText = 'position:absolute;z-index:2;pointer-events:none;';
    const posMap = {
      'top-right'   : `top:${PAD};right:${PAD}`,
      'top-left'    : `top:${PAD};left:${PAD}`,
      'bottom-right': `bottom:${PAD};right:${PAD}`,
      'bottom-left' : `bottom:${PAD};left:${PAD}`,
    };
    const p = posMap[position] || posMap['top-right'];
    p.split(';').forEach(rule => {
      const [k, v] = rule.split(':');
      if (k && v) l2.style[k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v.trim();
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  API LAYER 3 — TEXTES AVEC TRANSITIONS
  // ══════════════════════════════════════════════════════════════════════════

  function project(payload) {
    const transition = payload.transition || _config.transition || 'fade';
    const fn = TRANSITIONS[transition] || _transFade;
    fn(payload);
    if (payload.bg) setBg(payload.bg);
  }

  function clear() {
    const fn = TRANSITIONS[_config.transition] || _transFade;
    fn({ main: '', sub: '', ref: '' });
  }

  function _setText(payload) {
    const mainEl = _q('#wp-main');
    const subEl  = _q('#wp-sub');
    const refEl  = _q('#wp-ref');
    if (mainEl) mainEl.innerHTML = (payload.main || payload.text || '').replace(/\n/g, '<br>');
    if (subEl)  subEl.textContent  = payload.sub  || '';
    if (refEl)  refEl.textContent  = payload.ref  || '';
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  function _transFade(payload) {
    const l3 = _q('#wp-l3');
    if (!l3) { _setText(payload); return; }
    l3.style.transition = 'opacity .4s ease';
    l3.style.opacity = '0';
    setTimeout(() => {
      _setText(payload);
      l3.style.opacity = '1';
    }, 200);
  }

  function _transSlideUp(payload) {
    const l3 = _q('#wp-l3');
    if (!l3) { _setText(payload); return; }
    l3.style.transition = 'opacity .3s,transform .35s';
    l3.style.opacity = '0';
    l3.style.transform = (_config.position === 'top' ? 'translateY(-15px)' : 'translateY(15px)');
    setTimeout(() => {
      _setText(payload);
      l3.style.transform = 'translateY(0)';
      l3.style.opacity = '1';
    }, 180);
  }

  function _transSlideDown(payload) {
    const l3 = _q('#wp-l3');
    if (!l3) { _setText(payload); return; }
    l3.style.transition = 'opacity .3s,transform .35s';
    l3.style.opacity = '0';
    l3.style.transform = 'translateY(-15px)';
    setTimeout(() => {
      _setText(payload);
      l3.style.transform = 'translateY(0)';
      l3.style.opacity = '1';
    }, 180);
  }

  function _transZoom(payload) {
    const l3 = _q('#wp-l3');
    if (!l3) { _setText(payload); return; }
    l3.style.transition = 'opacity .35s,transform .4s cubic-bezier(.175,.885,.32,1.275)';
    l3.style.opacity = '0';
    l3.style.transform = 'scale(.88)';
    setTimeout(() => {
      _setText(payload);
      l3.style.transform = 'scale(1)';
      l3.style.opacity = '1';
    }, 200);
  }

  function _transBlur(payload) {
    const l3 = _q('#wp-l3');
    if (!l3) { _setText(payload); return; }
    l3.style.transition = 'opacity .4s,filter .4s';
    l3.style.opacity = '0';
    l3.style.filter = 'blur(12px)';
    setTimeout(() => {
      _setText(payload);
      l3.style.filter = 'blur(0)';
      l3.style.opacity = '1';
    }, 220);
  }

  function _transWipe(payload) {
    _setText(payload);
    const l3 = _q('#wp-l3');
    if (!l3) return;
    l3.style.clipPath = 'inset(0 100% 0 0)';
    l3.style.transition = 'clip-path .45s cubic-bezier(.4,0,.2,1)';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { l3.style.clipPath = 'inset(0 0% 0 0)'; });
    });
  }

  function _transNone(payload) {
    _setText(payload);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  API LAYER 4 — OVERLAYS
  // ══════════════════════════════════════════════════════════════════════════

  function showTag(label, duration = 4000) {
    const el = _q('#wp-tag');
    if (!el) return;
    el.textContent = label;
    el.style.display = 'block';
    el.style.animation = 'wp-fadein .3s ease';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.style.animation = 'wp-fadeout .3s ease forwards';
      setTimeout(() => { el.style.display = 'none'; }, 320);
    }, duration);
  }

  function showLowerThird({ title, subtitle, style = 'bar' } = {}) {
    const lt = _q('#wp-lt');
    if (!lt) return;
    lt.innerHTML = `
      <div style="background:linear-gradient(90deg,rgba(15,23,42,.95),rgba(15,23,42,.7),transparent);
        padding:14px 4vw;border-top:3px solid #f5a623;">
        <div style="font-size:1.8vw;font-weight:700;color:#fff;">${_esc(title || '')}</div>
        ${subtitle ? `<div style="font-size:1.2vw;color:#fbbf24;margin-top:4px;">${_esc(subtitle)}</div>` : ''}
      </div>`;
    lt.style.display = 'block';
    lt.style.animation = 'wp-fadein .4s ease';
    clearTimeout(lt._timer);
    lt._timer = setTimeout(() => hideLowerThird(), 8000);
  }

  function hideLowerThird() {
    const lt = _q('#wp-lt');
    if (!lt) return;
    lt.style.animation = 'wp-fadeout .4s ease forwards';
    setTimeout(() => { lt.style.display = 'none'; }, 420);
  }

  function showAlert(text, duration = 6000) {
    const el = _q('#wp-alert');
    if (!el) return;
    el.innerHTML = `🔔 ${_esc(text)}`;
    el.style.display = 'block';
    el.style.animation = 'wp-fadein .3s ease';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.style.animation = 'wp-fadeout .3s ease forwards';
      setTimeout(() => { el.style.display = 'none'; }, 320);
    }, duration);
  }

  function showTicker(text, speed = 20) {
    const ticker = _q('#wp-ticker');
    const span   = _q('#wp-ticker-text');
    if (!ticker || !span) return;
    span.textContent = text + '     ';
    span.style.animationDuration = speed + 's';
    ticker.style.display = 'block';
  }

  function hideTicker() {
    const ticker = _q('#wp-ticker');
    if (ticker) ticker.style.display = 'none';
  }

  // ── Caméra Phone (Layer 5) ─────────────────────────────────────────────────
  function showCamStream(stream) {
    const cam = _q('#wp-cam');
    if (!cam) return;
    cam.srcObject = stream;
    cam.style.display = 'block';
    cam.play().catch(() => {});
  }

  function hideCamStream() {
    const cam = _q('#wp-cam');
    if (cam) { cam.srcObject = null; cam.style.display = 'none'; }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  CONFIGURATION DYNAMIQUE
  // ══════════════════════════════════════════════════════════════════════════

  function setStyle(overrides) {
    Object.assign(_config, overrides);
    _applyBaseCSS();
    if (overrides.position) _positionTextLayer();
  }

  function getStyle() { return Object.assign({}, _config); }

  // ══════════════════════════════════════════════════════════════════════════
  //  UTILITAIRES
  // ══════════════════════════════════════════════════════════════════════════

  function _q(sel) {
    if (!_root) return document.querySelector(sel);
    return _root.querySelector(sel) || document.querySelector(sel);
  }

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  API PUBLIQUE
  // ══════════════════════════════════════════════════════════════════════════

  return {
    init,
    // Layer 1
    setBg,
    // Layer 2
    setLogo,
    // Layer 3
    project, clear, setStyle, getStyle,
    // Layer 4
    showTag, showLowerThird, hideLowerThird,
    showAlert, showTicker, hideTicker,
    // Layer 5 (cam)
    showCamStream, hideCamStream,
  };

})();
