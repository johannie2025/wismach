/**
 * WiseProjection — Télécommande Mobile (Blind-Tap Gesture Controller)
 * Wise Design © 2025
 *
 * Interface Maestro : 3 lignes de visibilité + gestes tactiles aveugles
 * Compatible : iOS Safari, Android Chrome, PWA standalone
 */

'use strict';

const WPRemote = (() => {

  // ══════════════════════════════════════════════════════════════════════════
  //  ÉTAT
  // ══════════════════════════════════════════════════════════════════════════

  const state = {
    items        : [],   // [{main, sub, ref}]
    currentIdx   : 0,
    touchStartX  : 0,
    touchStartY  : 0,
    touchStartTime: 0,
    swipeThresh  : 80,   // px pour déclencher swipe section
    camStream    : null,
    camActive    : false,
    rtcPc        : null,
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════════════════════════════════════════

  function init(rootId = 'remote-root') {
    const root = document.getElementById(rootId) || document.body;
    _buildUI(root);
    _bindGestures(root);
    _bindWP();
  }

  function _buildUI(root) {
    root.innerHTML = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { width: 100%; height: 100%; overflow: hidden; background: #060b12; }

        #rmt-wrap {
          position: fixed; inset: 0; display: flex; flex-direction: column;
          font-family: 'Inter', sans-serif; overflow: hidden; user-select: none;
          -webkit-user-select: none; touch-action: none;
        }

        /* ── Barre de statut ── */
        #rmt-status {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 16px; background: rgba(255,255,255,.04);
          border-bottom: 1px solid rgba(255,255,255,.06); flex-shrink: 0;
          font-size: .72rem; color: rgba(255,255,255,.4); z-index: 10;
        }
        #rmt-conn-dot { width: 7px; height: 7px; border-radius: 50%; background: #3b4252; display: inline-block; margin-right: 5px; }
        #rmt-conn-dot.on { background: #2ecc71; box-shadow: 0 0 6px #2ecc71; }
        #rmt-latency { font-size: .62rem; }
        #rmt-idx { font-size: .72rem; color: rgba(255,255,255,.35); }

        /* ── Zone 3 lignes ── */
        #rmt-3lines {
          flex: 0 0 auto; padding: 12px 16px 8px; z-index: 5;
          pointer-events: none;
        }
        .rmt-prev-line {
          font-size: 1.05rem; color: rgba(255,255,255,.28); font-weight: 400;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          line-height: 1.35; min-height: 1.35em;
        }
        .rmt-curr-line {
          font-size: 2rem; color: #f5a623; font-weight: 700;
          line-height: 1.25; margin: 6px 0;
          text-shadow: 0 2px 16px rgba(245,166,35,.3);
        }
        .rmt-next-line {
          font-size: 1.35rem; color: rgba(255,255,255,.65); font-weight: 500;
          line-height: 1.3;
        }

        /* ── Zone tactile (pavé géant) ── */
        #rmt-pad {
          flex: 1; position: relative; display: flex;
          align-items: stretch; cursor: none; overflow: hidden;
        }
        #rmt-left, #rmt-right {
          flex: 1; display: flex; align-items: center; justify-content: center;
          transition: background .15s;
        }
        #rmt-left  { border-right: 1px solid rgba(255,255,255,.04); }
        #rmt-left:active  { background: rgba(255,255,255,.06); }
        #rmt-right:active { background: rgba(255,255,255,.06); }

        /* Indicateurs visuels discrets */
        .rmt-arrow {
          font-size: 3rem; color: rgba(255,255,255,.07);
          pointer-events: none; transition: color .15s;
          font-weight: 300;
        }
        #rmt-left:active  .rmt-arrow { color: rgba(255,255,255,.18); }
        #rmt-right:active .rmt-arrow { color: rgba(255,255,255,.18); }

        /* ── Ripple feedback ── */
        .rmt-ripple {
          position: absolute; border-radius: 50%;
          background: rgba(255,255,255,.15);
          transform: scale(0); pointer-events: none;
          animation: rmt-ripple-anim .45s ease-out forwards;
        }
        @keyframes rmt-ripple-anim {
          to { transform: scale(4); opacity: 0; }
        }

        /* ── Barre inférieure ── */
        #rmt-bottom {
          flex-shrink: 0; padding: 8px 16px 14px;
          border-top: 1px solid rgba(255,255,255,.06);
          display: flex; gap: 8px; align-items: center; z-index: 10;
        }
        .rmt-btn {
          flex: 1; padding: 10px 6px; border-radius: 10px; border: none;
          background: rgba(255,255,255,.06); color: rgba(255,255,255,.7);
          font-size: .75rem; font-weight: 600; cursor: pointer;
          transition: background .15s, transform .1s;
        }
        .rmt-btn:active { background: rgba(255,255,255,.14); transform: scale(.97); }
        .rmt-btn.danger { background: rgba(220,38,38,.2); color: #f87171; }
        .rmt-btn.active { background: rgba(245,166,35,.2); color: #f5a623; }

        /* ── Code d'appairage overlay ── */
        #rmt-pair-overlay {
          position: fixed; inset: 0; background: #060b12; z-index: 100;
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 16px; padding: 24px;
        }
        #rmt-pair-overlay.hidden { display: none; }
        #rmt-pair-logo { font-size: 2.5rem; }
        #rmt-pair-title { font-size: 1.4rem; font-weight: 700; color: #fff; }
        #rmt-pair-sub { font-size: .85rem; color: rgba(255,255,255,.45); text-align: center; }
        #rmt-pair-input {
          width: 100%; max-width: 280px; padding: 14px 18px;
          border-radius: 12px; border: 2px solid rgba(245,166,35,.4);
          background: rgba(255,255,255,.06); color: #fff; font-size: 1.6rem;
          font-family: monospace; text-align: center; letter-spacing: .25em;
          outline: none; font-weight: 700;
        }
        #rmt-pair-input:focus { border-color: #f5a623; }
        #rmt-pair-btn {
          width: 100%; max-width: 280px; padding: 14px;
          border-radius: 12px; border: none; background: #f5a623;
          color: #000; font-size: 1rem; font-weight: 700; cursor: pointer;
        }
        #rmt-pair-err { font-size: .8rem; color: #f87171; min-height: 1em; }

        /* ── Aperçu caméra ── */
        #rmt-cam-prev {
          position: fixed; bottom: 80px; right: 12px; width: 100px; height: 70px;
          border-radius: 8px; object-fit: cover; border: 2px solid rgba(255,255,255,.15);
          display: none; z-index: 20;
        }
      </style>

      <!-- Overlay appairage -->
      <div id="rmt-pair-overlay">
        <div id="rmt-pair-logo">📡</div>
        <div id="rmt-pair-title">WiseProjection</div>
        <div id="rmt-pair-sub">Entrez le code affiché sur la régie</div>
        <input id="rmt-pair-input" type="tel" inputmode="numeric" maxlength="6" placeholder="000000"/>
        <div id="rmt-pair-err"></div>
        <button id="rmt-pair-btn">Connecter</button>
      </div>

      <!-- Interface principale -->
      <div id="rmt-wrap">
        <div id="rmt-status">
          <span><span id="rmt-conn-dot"></span><span id="rmt-code-lbl">—</span></span>
          <span id="rmt-idx">0 / 0</span>
          <span id="rmt-latency">—</span>
        </div>

        <div id="rmt-3lines">
          <div class="rmt-prev-line" id="rmt-prev">—</div>
          <div class="rmt-curr-line" id="rmt-curr">En attente…</div>
          <div class="rmt-next-line" id="rmt-next">—</div>
        </div>

        <div id="rmt-pad">
          <div id="rmt-left"><div class="rmt-arrow">‹</div></div>
          <div id="rmt-right"><div class="rmt-arrow">›</div></div>
        </div>

        <div id="rmt-bottom">
          <button class="rmt-btn" onclick="WPRemote.clear()">⬛ Noir</button>
          <button class="rmt-btn" id="rmt-cam-btn" onclick="WPRemote.toggleCam()">📷 Cam</button>
          <button class="rmt-btn" onclick="WPRemote.logoAnim()">✨ Logo</button>
          <button class="rmt-btn danger" onclick="WPRemote.disconnect()">✕</button>
        </div>
      </div>

      <video id="rmt-cam-prev" autoplay muted playsinline></video>
    `;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  GESTES TACTILES
  // ══════════════════════════════════════════════════════════════════════════

  function _bindGestures(root) {
    const pad   = document.getElementById('rmt-pad');
    const left  = document.getElementById('rmt-left');
    const right = document.getElementById('rmt-right');

    if (!pad) return;

    // Désactiver le scroll / zoom natif
    pad.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

    // ── Tap gauche → Précédent ────────────────────────────────────────────
    left.addEventListener('click', e => {
      _ripple(left, e);
      navigate(-1);
    });

    // ── Tap droit → Suivant ───────────────────────────────────────────────
    right.addEventListener('click', e => {
      _ripple(right, e);
      navigate(1);
    });

    // ── Swipe horizontal sur le pavé → navigation section ────────────────
    pad.addEventListener('touchstart', e => {
      const t = e.changedTouches[0];
      state.touchStartX    = t.clientX;
      state.touchStartY    = t.clientY;
      state.touchStartTime = Date.now();
    }, { passive: true });

    pad.addEventListener('touchend', e => {
      const t    = e.changedTouches[0];
      const dx   = t.clientX - state.touchStartX;
      const dy   = t.clientY - state.touchStartY;
      const dt   = Date.now() - state.touchStartTime;

      // Swipe rapide horizontal
      if (Math.abs(dx) > state.swipeThresh && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 500) {
        dx < 0 ? _jumpSection(1) : _jumpSection(-1);
      }
    }, { passive: true });

    // ── Keyboard (desktop) ────────────────────────────────────────────────
    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); navigate(1); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); navigate(-1); }
      if (e.key === 'Escape')     { clear(); }
    });

    // ── Appairage ─────────────────────────────────────────────────────────
    const btn   = document.getElementById('rmt-pair-btn');
    const input = document.getElementById('rmt-pair-input');
    if (btn) btn.addEventListener('click', _applyPair);
    if (input) {
      input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') _applyPair(); });
    }
  }

  function _applyPair() {
    const input = document.getElementById('rmt-pair-input');
    const err   = document.getElementById('rmt-pair-err');
    const code  = (input?.value || '').trim();
    if (!/^\d{6}$/.test(code)) {
      if (err) err.textContent = 'Code à 6 chiffres requis';
      return;
    }
    if (err) err.textContent = '';
    _pair(code);
  }

  function _pair(code) {
    WP.connect({ code, role: 'remote', label: 'Télécommande' });
  }

  function _ripple(el, e) {
    const rect = el.getBoundingClientRect();
    const x = (e.clientX || rect.left + rect.width / 2) - rect.left;
    const y = (e.clientY || rect.top  + rect.height/ 2) - rect.top;
    const r = document.createElement('div');
    r.className = 'rmt-ripple';
    r.style.cssText = `width:60px;height:60px;left:${x-30}px;top:${y-30}px;`;
    el.appendChild(r);
    setTimeout(() => r.remove(), 500);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  NAVIGATION
  // ══════════════════════════════════════════════════════════════════════════

  function navigate(delta) {
    const newIdx = state.currentIdx + delta;
    if (newIdx < 0 || newIdx >= state.items.length) {
      // Hors limites → envoyer commande nav au contrôleur
      if (delta > 0) WP.navNext();
      else           WP.navPrev();
      return;
    }
    state.currentIdx = newIdx;
    _projectCurrent();
    _updateDisplay();
  }

  function _jumpSection(delta) {
    // Swipe → sauter à la prochaine section (ex: couplet → refrain)
    // Implémenté via navNext/Prev x5
    const count = 5;
    let i = 0;
    const iv = setInterval(() => {
      if (delta > 0) WP.navNext(); else WP.navPrev();
      if (++i >= count) clearInterval(iv);
    }, 80);
  }

  function _projectCurrent() {
    const item = state.items[state.currentIdx];
    if (!item) return;
    WP.project({
      main: item.main || item.text || '',
      sub : item.sub  || '',
      ref : item.ref  || '',
      transition: 'fade',
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  AFFICHAGE 3 LIGNES
  // ══════════════════════════════════════════════════════════════════════════

  function _updateDisplay() {
    const prev = state.items[state.currentIdx - 1];
    const curr = state.items[state.currentIdx];
    const next = state.items[state.currentIdx + 1];

    const prevEl = document.getElementById('rmt-prev');
    const currEl = document.getElementById('rmt-curr');
    const nextEl = document.getElementById('rmt-next');
    const idxEl  = document.getElementById('rmt-idx');

    if (prevEl) prevEl.textContent = prev ? (prev.main || prev.text || '').replace(/\n.*$/s, '') : '—';
    if (currEl) currEl.textContent = curr ? (curr.main || curr.text || '') : '—';
    if (nextEl) nextEl.textContent = next ? (next.main || next.text || '').replace(/\n.*$/s, '') : '—';
    if (idxEl)  idxEl.textContent  = `${state.currentIdx + 1} / ${state.items.length}`;
  }

  function loadItems(items) {
    state.items      = items;
    state.currentIdx = 0;
    _updateDisplay();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  CONNEXION WP
  // ══════════════════════════════════════════════════════════════════════════

  function _bindWP() {
    WP.on('joined', (data) => {
      const dot  = document.getElementById('rmt-conn-dot');
      const lbl  = document.getElementById('rmt-code-lbl');
      const overlay = document.getElementById('rmt-pair-overlay');
      if (dot) dot.className = 'on';
      if (lbl) lbl.textContent = data.code;
      if (overlay) overlay.classList.add('hidden');
    });

    WP.on('disconnected', () => {
      const dot = document.getElementById('rmt-conn-dot');
      if (dot) dot.className = '';
    });

    WP.on('latency', ({ ms }) => {
      const el = document.getElementById('rmt-latency');
      if (el) el.textContent = ms + 'ms';
    });

    // Recevoir le dernier état projeté (si rejoint en cours)
    WP.on('project', (p) => {
      // Mise à jour de l'affichage avec ce qui est projeté côté régie
      const curr = document.getElementById('rmt-curr');
      if (curr) curr.textContent = p.main || p.text || '';
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  CAM / WEBRTC
  // ══════════════════════════════════════════════════════════════════════════

  async function toggleCam() {
    if (state.camActive) {
      _stopCam();
    } else {
      await _startCam();
    }
  }

  async function _startCam() {
    try {
      state.camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const prev = document.getElementById('rmt-cam-prev');
      if (prev) { prev.srcObject = state.camStream; prev.style.display = 'block'; prev.play().catch(() => {}); }

      // WebRTC : créer offre vers la régie
      await _rtcOffer();

      state.camActive = true;
      const btn = document.getElementById('rmt-cam-btn');
      if (btn) { btn.textContent = '🔴 Cam ON'; btn.classList.add('active'); }
    } catch(e) {
      console.warn('Cam error:', e.message);
    }
  }

  async function _rtcOffer() {
    if (state.rtcPc) { try { state.rtcPc.close(); } catch(e) {} }
    const pc = new RTCPeerConnection({ iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]});
    state.rtcPc = pc;
    state.camStream.getTracks().forEach(t => pc.addTrack(t, state.camStream));
    pc.onicecandidate = (e) => { if (e.candidate) WP.rtcIce(e.candidate.toJSON()); };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    WP.rtcOffer(offer);

    // Attendre réponse
    WP.on('rtc_answer', async ({ sdp }) => {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp)).catch(() => {});
      }
    });
  }

  function _stopCam() {
    if (state.camStream) { state.camStream.getTracks().forEach(t => t.stop()); state.camStream = null; }
    if (state.rtcPc) { try { state.rtcPc.close(); } catch(e) {} state.rtcPc = null; }
    WP.camStop();
    const prev = document.getElementById('rmt-cam-prev');
    if (prev) { prev.srcObject = null; prev.style.display = 'none'; }
    state.camActive = false;
    const btn = document.getElementById('rmt-cam-btn');
    if (btn) { btn.textContent = '📷 Cam'; btn.classList.remove('active'); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  ACTIONS PUBLIQUES
  // ══════════════════════════════════════════════════════════════════════════

  function clear()     { WP.clear(); }
  function logoAnim()  { WP.logoAnim(); }
  function disconnect(){ WP.disconnect(); document.getElementById('rmt-pair-overlay')?.classList.remove('hidden'); }

  // ══════════════════════════════════════════════════════════════════════════
  //  API PUBLIQUE
  // ══════════════════════════════════════════════════════════════════════════

  return {
    init, loadItems, navigate,
    clear, logoAnim, disconnect,
    toggleCam,
  };

})();
