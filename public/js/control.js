/**
 * WiseProjection — Console de Régie
 * Wise Design © 2025
 */
'use strict';

const Control = (() => {

  // ── État ──────────────────────────────────────────────────────────────────
  const S = {
    currentBible   : null,
    activeBibles   : [],
    currentBook    : 0,
    currentChapter : 0,
    currentVerse   : -1,
    chaptersOfBook : 0,
    versesInChapter: [],
    centerTab      : 'verses',
    sideTab        : 'at',
    songs          : [],
    announces      : [],
    playlist       : [],
    selectedMain   : '',
    selectedSub    : '',
    selectedRef    : '',
    selectedBg     : null,
    bgMode         : 'black',
    bgUrl          : '',
    bgColor        : '#000000',
    transition     : 'fade',
    overlayOpacity : 55,
    preview        : null,   // WPCompositor instance (preview)
  };

  // Sources bibles CDN
  const BIBLE_SOURCES = [
    { code:'LSG1910', name:'Louis Segond 1910',       lang:'fr', url:'https://cdn.jsdelivr.net/gh/thiagobodruk/bible@master/json/pt_aa.json' },
    { code:'KJV',     name:'King James Version',       lang:'en', url:'https://cdn.jsdelivr.net/gh/thiagobodruk/bible@master/json/en_kjv.json' },
    { code:'RVR1960', name:'Reina Valera 1960',        lang:'es', url:'https://cdn.jsdelivr.net/gh/thiagobodruk/bible@master/json/es_rvr.json' },
    { code:'NVI',     name:'Nueva Versión Internacional',lang:'es',url:'https://cdn.jsdelivr.net/gh/thiagobodruk/bible@master/json/es_nvi.json' },
    { code:'NIV',     name:'New International Version', lang:'en', url:'https://cdn.jsdelivr.net/gh/thiagobodruk/bible@master/json/en_niv.json' },
  ];

  const BOOK_NAMES = ['Genèse','Exode','Lévitique','Nombres','Deutéronome','Josué','Juges','Ruth','1 Samuel','2 Samuel','1 Rois','2 Rois','1 Chroniques','2 Chroniques','Esdras','Néhémie','Esther','Job','Psaumes','Proverbes','Ecclésiaste','Cantique','Ésaïe','Jérémie','Lamentations','Ézéchiel','Daniel','Osée','Joël','Amos','Abdias','Jonas','Michée','Nahum','Habacuc','Sophonie','Aggée','Zacharie','Malachie','Matthieu','Marc','Luc','Jean','Actes','Romains','1 Corinthiens','2 Corinthiens','Galates','Éphésiens','Philippiens','Colossiens','1 Thessaloniciens','2 Thessaloniciens','1 Timothée','2 Timothée','Tite','Philémon','Hébreux','Jacques','1 Pierre','2 Pierre','1 Jean','2 Jean','3 Jean','Jude','Apocalypse'];
  const NT_START = 39;

  // BIBLE_DATA en mémoire : { lang: { 'Jean 3:16': 'texte...' } }
  const BIBLE_DATA = {};

  // ── INIT ──────────────────────────────────────────────────────────────────
  async function init() {
    // Charger paramètres
    S.currentBible   = await DB.getSetting('currentBible', null);
    S.activeBibles   = await DB.getSetting('activeBibles', []);
    S.transition     = await DB.getSetting('transition', 'fade');
    S.overlayOpacity = await DB.getSetting('overlayOpacity', 55);

    // Init préview compositor
    S.preview = Object.create(WPCompositor);
    S.preview.init('wp-preview-root', { fontSize: '4vw', subFontSize: '1.6vw', overlayOpacity: S.overlayOpacity, transition: S.transition });

    // WP events
    WP.on('joined', d => {
      _el('ctrl-dot').className = 'pair-dot on';
      _el('ctrl-code-lbl').textContent = d.code;
      _el('modal-code-display').textContent = d.code;
      _updateDisplayUrl(d.code);
    });
    WP.on('disconnected', () => { _el('ctrl-dot').className = 'pair-dot'; });
    WP.on('stats', d => {
      const n = d.byRole?.display || 0;
      _el('ctrl-displays').textContent = n ? `📺 ${n}` : '';
    });
    WP.on('nav_next', () => navNext());
    WP.on('nav_prev', () => navPrev());

    // Charger bibles installées
    const installed = await DB.getAll('bibles');
    installed.forEach(b => {
      if (!BIBLE_DATA[b.lang]) BIBLE_DATA[b.lang] = {};
      Object.assign(BIBLE_DATA[b.lang], b.data || {});
    });
    if (!S.currentBible && installed.length) S.currentBible = installed[0].code;

    renderBibleDlList();
    renderBookList('at');
    renderSongsList();
    renderAnnouncesList();
    renderBgPresets();
    _el('transition-select').value = S.transition;
  }

  // ── PAIR ──────────────────────────────────────────────────────────────────
  function applyCode() {
    const v = (_el('ctrl-join-input')?.value || '').trim();
    const code = /^\d{6}$/.test(v) ? v : '';
    WP.connect({ code, role: 'control', label: 'Régie PC' });
  }

  function showPairModal() {
    _el('modal-code-display').textContent = WP.code || '——————';
    _updateDisplayUrl(WP.code);
    openModal('modal-pair');
  }

  function _updateDisplayUrl(code) {
    const url = `${location.origin}?display&code=${code}`;
    const inp = _el('modal-display-url');
    if (inp) inp.value = url;
  }

  function copyDisplayUrl() {
    const url = _el('modal-display-url')?.value;
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => toast('URL copiée ✅', 'success'));
  }

  // ── SIDEBAR — Livres / Chapitres ──────────────────────────────────────────
  function switchSideTab(tab) {
    S.sideTab = tab;
    ['at','nt','ch'].forEach(t => _el(`stab-${t}`)?.classList.toggle('active', t === tab));
    if (tab === 'at' || tab === 'nt') renderBookList(tab);
    else renderChapterGrid();
  }

  function renderBookList(testament) {
    const isNT = testament === 'nt';
    const start = isNT ? NT_START : 0;
    const end   = isNT ? 65 : NT_START - 1;
    let html = '';
    for (let i = start; i <= end; i++) {
      html += `<button style="display:block;width:100%;text-align:left;padding:5px 8px;border-radius:6px;border:none;background:${S.currentBook===i?'rgba(79,127,255,.15)':'transparent'};color:var(--text);font-size:.72rem;cursor:pointer;" onclick="Control.selectBook(${i})">${BOOK_NAMES[i]}</button>`;
    }
    _el('sidebar-content').innerHTML = html;
  }

  async function selectBook(idx) {
    S.currentBook = idx;
    S.currentChapter = 0;
    switchSideTab('ch');
    if (!S.currentBible) { renderChapterGrid(); return; }
    const verses = await _getVerses(S.currentBible, idx, 0);
    // Compter chapitres : chercher max chapterIndex + 1
    const allLang = Object.keys(BIBLE_DATA);
    S.chaptersOfBook = _countChapters(idx);
    renderChapterGrid();
    loadChapter(idx, 0);
  }

  function _countChapters(bookIdx) {
    // Compter les chapitres à partir des clés BIBLE_DATA
    const prefix = BOOK_NAMES[bookIdx] + ' ';
    let maxCh = 0;
    const lang = S.currentBible ? _bibleLang(S.currentBible) : 'fr';
    const data = BIBLE_DATA[lang] || {};
    Object.keys(data).forEach(ref => {
      if (ref.startsWith(prefix)) {
        const m = ref.match(/ (\d+):/);
        if (m) maxCh = Math.max(maxCh, parseInt(m[1]));
      }
    });
    return maxCh || 50;
  }

  function _bibleLang(code) {
    const b = BIBLE_SOURCES.find(s => s.code === code);
    return b ? b.lang : 'fr';
  }

  function renderChapterGrid() {
    const n = S.chaptersOfBook;
    if (!n) { _el('sidebar-content').innerHTML = '<div style="padding:8px;font-size:.72rem;color:var(--text3);">Sélectionnez un livre</div>'; return; }
    let html = `<div style="font-size:.68rem;color:var(--text3);padding:4px 4px 8px;">${BOOK_NAMES[S.currentBook]}</div><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:3px;">`;
    for (let i = 0; i < n; i++) {
      html += `<button style="padding:5px 2px;border-radius:5px;border:none;background:${S.currentChapter===i?'var(--blue)':'var(--bg3)'};color:${S.currentChapter===i?'#fff':'var(--text2)'};font-size:.7rem;cursor:pointer;" onclick="Control.selectChapter(${i})">${i+1}</button>`;
    }
    html += '</div>';
    _el('sidebar-content').innerHTML = html;
  }

  async function selectChapter(idx) {
    S.currentChapter = idx;
    renderChapterGrid();
    loadChapter(S.currentBook, idx);
  }

  async function loadChapter(bookIdx, chIdx) {
    const lang = S.currentBible ? _bibleLang(S.currentBible) : 'fr';
    const data = BIBLE_DATA[lang] || {};
    const prefix = `${BOOK_NAMES[bookIdx]} ${chIdx + 1}:`;
    const verses = [];
    Object.keys(data).forEach(ref => {
      if (ref.startsWith(prefix)) {
        const vIdx = parseInt(ref.split(':')[1]) - 1;
        verses[vIdx] = { ref, text: data[ref] };
      }
    });
    S.versesInChapter = verses.filter(Boolean);

    const list = _el('verse-list');
    if (!list) return;
    if (!S.versesInChapter.length) {
      list.innerHTML = '<div style="padding:12px;font-size:.75rem;color:var(--text3);">Aucun verset. Téléchargez une bible dans \'📥 Bibles\'.</div>';
      return;
    }
    list.innerHTML = S.versesInChapter.map((v, i) => `
      <div class="verse-row${S.currentVerse===i?' selected':''}" data-idx="${i}"
        onclick="Control.selectVerse(${i})"
        ondblclick="Control.selectVerse(${i});Control.projectCurrent();">
        <div class="verse-num">${i + 1}</div>
        <div class="verse-text">${_esc(v.text)}</div>
      </div>`).join('');
  }

  function selectVerse(idx) {
    S.currentVerse = idx;
    const v = S.versesInChapter[idx];
    if (!v) return;
    setSelected(v.text, v.ref, null);
    document.querySelectorAll('.verse-row').forEach(r => r.classList.remove('selected'));
    document.querySelector(`.verse-row[data-idx="${idx}"]`)?.classList.add('selected');
  }

  async function _getVerses() { return []; } // stub

  // ── RECHERCHE ─────────────────────────────────────────────────────────────
  let _srchTimer = null;
  function onSearch(val) {
    clearTimeout(_srchTimer);
    const el = _el('search-results');
    if (!val.trim()) { if (el) { el.classList.add('hidden'); el.innerHTML = ''; } return; }
    _srchTimer = setTimeout(() => _doSearch(val.trim()), 280);
  }

  async function _doSearch(q) {
    const lang = S.currentBible ? _bibleLang(S.currentBible) : 'fr';
    const data = BIBLE_DATA[lang] || {};
    const kw = q.toLowerCase();
    const results = [];
    Object.keys(data).forEach(ref => {
      if (results.length >= 40) return;
      if (ref.toLowerCase().includes(kw) || data[ref].toLowerCase().includes(kw)) {
        results.push({ ref, text: data[ref] });
      }
    });
    const el = _el('search-results');
    if (!el) return;
    if (!results.length) { el.innerHTML = '<div style="padding:8px;font-size:.72rem;color:var(--text3);">Aucun résultat</div>'; el.classList.remove('hidden'); return; }
    el.innerHTML = results.map(r => `
      <div style="padding:6px 8px;border-radius:6px;cursor:pointer;margin-bottom:2px;" onclick="Control.selectSearchResult('${_escAttr(r.ref)}','${_escAttr(r.text)}')" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        <div style="font-size:.65rem;color:var(--blue)">${_esc(r.ref)}</div>
        <div style="font-size:.75rem;color:var(--text)">${_esc(r.text.slice(0, 80))}…</div>
      </div>`).join('');
    el.classList.remove('hidden');
  }

  function selectSearchResult(ref, text) {
    setSelected(text, ref, null);
    const el = _el('search-results');
    if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
    _el('search-input').value = '';
  }

  // ── SÉLECTION & PROJECTION ────────────────────────────────────────────────
  function setSelected(main, sub, bg) {
    S.selectedMain = main;
    S.selectedSub  = sub;
    S.selectedBg   = bg;
    const pm = _el('preview-main');
    const ps = _el('preview-sub');
    if (pm) pm.textContent = main.slice(0, 120);
    if (ps) ps.textContent = sub;
    // Preview compositor
    if (S.preview) S.preview.project({ main, sub, ref: sub, bg: bg || { mode: S.bgMode, url: S.bgUrl, color: S.bgColor } });
  }

  function projectCurrent() {
    const payload = {
      main      : S.selectedMain,
      sub       : S.selectedSub,
      ref       : S.selectedSub,
      bg        : S.selectedBg || { mode: S.bgMode, url: S.bgUrl, color: S.bgColor },
      transition: S.transition,
    };
    WP.project(payload);
    // Projection locale sur display si même page
    if (window._WPDisplay) window._WPDisplay.project(payload);
  }

  function clear() {
    WP.clear();
    if (window._WPDisplay) window._WPDisplay.clear();
  }

  function logoAnim() { WP.logoAnim(); }

  // ── NAVIGATION ────────────────────────────────────────────────────────────
  function navNext() {
    if (S.currentVerse < S.versesInChapter.length - 1) selectVerse(S.currentVerse + 1);
    else if (S.currentChapter < S.chaptersOfBook - 1) selectChapter(S.currentChapter + 1).then(() => selectVerse(0));
  }
  function navPrev() {
    if (S.currentVerse > 0) selectVerse(S.currentVerse - 1);
    else if (S.currentChapter > 0) selectChapter(S.currentChapter - 1).then(() => selectVerse(Math.max(0, S.versesInChapter.length - 1)));
  }

  // ── CENTRE TABS ───────────────────────────────────────────────────────────
  function switchCenterTab(tab) {
    S.centerTab = tab;
    ['verses','lyrics','announce','playlist','bibles','bg','lt'].forEach(p => {
      _el(`ctab-${p}`)?.classList.toggle('active', p === tab);
      _el(`panel-${p}`)?.classList.toggle('hidden', p !== tab);
    });
    if (tab === 'lyrics')   renderSongsList();
    if (tab === 'announce') renderAnnouncesList();
    if (tab === 'playlist') renderPlaylist();
    if (tab === 'bibles')   renderBibleDlList();
  }

  // ── CHANTS ────────────────────────────────────────────────────────────────
  function showAddSongModal() {
    _el('song-title-input').value  = '';
    _el('song-author-input').value = '';
    _el('song-lyrics-input').value = '';
    openModal('modal-add-song');
  }

  async function saveSong() {
    const title  = _el('song-title-input').value.trim();
    if (!title) { toast('Titre requis', 'error'); return; }
    const lyrics = _el('song-lyrics-input').value.trim();
    const author = _el('song-author-input').value.trim();
    const strophes = lyrics.split(/\n\s*\n/).filter(b => b.trim()).map((b, i) => ({ label: `Strophe ${i+1}`, text: b.trim() }));
    await DB.put('songs', { title, author, lyrics, strophes, createdAt: Date.now() });
    closeModal('modal-add-song');
    renderSongsList();
    toast('Chant enregistré 🎵', 'success');
  }

  async function renderSongsList() {
    S.songs = await DB.getAll('songs');
    const el = _el('songs-list');
    if (!el) return;
    if (!S.songs.length) { el.innerHTML = '<div style="padding:12px;font-size:.75rem;color:var(--text3);">Aucun chant.</div>'; return; }
    el.innerHTML = S.songs.map((s, i) => `
      <div class="song-item" onclick="Control.openSong(${i})">
        <div style="font-size:.78rem;font-weight:600;">${_esc(s.title)}</div>
        <div style="font-size:.65rem;color:var(--text2);">${s.author || ''}${s.strophes ? ' · ' + s.strophes.length + ' strophes' : ''}</div>
      </div>`).join('');
  }

  function openSong(idx) {
    const song = S.songs[idx];
    if (!song) return;
    _el('strophe-song-title').textContent = song.title;
    const sp = _el('strophe-panel');
    if (sp) sp.style.display = 'block';
    const sl = _el('strophe-list');
    if (!sl) return;
    sl.innerHTML = (song.strophes || []).map((s, i) => `
      <div class="strophe-row" onclick="Control.selectStrophe(${idx},${i})" ondblclick="Control.selectStrophe(${idx},${i});Control.projectCurrent();">
        <div style="font-size:.65rem;color:var(--text3);margin-bottom:2px;">${s.label}</div>
        <div style="font-size:.75rem;">${_esc(s.text.slice(0,80))}</div>
      </div>`).join('');
  }

  function selectStrophe(songIdx, strIdx) {
    const song = S.songs[songIdx];
    const s    = song?.strophes?.[strIdx];
    if (!s) return;
    setSelected(s.text, s.label + ' — ' + song.title, null);
    document.querySelectorAll('.strophe-row').forEach((r, i) => r.classList.toggle('active', i === strIdx));
  }

  // ── ANNONCES ──────────────────────────────────────────────────────────────
  function showAddAnnounceModal() {
    _el('ann-title-input').value = '';
    _el('ann-body-input').value  = '';
    openModal('modal-add-announce');
  }

  async function saveAnnounce() {
    const title = _el('ann-title-input').value.trim();
    const body  = _el('ann-body-input').value.trim();
    if (!title && !body) { toast('Remplissez au moins un champ', 'error'); return; }
    await DB.put('announces', { title, body, createdAt: Date.now() });
    closeModal('modal-add-announce');
    renderAnnouncesList();
    toast('Annonce enregistrée 📢', 'success');
  }

  async function renderAnnouncesList() {
    S.announces = await DB.getAll('announces');
    const el = _el('announces-list');
    if (!el) return;
    if (!S.announces.length) { el.innerHTML = '<div style="padding:12px;font-size:.75rem;color:var(--text3);">Aucune annonce.</div>'; return; }
    el.innerHTML = S.announces.map((a, i) => `
      <div class="song-item" onclick="Control.selectAnnounce(${i})" ondblclick="Control.selectAnnounce(${i});Control.projectCurrent();">
        <div style="font-size:.78rem;font-weight:600;">${_esc(a.title || '')}</div>
        <div style="font-size:.65rem;color:var(--text2);">${_esc((a.body || '').slice(0, 60))}</div>
      </div>`).join('');
  }

  function selectAnnounce(idx) {
    const a = S.announces[idx];
    if (!a) return;
    setSelected((a.title ? a.title + '\n\n' : '') + (a.body || ''), a.title || 'Annonce', null);
  }

  // ── PLAYLIST ──────────────────────────────────────────────────────────────
  function addToPlaylist(item) {
    S.playlist.push(item);
    if (S.centerTab === 'playlist') renderPlaylist();
    toast('Ajouté à la playlist', 'info', 1200);
  }

  function renderPlaylist() {
    const el = _el('playlist-area');
    if (!el) return;
    if (!S.playlist.length) { el.innerHTML = '<div style="padding:12px;font-size:.75rem;color:var(--text3);">Playlist vide.</div>'; return; }
    el.innerHTML = S.playlist.map((item, i) => `
      <div class="pl-item${item._active?' active':''}" onclick="Control.playlistClick(${i})" ondblclick="Control.playlistClick(${i});Control.projectCurrent();">
        <span style="font-size:.7rem;">${item.type==='verse'?'📖':item.type==='lyric'?'🎵':'📢'}</span>
        <span style="flex:1;font-size:.75rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(item.label)}</span>
        <span class="pl-del" onclick="event.stopPropagation();Control.removePlItem(${i})">✕</span>
      </div>`).join('');
  }

  function playlistClick(idx) {
    S.playlist.forEach((p, i) => p._active = i === idx);
    const item = S.playlist[idx];
    if (item) setSelected(item.main || item.text || '', item.sub || item.label || '', item.bg || null);
    renderPlaylist();
  }

  function removePlItem(idx) { S.playlist.splice(idx, 1); renderPlaylist(); }
  function clearPlaylist() { if (confirm('Vider la playlist ?')) { S.playlist = []; renderPlaylist(); } }

  // ── BIBLES DOWNLOAD ───────────────────────────────────────────────────────
  async function renderBibleDlList() {
    const el = _el('bible-dl-list');
    if (!el) return;
    const installed = await DB.getAll('bibles');
    const instCodes = installed.map(b => b.code);
    el.innerHTML = BIBLE_SOURCES.map(b => {
      const ok = instCodes.includes(b.code);
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--bg2);border-radius:8px;margin-bottom:6px;border:1px solid ${ok?'var(--green)':'var(--border)'};">
        <div>
          <div style="font-size:.8rem;font-weight:600;">${b.name}</div>
          <div style="font-size:.65rem;color:var(--text2);">${b.lang.toUpperCase()} · ${b.code}${ok?' · ✅':''}</div>
        </div>
        <button id="dlbtn-${b.code}" onclick="Control.dlBible('${b.code}')"
          style="padding:5px 12px;border-radius:6px;border:none;background:${ok?'rgba(46,204,113,.2)':'var(--blue)'};color:${ok?'var(--green)':'#fff'};font-size:.7rem;font-weight:600;cursor:pointer;">
          ${ok ? '✅ OK' : '⬇ Installer'}
        </button>
      </div>`;
    }).join('');
  }

  async function dlBible(code) {
    const src = BIBLE_SOURCES.find(b => b.code === code);
    if (!src) return;
    const btn  = _el('dlbtn-' + code);
    const prog = _el('dl-prog');
    if (btn)  { btn.textContent = '⏳…'; btn.disabled = true; }
    if (prog) prog.style.width = '20%';
    toast(`Téléchargement ${src.name}…`, 'info');
    try {
      let r = await fetch(src.url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (prog) prog.style.width = '65%';
      const data = await r.json();
      if (prog) prog.style.width = '85%';
      // Construire index { 'Genèse 1:1': 'Au commencement…' }
      const index = {};
      if (Array.isArray(data)) {
        data.forEach((book, bi) => {
          const bn = BOOK_NAMES[bi] || ('Livre ' + (bi+1));
          const chaps = book.chapters || book;
          if (Array.isArray(chaps)) chaps.forEach((ch, ci) => {
            if (Array.isArray(ch)) ch.forEach((v, vi) => {
              index[`${bn} ${ci+1}:${vi+1}`] = v;
            });
          });
        });
      }
      if (!BIBLE_DATA[src.lang]) BIBLE_DATA[src.lang] = {};
      Object.assign(BIBLE_DATA[src.lang], index);
      await DB.put('bibles', { code, lang: src.lang, name: src.name, data: index });
      if (!S.currentBible) { S.currentBible = code; await DB.setSetting('currentBible', code); }
      if (prog) prog.style.width = '100%';
      setTimeout(() => { if (prog) prog.style.width = '0'; }, 1200);
      toast(src.name + ' installée ✅', 'success');
      renderBibleDlList();
      if (S.centerTab === 'verses') { S.chaptersOfBook = _countChapters(S.currentBook); loadChapter(S.currentBook, S.currentChapter); }
    } catch(e) {
      if (btn) { btn.textContent = '❌ Réessayer'; btn.disabled = false; }
      if (prog) prog.style.width = '0';
      toast('Erreur: ' + e.message, 'error');
    }
  }

  // ── FOND D'ÉCRAN ──────────────────────────────────────────────────────────
  const BG_PRESETS = [
    { label:'Noir',     mode:'black',    style:'background:#000' },
    { label:'Nuit',     mode:'gradient', style:'background:linear-gradient(135deg,#0f172a,#1e3a5f)' },
    { label:'Feu',      mode:'gradient', style:'background:linear-gradient(135deg,#7f1d1d,#dc2626)' },
    { label:'Forêt',    mode:'gradient', style:'background:linear-gradient(135deg,#064e3b,#059669)' },
    { label:'Or',       mode:'gradient', style:'background:linear-gradient(135deg,#78350f,#d97706)' },
    { label:'Royal',    mode:'gradient', style:'background:linear-gradient(135deg,#1e1b4b,#7c3aed)' },
    { label:'Aube',     mode:'gradient', style:'background:linear-gradient(135deg,#1c1917,#d97706,#f59e0b)' },
    { label:'Brume',    mode:'gradient', style:'background:linear-gradient(135deg,#1e293b,#475569)' },
  ];

  function renderBgPresets() {
    const el = _el('bg-presets');
    if (!el) return;
    el.innerHTML = BG_PRESETS.map((b, i) => `
      <div class="bg-swatch${S.bgMode===b.mode&&i===0?' active':''}" style="${b.style}" onclick="Control.setBgPreset(${i})" title="${b.label}">
        <div style="position:absolute;bottom:2px;left:0;right:0;text-align:center;font-size:.5rem;color:rgba(255,255,255,.6);">${b.label}</div>
      </div>`).join('');
  }

  function setBgPreset(idx) {
    const b = BG_PRESETS[idx];
    S.bgMode = b.mode;
    const bg = { mode: b.mode, gradient: b.style.replace('background:', '').trim() };
    WP.setBg(bg);
    if (window._WPDisplay) window._WPDisplay.setBg(bg);
    renderBgPresets();
  }

  function applyBgUrl() {
    const url = _el('bg-url-input')?.value.trim();
    if (!url) return;
    S.bgUrl  = url;
    S.bgMode = 'image';
    const bg = { mode: 'image', url };
    WP.setBg(bg);
    if (window._WPDisplay) window._WPDisplay.setBg(bg);
  }

  function setOverlay(val) {
    S.overlayOpacity = +val;
    WPCompositor.setStyle({ overlayOpacity: +val });
    if (S.preview) S.preview.setStyle({ overlayOpacity: +val });
    DB.setSetting('overlayOpacity', +val);
  }

  function setTransition(val) {
    S.transition = val;
    WPCompositor.setStyle({ transition: val });
    if (S.preview) S.preview.setStyle({ transition: val });
    DB.setSetting('transition', val);
  }

  // ── LOWER THIRD / OVERLAYS ────────────────────────────────────────────────
  function showLt() {
    const t = _el('lt-title')?.value.trim();
    const s = _el('lt-sub')?.value.trim();
    WP.showLt({ title: t, subtitle: s });
  }

  function showTag() {
    const label = _el('tag-input')?.value.trim();
    if (!label) return;
    WP.showTag(label);
  }

  function showAlert() {
    const text = _el('alert-input')?.value.trim();
    if (!text) return;
    WP.send({ type: 'alert', text });
  }

  function showLtBar() { switchCenterTab('lt'); }

  // ── MODALS ────────────────────────────────────────────────────────────────
  function openModal(id)  { _el(id)?.classList.add('open'); }
  function closeModal(id) { _el(id)?.classList.remove('open'); }

  // ── UTILS ─────────────────────────────────────────────────────────────────
  function _el(id) { return document.getElementById(id); }
  function _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function _escAttr(s) { return String(s).replace(/'/g,"&#39;").replace(/\n/g,'\\n'); }

  // ── API PUBLIQUE ──────────────────────────────────────────────────────────
  return {
    init, applyCode, showPairModal, copyDisplayUrl,
    switchSideTab, selectBook, selectChapter, loadChapter, selectVerse,
    onSearch, selectSearchResult,
    setSelected, projectCurrent, clear, logoAnim, navNext, navPrev,
    switchCenterTab,
    showAddSongModal, saveSong, renderSongsList, openSong, selectStrophe,
    showAddAnnounceModal, saveAnnounce, renderAnnouncesList, selectAnnounce,
    addToPlaylist, playlistClick, removePlItem, clearPlaylist, renderPlaylist,
    dlBible, renderBibleDlList,
    renderBgPresets, setBgPreset, applyBgUrl, setOverlay, setTransition,
    showLt, showTag, showAlert, showLtBar,
    openModal, closeModal,
    get BIBLE_DATA() { return BIBLE_DATA; },
  };

})();
