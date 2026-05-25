/**
 * WiseProjection — Serveur de Synchronisation Local
 * Wise Design © 2025 | WhatsApp: +240555445514
 *
 * Rôle : Orchestrateur WebSocket pour l'appairage et la diffusion
 *        en temps réel entre Régie (PC), Display (TV Box) et Télécommande (Phone)
 *
 * Stack : Node.js 18+ | Express | ws (WebSocket natif) | zlib
 * RAM   : < 64 Mo actif (Render.com free tier compatible)
 */

'use strict';

const express   = require('express');
const http      = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path      = require('path');
const crypto    = require('crypto');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server, maxPayload: 512 * 1024 }); // 512 KB max

const PORT = process.env.PORT || 3000;

// ══════════════════════════════════════════════════════════════════════════════
//  STRUCTURES DE DONNÉES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Map<pairCode, Room>
 * Room = {
 *   code       : string (6 chiffres)
 *   createdAt  : number
 *   clients    : Map<wsId, ClientMeta>
 *   lastState  : Object | null   ← dernier état projeté (pour rejoindre en cours)
 *   lastBg     : Object | null
 *   lastClear  : boolean
 * }
 */
const rooms = new Map();

/**
 * Map<WebSocket, ClientMeta>
 * ClientMeta = { id, room, role, label, joinedAt }
 */
const clients = new Map();

// ══════════════════════════════════════════════════════════════════════════════
//  UTILITAIRES
// ══════════════════════════════════════════════════════════════════════════════

function genCode() {
  // Code à 6 chiffres unique parmi les rooms actives
  let code;
  do { code = String(Math.floor(100000 + Math.random() * 900000)); }
  while (rooms.has(code));
  return code;
}

function genId() {
  return crypto.randomBytes(6).toString('hex');
}

function getOrCreateRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, {
      code,
      createdAt: Date.now(),
      clients: new Map(),
      lastState: null,
      lastBg: null,
      lastClear: false,
    });
  }
  return rooms.get(code);
}

function broadcast(room, msg, exclude = null, roleFilter = null) {
  const data = JSON.stringify(msg);
  room.clients.forEach((meta, ws) => {
    if (ws === exclude) return;
    if (roleFilter && meta.role !== roleFilter) return;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

function broadcastStats(room) {
  const stats = buildStats(room);
  broadcast(room, { type: 'room_stats', ...stats });
}

function buildStats(room) {
  const byRole = {};
  room.clients.forEach(meta => {
    byRole[meta.role] = (byRole[meta.role] || 0) + 1;
  });
  return {
    code     : room.code,
    total    : room.clients.size,
    byRole,
  };
}

function cleanupRooms() {
  const now = Date.now();
  rooms.forEach((room, code) => {
    // Supprimer les rooms vides depuis plus de 5 min
    if (room.clients.size === 0 && now - room.createdAt > 5 * 60 * 1000) {
      rooms.delete(code);
    }
  });
}
setInterval(cleanupRooms, 60_000);

// ══════════════════════════════════════════════════════════════════════════════
//  GESTIONNAIRE WEBSOCKET
// ══════════════════════════════════════════════════════════════════════════════

wss.on('connection', (ws, req) => {
  const wsId = genId();
  const ip   = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

  ws._id   = wsId;
  ws._room = null;

  // ── Heartbeat ──────────────────────────────────────────────────────────────
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // ── Réception des messages ─────────────────────────────────────────────────
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: 'error', code: 'INVALID_JSON' }));
      return;
    }

    handleMessage(ws, msg);
  });

  // ── Déconnexion ────────────────────────────────────────────────────────────
  ws.on('close', () => {
    const meta = clients.get(ws);
    if (meta) {
      const room = rooms.get(meta.room);
      if (room) {
        room.clients.delete(ws);
        broadcastStats(room);
        broadcast(room, {
          type  : 'peer_left',
          id    : wsId,
          role  : meta.role,
          label : meta.label,
        });
      }
      clients.delete(ws);
    }
  });

  ws.on('error', () => {});
});

// ── Heartbeat global ─────────────────────────────────────────────────────────
const heartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 20_000);
wss.on('close', () => clearInterval(heartbeat));

// ══════════════════════════════════════════════════════════════════════════════
//  ROUTEUR DE MESSAGES
// ══════════════════════════════════════════════════════════════════════════════

