/**
 * Guess the Shot — lightweight WebSocket relay for online 2-player rooms.
 * Run: npm install && npm start  (default port 8080)
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

/** @type {Map<string, { host: WebSocket, guest: WebSocket|null, state: object }>} */
const rooms = new Map();

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? genCode() : code;
}

function send(ws, type, payload = {}) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

function broadcastRoom(room, type, payload, excludeWs = null) {
  [room.host, room.guest].forEach((ws) => {
    if (ws && ws !== excludeWs) send(ws, type, payload);
  });
}

function getRoomByWs(ws) {
  for (const [code, room] of rooms) {
    if (room.host === ws || room.guest === ws) return { code, room };
  }
  return null;
}

function cleanupRoom(code) {
  rooms.delete(code);
}

const server = http.createServer((req, res) => {
  let filePath = path.join(ROOT, req.url === "/" ? "index.html" : req.url.split("?")[0]);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(ROOT, "index.html");
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  send(ws, "connected", { message: "Connected to Guess the Shot server" });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, "error", { message: "Invalid message" });
    }

    const { type } = msg;

    switch (type) {
      case "create_room": {
        const code = genCode();
        rooms.set(code, { host: ws, guest: null, state: null });
        ws.roomCode = code;
        ws.role = "host";
        send(ws, "room_created", { code });
        break;
      }

      case "join_room": {
        const code = (msg.code || "").toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) return send(ws, "error", { message: "Room not found" });
        if (room.guest) return send(ws, "error", { message: "Room is full" });
        room.guest = ws;
        ws.roomCode = code;
        ws.role = "guest";
        send(ws, "room_joined", { code, role: "guest" });
        send(room.host, "guest_joined", { code });
        break;
      }

      case "game_sync": {
        const found = getRoomByWs(ws);
        if (!found) return;
        broadcastRoom(found.room, "game_sync", { state: msg.state, from: ws.role }, ws);
        break;
      }

      case "action_ready": {
        const found = getRoomByWs(ws);
        if (!found) return;
        broadcastRoom(found.room, "action_ready", { role: ws.role, action: msg.action }, ws);
        break;
      }

      case "leave_room": {
        handleDisconnect(ws);
        break;
      }

      default:
        send(ws, "error", { message: "Unknown message type" });
    }
  });

  ws.on("close", () => handleDisconnect(ws));
});

function handleDisconnect(ws) {
  const found = getRoomByWs(ws);
  if (!found) return;
  const { code, room } = found;
  const peer = ws === room.host ? room.guest : room.host;
  send(peer, "peer_left", { message: "Opponent disconnected" });
  cleanupRoom(code);
}

server.listen(PORT, () => {
  console.log(`Guess the Shot server running at http://localhost:${PORT}`);
});
