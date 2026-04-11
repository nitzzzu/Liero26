// Liero26 - Game Server
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const CONSTANTS = require('../shared/constants');
const { GameEngine } = require('../shared/engine');

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
    this.engine = new GameEngine();
    this.players = new Map();
    this.inputs = new Map();
    this.settings = {
      gameMode: settings.gameMode || CONSTANTS.MODE.DEATHMATCH,
      scoreLimit: settings.scoreLimit || CONSTANTS.DEFAULTS.SCORE_LIMIT,
      timeLimit: settings.timeLimit || CONSTANTS.DEFAULTS.TIME_LIMIT,
      ...settings,
    };
    this.engine.gameMode = this.settings.gameMode;
    this.engine.scoreLimit = this.settings.scoreLimit;
    this.engine.timeLimit = this.settings.timeLimit;
    this.engine.timeLeft = this.settings.timeLimit * CONSTANTS.TICK_RATE;
    this.engine.generateMap();
    this.running = false;
    this.interval = null;
    this.lastTick = Date.now();
    this.chatHistory = [];
  }

  addPlayer(ws, playerName) {
    const playerId = ws._playerId;
    const worm = this.engine.addWorm(playerId, playerName);
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
        health: worm.health, color: worm.color,
      },
    }, playerId);

    if (!this.running && this.players.size >= 1) {
      this.start();
    }
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
        this.engine.update(this.inputs);

        // Send state periodically
        if (this.engine.tick % CONSTANTS.NET.SNAPSHOT_RATE === 0) {
          const state = this.engine.getState();
          this.broadcast({ type: 'state', state });
        }

        // Send events immediately
        if (this.engine.events.length > 0) {
          this.broadcast({ type: 'events', events: this.engine.events });
        }

        // Handle map changes
        if (this.engine.tick % 10 === 0) {
          // Send map diff periodically (only changed areas)
        }

        // Game over handling
        if (this.engine.gameOver) {
          this.broadcast({ type: 'game_over', winner: this.engine.winner, state: this.engine.getState() });
          // Auto restart after 5 seconds
          setTimeout(() => this.restart(), 5000);
          this.running = false;
          clearInterval(this.interval);
          return;
        }
      }
    }, Math.floor(tickInterval / 2));
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
    this.engine.generateMap();

    // Re-add all players
    for (const [id, player] of this.players) {
      this.engine.addWorm(id, player.name);
      this.inputs.set(id, {
        left: false, right: false, up: false, down: false,
        fire: false, jump: false, change: false, dig: false,
      });
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
      const valid = weapons.every(w => w >= 0 && w < 40);
      if (valid) {
        worm.weapons = weapons;
        worm.initAmmo();
      }
    }
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

// Create default room
const defaultRoom = new Room(nextRoomId++, 'Main Arena', {
  gameMode: CONSTANTS.MODE.DEATHMATCH,
  scoreLimit: 15,
  timeLimit: 300,
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
    });
  }
  res.json(roomList);
});

app.post('/api/rooms', express.json(), (req, res) => {
  const { name, gameMode, scoreLimit, timeLimit } = req.body || {};
  const room = new Room(nextRoomId++, name || `Room ${nextRoomId}`, {
    gameMode: gameMode || 0,
    scoreLimit: scoreLimit || 15,
    timeLimit: timeLimit || 300,
  });
  rooms.set(room.id, room);
  res.json({ id: room.id, name: room.name });
});

// WebSocket handling
wss.on('connection', (ws) => {
  const playerId = nextPlayerId++;
  ws._playerId = playerId;
  ws._room = null;

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
          ws._room = room;
          const playerName = (msg.name || `Player ${playerId}`).substring(0, 20);
          room.addPlayer(ws, playerName);
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
        case 'create_room': {
          const newRoom = new Room(nextRoomId++, msg.name || `Room ${nextRoomId}`, {
            gameMode: msg.gameMode || 0,
            scoreLimit: msg.scoreLimit || 15,
            timeLimit: msg.timeLimit || 300,
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
            });
          }
          ws.send(JSON.stringify({ type: 'room_list', rooms: roomList }));
          break;
        }
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
    });
  }
  ws.send(JSON.stringify({ type: 'room_list', rooms: roomList }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Liero26 server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
