// Liero26 - Game Server
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const CONSTANTS = require('../shared/constants');
const { GameEngine, Bot } = require('../shared/engine');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files
app.use(express.static(path.join(__dirname, '../../public')));

// Serve client scripts
app.use(express.static(path.join(__dirname, '../client')));

// Serve shared modules
app.use('/shared', express.static(path.join(__dirname, '../shared')));

// Room system
class Room {
  constructor(id, name, settings) {
    this.id = id;
    this.name = name;
    this.password = settings.password || null;
    this.engine = new GameEngine();
    this.players = new Map();
    this.inputs = new Map();
    this.settings = {
      gameMode: settings.gameMode || CONSTANTS.MODE.DEATHMATCH,
      scoreLimit: settings.scoreLimit || CONSTANTS.DEFAULTS.SCORE_LIMIT,
      timeLimit: settings.timeLimit || CONSTANTS.DEFAULTS.TIME_LIMIT,
      goriness: settings.goriness || CONSTANTS.DEFAULTS.GORINESS,
      ...settings,
    };
    this.engine.gameMode = this.settings.gameMode;
    this.engine.scoreLimit = this.settings.scoreLimit;
    this.engine.timeLimit = this.settings.timeLimit;
    this.engine.timeLeft = this.settings.timeLimit * CONSTANTS.TICK_RATE;
    this.engine.goriness = this.settings.goriness;
    this.engine.generateMap();
    this.running = false;
    this.interval = null;
    this.lastTick = Date.now();
    this.chatHistory = [];
    this.botIds = new Set();
    this.pingTimers = new Map(); // playerId -> { sent: timestamp, latency: ms }
    this.postRoundStats = null;
  }

  addPlayer(ws, playerName, character) {
    const playerId = ws._playerId;
    const worm = this.engine.addWorm(playerId, playerName);
    worm.character = character || 'Pink_Monster';
    this.players.set(playerId, { ws, name: playerName, spectating: false });
    this.inputs.set(playerId, {
      left: false, right: false, up: false, down: false,
      fire: false, jump: false, change: false, dig: false,
    });

    // Send full state to new player
    ws.send(JSON.stringify({
      type: 'init',
      playerId,
      mapWidth: this.engine.mapWidth,
      mapHeight: this.engine.mapHeight,
      map: Array.from(this.engine.map),
      mapColors: Array.from(this.engine.mapColors),
      state: this.engine.getState(),
      settings: this.settings,
    }));

    // Notify others
    this.broadcast({
      type: 'player_joined',
      playerId,
      name: playerName,
      worm: {
        id: worm.id, name: worm.name, x: worm.x, y: worm.y,
        health: worm.health, color: worm.color, character: worm.character,
      },
    }, playerId);

    if (!this.running && this.players.size >= 1) {
      this.start();
    }
  }

