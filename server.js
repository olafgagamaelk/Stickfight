const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// ── HTTP server til at levere statiske filer ─────────────────
const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);

  // Sikkerhed: forhindre sti-traversal
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403);
    return res.end('403 Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('404 Not Found');
    } else {
      const ext = path.extname(filePath).toLowerCase();
      const mime = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
      }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    }
  });
});

// ── WebSocket server ────────────────────────────────────────
const wss = new WebSocketServer({ server });

// Lager af tilsluttede spillere (uden at flytte nogen fysisk)
const players = new Map(); // ws -> { id, color }

// Farve-rotator
const COLORS = [
  '#E74C3C', '#2ECC71', '#F39C12', '#9B59B6',
  '#1ABC9C', '#E67E22', '#3498DB', '#E91E63',
  '#00BCD4', '#FF5722', '#8BC34A', '#4A90D9'
];
let colorIndex = 0;

function assignColor() {
  const c = COLORS[colorIndex % COLORS.length];
  colorIndex++;
  return c;
}

function broadcast(message, excludeWs = null) {
  const data = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client !== excludeWs && client.readyState === 1) {
      client.send(data);
    }
  });
}

wss.on('connection', (ws) => {
  const playerId = 'player_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const playerColor = assignColor();

  players.set(ws, { id: playerId, color: playerColor });

  console.log(`➕ ${playerId} forbundet (farve: ${playerColor})`);

  // Velkomstbesked til den nye spiller
  ws.send(JSON.stringify({
    type: 'init',
    id: playerId,
    color: playerColor,
  }));

  // Fortæl alle andre at en ny spiller er kommet
  broadcast({
    type: 'playerJoined',
    id: playerId,
    color: playerColor,
  }, ws);

  // Send listen af eksisterende spillere til den nye
  players.forEach((data, client) => {
    if (client !== ws && client.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'playerJoined',
        id: data.id,
        color: data.color,
      }));
    }
  });

  // Modtag opdateringer fra klienten
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);

      switch (msg.type) {
        case 'update':
          // Videresend positioner til alle andre (ingen validering/ændring)
          broadcast({
            type: 'playerUpdate',
            id: playerId,
            parts: msg.parts,
          }, ws);
          break;

        case 'hit':
          // Send hit-besked direkte til den ramte spiller (via deres ws)
          if (msg.targetId) {
            for (const [client, data] of players) {
              if (data.id === msg.targetId && client.readyState === 1) {
                client.send(JSON.stringify({
                  type: 'hit',
                  targetId: msg.targetId,
                  impulse: msg.impulse,
                }));
                break;
              }
            }
          }
          break;
      }
    } catch (e) {
      console.error('Fejl ved parsing af besked:', e.message);
    }
  });

  ws.on('close', () => {
    console.log(`➖ ${playerId} afbrudt`);
    players.delete(ws);
    broadcast({
      type: 'playerLeft',
      id: playerId,
    });
  });

  ws.on('error', (err) => {
    console.error(`WebSocket fejl for ${playerId}:`, err.message);
    players.delete(ws);
    broadcast({ type: 'playerLeft', id: playerId });
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Ragdoll Fight kører på http://localhost:${PORT}`);
  console.log(`   WebSocket klar – server flytter IKKE spillere.`);
});
