const express = require('express');
const http    = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path    = require('path');
const fs      = require('fs');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// ── Rooms : Map<room, Set<WebSocket>> ──────────────────────────────────────
const rooms = new Map();
// ── Dernier payload par room (pour les nouveaux display) ───────────────────
const lastPayload = new Map();

function getRoomClients(room) {
  if (!rooms.has(room)) rooms.set(room, new Set());
  return rooms.get(room);
}

// ── WebSocket ──────────────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  let room = null;
  let role = null; // 'control' | 'display'

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // JOIN — premier message obligatoire
    if (msg.type === 'join') {
      room = String(msg.room || 'default').toUpperCase().slice(0, 20);
      role = msg.role === 'display' ? 'display' : 'control';
      ws._room = room;
      ws._role = role;
      getRoomClients(room).add(ws);

      // Envoyer le dernier état à un nouveau display
      if (role === 'display' && lastPayload.has(room)) {
        ws.send(JSON.stringify(lastPayload.get(room)));
      }

      // Confirmer la connexion
      ws.send(JSON.stringify({ type: 'joined', room, role, clients: getRoomClients(room).size }));

      // Informer la régie du nombre de displays
      broadcastToRole(room, 'control', { type: 'displays_count', count: countRole(room, 'display') });
      return;
    }

    if (!room) return;

    // PROJECTION → stocker + broadcaster à tous les displays de la room
    if (msg.type === 'project' || msg.type === 'clear' || msg.type === 'bg' || msg.type === 'lt' || msg.type === 'tag' || msg.type === 'logo_anim') {
      if (msg.type === 'project' || msg.type === 'clear' || msg.type === 'bg') {
        lastPayload.set(room, msg);
      }
      broadcastToRole(room, 'display', msg, ws);
    }
  });

  ws.on('close', () => {
    if (room) {
      getRoomClients(room).delete(ws);
      if (getRoomClients(room).size === 0) rooms.delete(room);
      else broadcastToRole(room, 'control', { type: 'displays_count', count: countRole(room, 'display') });
    }
  });

  ws.on('error', () => {});
});

function broadcastToRole(room, role, msg, exclude = null) {
  const clients = getRoomClients(room);
  const data = JSON.stringify(msg);
  clients.forEach(c => {
    if (c !== exclude && c._role === role && c.readyState === WebSocket.OPEN) {
      c.send(data);
    }
  });
}

function countRole(room, role) {
  let n = 0;
  getRoomClients(room).forEach(c => { if (c._role === role) n++; });
  return n;
}

// ── Ping anti-veille Render.com ────────────────────────────────────────────
setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  });
}, 25000);

// ── Servir le HTML ─────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/display', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
// Auto-ping endpoint pour UptimeRobot
app.get('/ping', (req, res) => res.json({ ok: true, rooms: rooms.size, clients: wss.clients.size }));

// ── Démarrage ──────────────────────────────────────────────────────────────
server.listen(PORT, () => console.log(`WisMach Server → http://localhost:${PORT}`));