  addBot(botName) {
    const botId = -(nextBotId++);
    const worm = new Bot(botId, botName || `Bot ${-botId}`, 0, 0);
    const pos = this.engine.findSpawnPoint();
    worm.x = pos.x; worm.y = pos.y;
    worm.color = (this.engine.worms.size) % 6;
    this.engine.worms.set(botId, worm);
    this.inputs.set(botId, worm.botInput);
    this.botIds.add(botId);

    this.broadcast({
      type: 'player_joined',
      playerId: botId,
      name: worm.name,
      worm: { id: worm.id, name: worm.name, x: worm.x, y: worm.y, health: worm.health, color: worm.color, character: 'Dude_Monster' },
    });

    if (!this.running && this.players.size >= 1) this.start();
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    this.inputs.delete(playerId);
    this.engine.removeWorm(playerId);
    this.broadcast({ type: 'player_left', playerId });

    if (this.players.size === 0) {
      this.stop();
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTick = Date.now();

    const tickInterval = 1000 / CONSTANTS.TICK_RATE;
    let accumulator = 0;

    this.interval = setInterval(() => {
      const now = Date.now();
      accumulator += now - this.lastTick;
      this.lastTick = now;

      // Cap accumulator to avoid spiral of death
      if (accumulator > 200) accumulator = 200;

      while (accumulator >= tickInterval) {
        accumulator -= tickInterval;

        // Update bot inputs
        for (const botId of this.botIds) {
          const bot = this.engine.worms.get(botId);
          if (bot && bot.isBot) {
            const inp = bot.updateBotAI(this.engine);
            this.inputs.set(botId, inp);
          }
        }

        this.engine.update(this.inputs);

        // Send map deltas if any changed cells
        if (this.engine.changedCells.length > 0) {
          const cells = this.engine.changedCells.map(idx => ({
            idx,
            mat: this.engine.map[idx],
            color: this.engine.mapColors[idx],
          }));
          this.broadcast({ type: 'map_delta', cells });
        }

        // Send state periodically
        if (this.engine.tick % CONSTANTS.NET.SNAPSHOT_RATE === 0) {
          const state = this.engine.getState();
          this.broadcast({ type: 'state', state });
        }

        // Send events immediately
        if (this.engine.events.length > 0) {
          this.broadcast({ type: 'events', events: this.engine.events });
        }

        // Ping all players periodically
        if (this.engine.tick % (CONSTANTS.TICK_RATE * 2) === 0) {
          for (const [pid, player] of this.players) {
            try {
              if (player.ws.readyState === 1) {
                const pingTs = Date.now();
                this.pingTimers.set(pid, { sent: pingTs });
                player.ws.send(JSON.stringify({ type: 'ping', ts: pingTs }));
              }
            } catch (e) { /* ignore */ }
          }
        }

        // Game over handling
        if (this.engine.gameOver) {
          // Collect post-round stats
          this.postRoundStats = this._collectStats();
          this.broadcast({
            type: 'game_over',
            winner: this.engine.winner,
            state: this.engine.getState(),
            stats: this.postRoundStats,
          });
          // Auto restart after 8 seconds
          setTimeout(() => this.restart(), 8000);
          this.running = false;
          clearInterval(this.interval);
          return;
        }
      }
    }, Math.floor(tickInterval / 2));
  }

  _collectStats() {
    const stats = {};
    for (const [id, worm] of this.engine.worms) {
      if (this.botIds.has(id)) continue;
      let favWeapon = null;
      let favKills = 0;
      if (worm.weaponKills) {
        for (const [wid, kills] of Object.entries(worm.weaponKills)) {
          if (kills > favKills) { favKills = kills; favWeapon = parseInt(wid); }
        }
      }
      const WEAPONS = require('../shared/weapons');
      stats[id] = {
        name: worm.name,
        kills: worm.kills,
        deaths: worm.deaths,
        damageDealt: worm.totalDamageDealt || 0,
        shotsFired: worm.shotsFired || 0,
        shotsHit: worm.shotsHit || 0,
        accuracy: worm.shotsFired > 0 ? Math.round((worm.shotsHit / worm.shotsFired) * 100) : 0,
        favouriteWeapon: favWeapon !== null ? WEAPONS[favWeapon].name : 'N/A',
      };
    }
    return stats;
  }

  stop() {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  restart() {
    this.engine = new GameEngine();
    this.engine.gameMode = this.settings.gameMode;
    this.engine.scoreLimit = this.settings.scoreLimit;
    this.engine.timeLimit = this.settings.timeLimit;
    this.engine.timeLeft = this.settings.timeLimit * CONSTANTS.TICK_RATE;
    this.engine.goriness = this.settings.goriness;
    this.engine.generateMap();

    // Re-add all human players
    for (const [id, player] of this.players) {
      this.engine.addWorm(id, player.name);
      this.inputs.set(id, {
        left: false, right: false, up: false, down: false,
        fire: false, jump: false, change: false, dig: false,
      });
    }

    // Re-add bots
    this.botIds.clear();
    for (let i = 0; i < (this.settings.botCount || 0); i++) {
      this.addBot();
    }

    // Send new map to all
    for (const [id, player] of this.players) {
      try {
        player.ws.send(JSON.stringify({
          type: 'restart',
          playerId: id,
          map: Array.from(this.engine.map),
          mapColors: Array.from(this.engine.mapColors),
          state: this.engine.getState(),
          settings: this.settings,
        }));
      } catch (e) { /* player disconnected */ }
    }

    this.start();
  }

  handleInput(playerId, input) {
    const current = this.inputs.get(playerId);
    if (current) {
      Object.assign(current, input);
    }
  }

  handlePong(playerId, ts) {
    const timer = this.pingTimers.get(playerId);
    if (timer) {
      const latency = Date.now() - ts;
      timer.latency = latency;
      const player = this.players.get(playerId);
      if (player && player.ws.readyState === 1) {
        try {
          player.ws.send(JSON.stringify({ type: 'latency', latency }));
        } catch (e) { /* ignore */ }
      }
    }
  }

  handleChat(playerId, message) {
    const player = this.players.get(playerId);
    if (!player) return;
    const chatMsg = {
      type: 'chat',
      playerId,
      name: player.name,
      message: message.substring(0, 200), // Limit length
      timestamp: Date.now(),
    };
    this.chatHistory.push(chatMsg);
    if (this.chatHistory.length > 50) this.chatHistory.shift();
    this.broadcast(chatMsg);
  }

  handleWeaponSelect(playerId, weapons) {
    const worm = this.engine.worms.get(playerId);
    if (worm && Array.isArray(weapons) && weapons.length === 5) {
      // Validate weapon IDs
      const WEAPONS = require('../shared/weapons');
      const valid = weapons.every(w => w >= 0 && w < WEAPONS.length);
      if (valid) {
        worm.weapons = weapons;
        worm.initAmmo();
      }
    }
  }

  handleSpectate(playerId, spectating) {
    const player = this.players.get(playerId);
    const worm = this.engine.worms.get(playerId);
    if (player) player.spectating = spectating;
    if (worm) worm.spectating = spectating;
  }

  broadcast(data, excludeId) {
    const msg = JSON.stringify(data);
    for (const [id, player] of this.players) {
      if (id === excludeId) continue;
      try {
        if (player.ws.readyState === 1) {
          player.ws.send(msg);
        }
      } catch (e) { /* ignore */ }
    }
  }
}

// Room management
const rooms = new Map();
let nextPlayerId = 1;
let nextRoomId = 1;
let nextBotId = 1;

// ─── P2P Signaling ───────────────────────────────────────────────────────────
// p2pRooms: roomCode → { hostWs, peers: Map<peerId, ws> }
const p2pRooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function p2pSend(ws, msg) {
  try {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  } catch (e) { /* ignore */ }
}

function cleanupP2P(ws) {
  // Remove as host
  for (const [code, room] of p2pRooms) {
    if (room.hostWs === ws) {
      // Notify all peers that host left
      for (const [, peerWs] of room.peers) {
        p2pSend(peerWs, { type: 'p2p_host_left' });
      }
      p2pRooms.delete(code);
      return;
    }
    // Remove as peer
    for (const [peerId, peerWs] of room.peers) {
      if (peerWs === ws) {
        room.peers.delete(peerId);
        p2pSend(room.hostWs, { type: 'p2p_peer_left', peerId });
        return;
      }
    }
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// Create default room
const defaultRoom = new Room(nextRoomId++, 'Main Arena', {
  gameMode: CONSTANTS.MODE.DEATHMATCH,
  scoreLimit: 15,
  timeLimit: 300,
  goriness: 2,
});
rooms.set(defaultRoom.id, defaultRoom);

// REST API for room listing
app.get('/api/rooms', (req, res) => {
  const roomList = [];
  for (const [id, room] of rooms) {
    roomList.push({
      id,
      name: room.name,
      players: room.players.size,
      maxPlayers: CONSTANTS.NET.MAX_PLAYERS_PER_ROOM,
      gameMode: CONSTANTS.MODE_NAMES[room.settings.gameMode],
      running: room.running,
      hasPassword: !!room.password,
    });
  }
  res.json(roomList);
});

app.post('/api/rooms', express.json(), (req, res) => {
  const { name, gameMode, scoreLimit, timeLimit, password, goriness } = req.body || {};
  const room = new Room(nextRoomId++, name || `Room ${nextRoomId}`, {
    gameMode: gameMode || 0,
    scoreLimit: scoreLimit || 15,
    timeLimit: timeLimit || 300,
    password: password || null,
    goriness: goriness || 2,
  });
  rooms.set(room.id, room);
  res.json({ id: room.id, name: room.name });
});

// WebSocket handling
wss.on('connection', (ws) => {
  const playerId = nextPlayerId++;
  ws._playerId = playerId;
  ws._room = null;
  ws._lastRoom = null; // For reconnection

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      switch (msg.type) {
        case 'join': {
          const roomId = msg.roomId || 1;
          const room = rooms.get(roomId);
          if (!room) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
            return;
          }
          if (room.players.size >= CONSTANTS.NET.MAX_PLAYERS_PER_ROOM) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
            return;
          }
          // Password check
          if (room.password && msg.password !== room.password) {
            ws.send(JSON.stringify({ type: 'error', message: 'Incorrect password' }));
            return;
          }
          ws._room = room;
          ws._lastRoomId = roomId;
          ws._lastRoomPassword = msg.password || null;
          const playerName = (msg.name || `Player ${playerId}`).substring(0, 20);
          const character = msg.character || 'Pink_Monster';
          room.addPlayer(ws, playerName, character);
          break;
        }
        case 'rejoin': {
          // Reconnect to last room
          const roomId = msg.roomId || ws._lastRoomId;
          if (!roomId) {
            ws.send(JSON.stringify({ type: 'error', message: 'No room to rejoin' }));
            return;
          }
          const room = rooms.get(roomId);
          if (!room) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room no longer exists' }));
            return;
          }
          if (room.password && msg.password !== room.password) {
            ws.send(JSON.stringify({ type: 'error', message: 'Incorrect password' }));
            return;
          }
          ws._room = room;
          ws._lastRoomId = roomId;
          const playerName = (msg.name || `Player ${playerId}`).substring(0, 20);
          room.addPlayer(ws, playerName, msg.character || 'Pink_Monster');
          break;
        }
        case 'input': {
          if (ws._room) {
            ws._room.handleInput(playerId, msg.input);
          }
          break;
        }
        case 'chat': {
          if (ws._room) {
            ws._room.handleChat(playerId, msg.message || '');
          }
          break;
        }
        case 'weapons': {
          if (ws._room) {
            ws._room.handleWeaponSelect(playerId, msg.weapons);
          }
          break;
        }
        case 'spectate': {
          if (ws._room) {
            ws._room.handleSpectate(playerId, !!msg.spectating);
          }
          break;
        }
        case 'pong': {
          if (ws._room) {
            ws._room.handlePong(playerId, msg.ts);
          }
          break;
        }
        case 'add_bot': {
          if (ws._room) {
            ws._room.addBot(msg.name);
          }
          break;
        }
        case 'create_room': {
          const newRoom = new Room(nextRoomId++, msg.name || `Room ${nextRoomId}`, {
            gameMode: msg.gameMode || 0,
            scoreLimit: msg.scoreLimit || 15,
            timeLimit: msg.timeLimit || 300,
            password: msg.password || null,
            goriness: msg.goriness || 2,
          });
          rooms.set(newRoom.id, newRoom);
          ws.send(JSON.stringify({ type: 'room_created', roomId: newRoom.id, name: newRoom.name }));
          break;
        }
        case 'list_rooms': {
          const roomList = [];
          for (const [id, room] of rooms) {
            roomList.push({
              id, name: room.name, players: room.players.size,
              maxPlayers: CONSTANTS.NET.MAX_PLAYERS_PER_ROOM,
              gameMode: CONSTANTS.MODE_NAMES[room.settings.gameMode],
              running: room.running,
              hasPassword: !!room.password,
            });
          }
          ws.send(JSON.stringify({ type: 'room_list', rooms: roomList }));
          break;
        }

        // ── P2P Signaling ──────────────────────────────────────────────────
        case 'p2p_host': {
          // Host registers a new P2P room
          let code;
          do { code = generateRoomCode(); } while (p2pRooms.has(code));
          p2pRooms.set(code, { hostWs: ws, peers: new Map() });
          ws._p2pCode = code;
          ws._p2pRole = 'host';
          ws.send(JSON.stringify({ type: 'p2p_room_code', code }));
          break;
        }
        case 'p2p_join': {
          // Peer wants to join a P2P room
          const code = (msg.code || '').toUpperCase();
          const p2pRoom = p2pRooms.get(code);
          if (!p2pRoom) {
            ws.send(JSON.stringify({ type: 'error', message: 'P2P room not found' }));
            break;
          }
          const peerId = nextPlayerId++;
          p2pRoom.peers.set(peerId, ws);
          ws._p2pCode = code;
          ws._p2pRole = 'peer';
          ws._p2pId = peerId;
          // Notify host that a peer wants to connect
          p2pSend(p2pRoom.hostWs, {
            type: 'p2p_peer_request',
            peerId,
            name: (msg.name || `Player ${peerId}`).substring(0, 20),
            character: msg.character || 'Pink_Monster',
          });
          break;
        }
        case 'p2p_offer': {
          // Host sends WebRTC offer to a specific peer
          const p2pRoom = ws._p2pCode ? p2pRooms.get(ws._p2pCode) : null;
          if (!p2pRoom || ws._p2pRole !== 'host') break;
          const peerWs = p2pRoom.peers.get(msg.peerId);
          if (peerWs) {
            p2pSend(peerWs, { type: 'p2p_offer', sdp: msg.sdp });
          }
          break;
        }
        case 'p2p_answer': {
          // Peer sends WebRTC answer back to host
          const p2pRoom = ws._p2pCode ? p2pRooms.get(ws._p2pCode) : null;
          if (!p2pRoom || ws._p2pRole !== 'peer') break;
          p2pSend(p2pRoom.hostWs, { type: 'p2p_answer', peerId: ws._p2pId, sdp: msg.sdp });
          break;
        }
        case 'p2p_ice': {
          // Relay ICE candidate between host and peer
          const p2pRoom = ws._p2pCode ? p2pRooms.get(ws._p2pCode) : null;
          if (!p2pRoom) break;
          if (ws._p2pRole === 'host') {
            // Host → specific peer
            const peerWs = p2pRoom.peers.get(msg.peerId);
            if (peerWs) p2pSend(peerWs, { type: 'p2p_ice', candidate: msg.candidate });
          } else if (ws._p2pRole === 'peer') {
            // Peer → host
            p2pSend(p2pRoom.hostWs, { type: 'p2p_ice', peerId: ws._p2pId, candidate: msg.candidate });
          }
          break;
        }
        // ──────────────────────────────────────────────────────────────────
      }
    } catch (e) {
      console.error('Message parse error:', e.message);
    }
  });

  ws.on('close', () => {
    if (ws._room) {
      ws._room.removePlayer(playerId);
      ws._room = null;
    }
    cleanupP2P(ws);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });

  // Send room list on connect
  const roomList = [];
  for (const [id, room] of rooms) {
    roomList.push({
      id, name: room.name, players: room.players.size,
      maxPlayers: CONSTANTS.NET.MAX_PLAYERS_PER_ROOM,
      gameMode: CONSTANTS.MODE_NAMES[room.settings.gameMode],
      hasPassword: !!room.password,
    });
  }
  ws.send(JSON.stringify({ type: 'room_list', rooms: roomList }));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Liero26 server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