function handleMessage(ws, msg) {
  const { type } = msg;

  // ── JOIN ───────────────────────────────────────────────────────────────────
  if (type === 'join') {
    return handleJoin(ws, msg);
  }

  // Toutes les autres actions nécessitent d'être dans une room
  const meta = clients.get(ws);
  if (!meta) {
    ws.send(JSON.stringify({ type: 'error', code: 'NOT_JOINED' }));
    return;
  }
  const room = rooms.get(meta.room);
  if (!room) return;

  switch (type) {

    // ── PROJECTION (Régie → Displays) ───────────────────────────────────────
    case 'project':
      room.lastState  = msg;
      room.lastClear  = false;
      if (msg.bg) room.lastBg = msg.bg;
      broadcast(room, msg, ws, null); // tous sauf l'émetteur
      break;

    // ── CLEAR ────────────────────────────────────────────────────────────────
    case 'clear':
      room.lastClear = true;
      room.lastState = null;
      broadcast(room, msg, ws);
      break;

    // ── BACKGROUND ───────────────────────────────────────────────────────────
    case 'bg':
      room.lastBg = msg.bg;
      broadcast(room, msg, ws);
      break;

    // ── LOWER THIRD / TAG / LOGO ─────────────────────────────────────────────
    case 'lt':
    case 'tag':
    case 'logo_anim':
    case 'alert':
      broadcast(room, msg, ws);
      break;

    // ── NAVIGATION (télécommande → régie) ───────────────────────────────────
    case 'nav_next':
    case 'nav_prev':
    case 'nav_slide':
      broadcast(room, msg, ws, 'control'); // uniquement vers la régie
      break;

    // ── CAM / WEBRTC SIGNALING ───────────────────────────────────────────────
    case 'rtc_offer':
    case 'rtc_answer':
    case 'rtc_ice':
    case 'cam_stop':
      // Relay ciblé si to_id spécifié, sinon broadcast
      if (msg.to_id) {
        relayTo(room, msg.to_id, msg);
      } else {
        broadcast(room, msg, ws);
      }
      break;

    // ── PING applicatif ──────────────────────────────────────────────────────
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      break;

    // ── STATS ────────────────────────────────────────────────────────────────
    case 'get_stats':
      ws.send(JSON.stringify({ type: 'room_stats', ...buildStats(room) }));
      break;

    default:
      // Messages inconnus relayés tels quels (extensibilité)
      broadcast(room, msg, ws);
  }
}

// ── JOIN ──────────────────────────────────────────────────────────────────────
function handleJoin(ws, msg) {
  // Si déjà dans une room, quitter d'abord
  const existingMeta = clients.get(ws);
  if (existingMeta) {
    const oldRoom = rooms.get(existingMeta.room);
    if (oldRoom) {
      oldRoom.clients.delete(ws);
      broadcastStats(oldRoom);
    }
    clients.delete(ws);
  }

  // Valider/créer le code
  let code = String(msg.code || '').trim();
  const role  = ['control', 'display', 'remote', 'monitor'].includes(msg.role) ? msg.role : 'display';
  const label = String(msg.label || role).slice(0, 30);

  // Si pas de code ou code invalide → générer un nouveau (pour la régie)
  if (!/^\d{6}$/.test(code)) {
    if (role === 'control') {
      code = genCode();
    } else {
      ws.send(JSON.stringify({ type: 'error', code: 'INVALID_CODE', message: 'Code à 6 chiffres requis' }));
      return;
    }
  }

  const room = getOrCreateRoom(code);
  const meta = { id: ws._id, room: code, role, label, joinedAt: Date.now() };

  room.clients.set(ws, meta);
  clients.set(ws, meta);
  ws._room = code;

  // Confirmer la connexion
  ws.send(JSON.stringify({
    type    : 'joined',
    id      : ws._id,
    code,
    role,
    label,
    stats   : buildStats(room),
  }));

  // Envoyer le dernier état au nouveau display
  if (role === 'display' || role === 'monitor') {
    if (room.lastClear) {
      ws.send(JSON.stringify({ type: 'clear' }));
    } else if (room.lastState) {
      ws.send(JSON.stringify(room.lastState));
    }
    if (room.lastBg) {
      ws.send(JSON.stringify({ type: 'bg', bg: room.lastBg }));
    }
  }

  // Notifier les autres
  broadcastStats(room);
  broadcast(room, {
    type  : 'peer_joined',
    id    : ws._id,
    role,
    label,
  }, ws);
}

// ── Relay ciblé ───────────────────────────────────────────────────────────────
function relayTo(room, targetId, msg) {
  room.clients.forEach((meta, ws) => {
    if (meta.id === targetId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  HTTP
// ══════════════════════════════════════════════════════════════════════════════

app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: '1d',
  etag: true,
}));

// Health & stats
app.get('/ping', (req, res) => {
  res.json({
    ok      : true,
    uptime  : process.uptime(),
    rooms   : rooms.size,
    clients : wss.clients.size,
    memory  : process.memoryUsage().heapUsed,
  });
});

// Générer un code d'appairage via REST (optionnel)
app.post('/api/room/create', (req, res) => {
  const code = genCode();
  getOrCreateRoom(code);
  res.json({ code });
});

// Vérifier si un code existe
app.get('/api/room/:code', (req, res) => {
  const code = req.params.code;
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Invalid code' });
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ error: 'Not found' });
  res.json({ code, stats: buildStats(room) });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ══════════════════════════════════════════════════════════════════════════════
//  DÉMARRAGE
// ══════════════════════════════════════════════════════════════════════════════

server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  WiseProjection Server  —  Wise Design       ║`);
  console.log(`║  http://localhost:${PORT}                      ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);
});
