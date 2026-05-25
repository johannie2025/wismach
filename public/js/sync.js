/**
 * WiseProjection — Moteur de Synchronisation Client
 * Wise Design © 2025
 *
 * Gère : WebSocket appairage, état distribué, WebRTC signaling
 */

'use strict';

const WP = window.WP = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  //  ÉTAT GLOBAL
  // ══════════════════════════════════════════════════════════════════════════

  const state = {
    ws          : null,
    code        : null,        // code d'appairage 6 chiffres
    role        : 'display',   // 'control' | 'display' | 'remote' | 'monitor'
    id          : null,        // ID serveur assigné
    label       : '',
    connected   : false,
    reconnTimer : null,
    reconnDelay : 1500,
    maxDelay    : 30000,
    pingTimer   : null,
    lastPing    : 0,
    latency     : 0,
    peers       : new Map(),   // id → { role, label }
    // Projection
    lastPayload : null,
    lastBg      : null,
    // Listeners
    handlers    : {},
    // Config
    serverUrl   : null,
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  ÉVÉNEMENTS
  // ══════════════════════════════════════════════════════════════════════════

  function on(event, fn) {
    if (!state.handlers[event]) state.handlers[event] = [];
    state.handlers[event].push(fn);
  }

  function off(event, fn) {
    if (!state.handlers[event]) return;
    state.handlers[event] = state.handlers[event].filter(f => f !== fn);
  }

  function emit(event, data) {
    (state.handlers[event] || []).forEach(fn => { try { fn(data); } catch(e) {} });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  CONNEXION WEBSOCKET
  // ══════════════════════════════════════════════════════════════════════════

  function connect({ code, role = 'display', label = '', serverUrl = null } = {}) {
    state.role  = role;
    state.label = label || role;
    if (code) state.code = String(code);
    if (serverUrl) state.serverUrl = serverUrl;

    _openSocket();
  }

  function _buildUrl() {
    if (state.serverUrl) return state.serverUrl;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}`;
  }

  function _openSocket() {
    if (state.ws) { try { state.ws.close(); } catch(e) {} }

    const url = _buildUrl();
    let ws;
    try {
      ws = new WebSocket(url);
    } catch(e) {
      emit('error', { code: 'WS_OPEN_FAILED', message: e.message });
      _scheduleReconn();
      return;
    }

    state.ws = ws;
    _setUi('connecting');

    ws.onopen = () => {
      state.reconnDelay = 1500;
      clearTimeout(state.reconnTimer);
      _join();
      _startPing();
    };

    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      _handleMsg(msg);
    };

    ws.onclose = () => {
      state.connected = false;
      _stopPing();
      _setUi('disconnected');
      emit('disconnected', {});
      _scheduleReconn();
    };

    ws.onerror = () => {};
  }

  function _join() {
    _send({ type: 'join', code: state.code || '', role: state.role, label: state.label });
  }

  function _scheduleReconn() {
    clearTimeout(state.reconnTimer);
    state.reconnTimer = setTimeout(() => {
      _openSocket();
    }, state.reconnDelay);
    state.reconnDelay = Math.min(state.reconnDelay * 1.5, state.maxDelay);
  }

  function disconnect() {
    clearTimeout(state.reconnTimer);
    _stopPing();
    if (state.ws) { try { state.ws.close(); } catch(e) {} state.ws = null; }
    state.connected = false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  PING / LATENCE
  // ══════════════════════════════════════════════════════════════════════════

  function _startPing() {
    _stopPing();
    state.pingTimer = setInterval(() => {
      state.lastPing = Date.now();
      _send({ type: 'ping' });
    }, 5000);
  }

  function _stopPing() {
    clearInterval(state.pingTimer);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  TRAITEMENT DES MESSAGES ENTRANTS
  // ══════════════════════════════════════════════════════════════════════════

  function _handleMsg(msg) {
    const { type } = msg;

    switch (type) {

      case 'joined':
        state.id        = msg.id;
        state.code      = msg.code;
        state.connected = true;
        _updatePeers(msg.stats);
        _setUi('connected');
        emit('joined', { code: msg.code, role: msg.role, id: msg.id, stats: msg.stats });
        break;

      case 'pong':
        state.latency = Date.now() - state.lastPing;
        emit('latency', { ms: state.latency });
        break;

      case 'room_stats':
        _updatePeers(msg);
        emit('stats', msg);
        break;

      case 'peer_joined':
        state.peers.set(msg.id, { role: msg.role, label: msg.label });
        emit('peer_joined', msg);
        emit('stats', { total: state.peers.size });
        break;

      case 'peer_left':
        state.peers.delete(msg.id);
        emit('peer_left', msg);
        emit('stats', { total: state.peers.size });
        break;

      // ── PROJECTION ────────────────────────────────────────────────────────
      case 'project':
        state.lastPayload = msg;
        emit('project', msg);
        break;

      case 'clear':
        state.lastPayload = null;
        emit('clear', msg);
        break;

      case 'bg':
        state.lastBg = msg.bg;
        emit('bg', msg.bg);
        break;

      // ── UI ────────────────────────────────────────────────────────────────
      case 'lt':       emit('lt', msg);       break;
      case 'tag':      emit('tag', msg);      break;
      case 'logo_anim':emit('logo_anim', msg);break;
      case 'alert':    emit('alert', msg);    break;

      // ── TÉLÉCOMMANDE ──────────────────────────────────────────────────────
      case 'nav_next': emit('nav_next', msg); break;
      case 'nav_prev': emit('nav_prev', msg); break;
      case 'nav_slide':emit('nav_slide', msg);break;

      // ── WEBRTC SIGNALING ──────────────────────────────────────────────────
      case 'rtc_offer':  emit('rtc_offer', msg);  break;
      case 'rtc_answer': emit('rtc_answer', msg); break;
      case 'rtc_ice':    emit('rtc_ice', msg);    break;
      case 'cam_stop':   emit('cam_stop', msg);   break;

      case 'error':
        emit('error', msg);
        break;
    }
  }

  function _updatePeers(stats) {
    if (!stats) return;
    emit('stats', stats);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  ENVOI DE MESSAGES
  // ══════════════════════════════════════════════════════════════════════════

  function _send(msg) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  // ── API publique d'envoi ──────────────────────────────────────────────────

  function project(payload) {
    state.lastPayload = payload;
    return _send({ type: 'project', ...payload });
  }

  function clear() {
    state.lastPayload = null;
    return _send({ type: 'clear' });
  }

  function setBg(bg) {
    state.lastBg = bg;
    return _send({ type: 'bg', bg });
  }

  function showTag(label, duration = 4000) {
    return _send({ type: 'tag', label, duration });
  }

  function showLt(data) {
    return _send({ type: 'lt', ...data });
  }

  function logoAnim() {
    return _send({ type: 'logo_anim' });
  }

  function navNext() { return _send({ type: 'nav_next' }); }
  function navPrev() { return _send({ type: 'nav_prev' }); }
  function navSlide(idx) { return _send({ type: 'nav_slide', idx }); }

  // ── WebRTC Signaling ──────────────────────────────────────────────────────
  function rtcOffer(sdp, to_id)  { return _send({ type: 'rtc_offer',  sdp, to_id, from: state.id }); }
  function rtcAnswer(sdp, to_id) { return _send({ type: 'rtc_answer', sdp, to_id, from: state.id }); }
  function rtcIce(candidate, to_id) { return _send({ type: 'rtc_ice', candidate, to_id, from: state.id }); }
  function camStop() { return _send({ type: 'cam_stop' }); }

  // ══════════════════════════════════════════════════════════════════════════
  //  UI HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  function _setUi(state_) {
    emit('ui_state', state_);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  GÉNÉRATION DE CODE LOCAL (fallback si pas de serveur)
  // ══════════════════════════════════════════════════════════════════════════

  function genLocalCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  API PUBLIQUE
  // ══════════════════════════════════════════════════════════════════════════

  return {
    // Connexion
    connect, disconnect,
    // Getters
    get code()      { return state.code; },
    get role()      { return state.role; },
    get id()        { return state.id; },
    get connected() { return state.connected; },
    get latency()   { return state.latency; },
    get peers()     { return state.peers; },
    get lastPayload(){ return state.lastPayload; },
    get lastBg()    { return state.lastBg; },
    // Événements
    on, off, emit,
    // Projection
    project, clear, setBg, showTag, showLt, logoAnim,
    // Navigation (télécommande)
    navNext, navPrev, navSlide,
    // WebRTC
    rtcOffer, rtcAnswer, rtcIce, camStop,
    // Utils
    genLocalCode,
    // Envoi bas niveau
    send: _send,
  };

})();
