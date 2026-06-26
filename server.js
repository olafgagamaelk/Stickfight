const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const players = {};
let currentMapIndex = 0;
const MAP_COUNT = 3;
const MAX_HEALTH = 100;

function broadcastScores() {
  const scoreList = Object.values(players).map(p => ({
    id: p.id,
    kills: p.kills,
    deaths: p.deaths,
  }));
  io.to('game').emit('scoreUpdate', scoreList);
}

io.on('connection', (socket) => {
  console.log(`Spiller tilsluttet: ${socket.id}`);

  players[socket.id] = {
    id: socket.id,
    health: MAX_HEALTH,
    kills: 0,
    deaths: 0,
    alive: true,
  };

  socket.join('game');

  socket.emit('init', {
    id: socket.id,
    mapIndex: currentMapIndex,
    players: Object.values(players).map(p => ({
      id: p.id,
      health: p.health,
      kills: p.kills,
      deaths: p.deaths,
    })),
  });

  socket.to('game').emit('playerJoined', {
    id: socket.id,
    health: MAX_HEALTH,
    kills: 0,
    deaths: 0,
  });
  broadcastScores();

  // Spiller sender sin ragdoll-tilstand (kun torso data + action)
  socket.on('playerUpdate', (data) => {
    socket.to('game').emit('playerMoved', {
      id: socket.id,
      torso: data.torso,          // { x, y, angle, vx, vy }
      action: data.action,        // 'idle','dashing','shooting'
      aimAngle: data.aimAngle,
    });
  });

  socket.on('shoot', (data) => {
    socket.to('game').emit('playerShoot', {
      id: socket.id,
      originX: data.originX,
      originY: data.originY,
      angle: data.angle,
      weaponType: data.weaponType,
    });
  });

  socket.on('hit', (data) => {
    const targetId = data.targetId;
    const shooterId = socket.id;
    const damage = data.damage;

    if (!players[targetId] || players[targetId].health <= 0) return;

    players[targetId].health -= damage;
    io.to(targetId).emit('healthUpdate', { health: players[targetId].health });

    if (players[targetId].health <= 0) {
      players[targetId].alive = false;
      players[targetId].deaths += 1;
      if (players[shooterId]) {
        players[shooterId].kills += 1;
      }
      io.to('game').emit('playerDied', { targetId, killerId: shooterId });
      broadcastScores();
    }
  });

  socket.on('respawn', () => {
    if (!players[socket.id]) return;
    players[socket.id].health = MAX_HEALTH;
    players[socket.id].alive = true;
    io.to('game').emit('playerRespawned', { id: socket.id, health: MAX_HEALTH });
  });

  socket.on('disconnect', () => {
    console.log(`Spiller afbrudt: ${socket.id}`);
    delete players[socket.id];
    io.to('game').emit('playerDisconnected', { id: socket.id });
    broadcastScores();
  });
});

setInterval(() => {
  currentMapIndex = (currentMapIndex + 1) % MAP_COUNT;
  io.to('game').emit('mapChange', { mapIndex: currentMapIndex });
}, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server kører på port ${PORT}`));
