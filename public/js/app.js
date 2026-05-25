/**
 * WiseProjection — Orchestrateur Principal & Mode Display
 * Wise Design © 2025
 */
'use strict';

// ══════════════════════════════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════════════════════════════
function toast(msg, type = 'info', dur = 2800) {
  const c = document.getElementById('toast-wrap');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .35s'; setTimeout(() => t.remove(), 380); }, dur);
}

// ══════════════════════════════════════════════════════════════════════════
//  MODE DISPLAY (TV Box)
// ══════════════════════════════════════════════════════════════════════════
const Display = (() => {

  let compositor = null;

  function init() {
    compositor = Object.create(WPCompositor);
    compositor.init('wp-compositor-root');
    window._WPDisplay = compositor;

    // Lier WP events
    WP.on('project',   p  => compositor.project(p));
    WP.on('clear',     () => compositor.clear());
    WP.on('bg',        bg => compositor.setBg(bg));
    WP.on('lt',        p  => compositor.showLowerThird(p));
    WP.on('tag',       p  => compositor.showTag(p.label, p.duration));
    WP.on('logo_anim', () => _playLogoAnim());
    WP.on('alert',     p  => compositor.showAlert(p.text));
    WP.on('rtc_offer', p  => _handleRtcOffer(p));
    WP.on('rtc_ice',   p  => _handleRtcIce(p));
    WP.on('cam_stop',  () => compositor.hideCamStream());
    WP.on('joined',    () => _hideOverlay());
  }

  function applyCode() {
    const input = document.getElementById('display-code-input');
    const code  = (input?.value || '').trim();
    if (!/^\d{6}$/.test(code)) { toast('Code à 6 chiffres requis', 'error'); return; }
    WP.connect({ code, role: 'display', label: 'Display TV' });
  }

  function _hideOverlay() {
    const ov = document.getElementById('display-pair-overlay');
    if (ov) { ov.style.opacity = '0'; ov.style.transition = 'opacity .5s'; setTimeout(() => ov.style.display = 'none', 520); }
  }

  function _playLogoAnim() {
    compositor.showTag('✨ ' + (document.title.split('—')[0].trim()), 3000);
  }

  // WebRTC Receiver (display reçoit caméra phone)
  let _rtcPc = null;
  async function _handleRtcOffer({ sdp, from }) {
    if (_rtcPc) { try { _rtcPc.close(); } catch(e) {} }
    _rtcPc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    _rtcPc.ontrack = e => compositor.showCamStream(e.streams[0]);
    _rtcPc.onicecandidate = e => { if (e.candidate) WP.rtcIce(e.candidate.toJSON(), from); };
    await _rtcPc.setRemoteDescription(new RTCSessionDescription(sdp)).catch(() => {});
    const answer = await _rtcPc.createAnswer();
    await _rtcPc.setLocalDescription(answer);
    WP.rtcAnswer(answer, from);
  }
  async function _handleRtcIce({ candidate }) {
    if (_rtcPc && candidate) await _rtcPc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
  }

  return { init, applyCode };
})();

// ══════════════════════════════════════════════════════════════════════════
//  APP — ROUTEUR DE MODES
// ══════════════════════════════════════════════════════════════════════════
const App = (() => {

  let _mode    = null;
  let _inited  = { control: false, display: false, remote: false };

  function setMode(mode) {
    // Masquer tous les modes
    document.querySelectorAll('.mode').forEach(el => el.classList.remove('active'));
    const el = document.getElementById('mode-' + mode);
    if (el) el.classList.add('active');
    _mode = mode;

    // Init lazy
    if (mode === 'control' && !_inited.control) { Control.init(); _inited.control = true; }
    if (mode === 'display' && !_inited.display) { Display.init(); _inited.display = true; }
    if (mode === 'remote'  && !_inited.remote)  { WPRemote.init('remote-root'); _inited.remote = true; }

    // Fullscreen sur display
    if (mode === 'display') {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }

  function launchDemo() { setMode('control'); toast('Mode Démo — Bienvenue !', 'info'); }

  function scrollTo(id) {
    const el = document.getElementById(id) || document.querySelector(`[id="${id}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function contact() { window.open('https://wa.me/240555445514?text=Bonjour%20Wise%20Design,%20je%20souhaite%20souscrire%20à%20WiseProjection', '_blank'); }

  // Auto-détection du mode selon l'URL
  function autoDetect() {
    const p = new URLSearchParams(location.search);

    if (p.has('display') || p.has('tv')) {
      setMode('display');
      const code = p.get('code') || p.get('room') || '';
      if (/^\d{6}$/.test(code)) {
        WP.connect({ code, role: 'display', label: 'Display TV' });
      }
      return;
    }

    if (p.has('remote') || p.has('telecommande')) {
      setMode('remote');
      const code = p.get('code') || '';
      if (/^\d{6}$/.test(code)) WP.connect({ code, role: 'remote', label: 'Télécommande' });
      return;
    }

    if (p.has('control') || p.has('regie')) {
      setMode('control');
      const code = p.get('code') || '';
      WP.connect({ code, role: 'control', label: 'Régie' });
      return;
    }

    // Par défaut : landing
    setMode('landing');
  }

  return { setMode, launchDemo, scrollTo, contact, autoDetect };
})();

// ══════════════════════════════════════════════════════════════════════════
//  DÉMARRAGE
// ══════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Fermeture modals sur clic overlay
  document.querySelectorAll('.modal-wrap').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
  });

  App.autoDetect();
});
