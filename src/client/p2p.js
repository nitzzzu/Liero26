// Liero26 - P2P Multiplayer (WebRTC DataChannels)
//
// P2PHost  — runs in the browser of the player who creates the room.
//            Executes the GameEngine loop and sends state to peers.
// P2PPeer  — runs in every other player's browser.
//            Receives state from the host and sends inputs back.
//
// Signaling is relayed through the existing WebSocket server (minimal traffic).

/* global CONSTANTS, GameEngine, Bot */

const P2P_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function p2pLog(...args) {
  console.log('[P2P]', ...args);
}

// ─── P2PHost ──────────────────────────────────────────────────────────────────

class P2PHost {
  constructor(gameClient) {
    this.client = gameClient;
    this.engine = null;
    this.inputs = new Map();      // peerId → input object
    this.peers = new Map();       // peerId → { pc, dc, name, character }
    this.botIds = new Set();
    this.pingTimers = new Map();
    this.interval = null;
    this.running = false;
    this.lastTick = 0;
    this.roomCode = null;
    this.settings = {};
    // Host is always player 1
    this.hostPlayerId = 1;
    this._nextPeerId = 2;
    this._nextBotId = -1;
  }

  // ── public API ──────────────────────────────────────────────────────────────

  create(settings) {
    this.settings = Object.assign({
      gameMode: CONSTANTS.MODE.DEATHMATCH,
      scoreLimit: 15,
      timeLimit: 300,
      goriness: 2,
      botCount: 0,
    }, settings);

    this._initEngine();

    // Add host worm
    const hostWorm = this.engine.addWorm(this.hostPlayerId, this.client.playerName);
    hostWorm.character = this.client.selectedCharacter;
    this.inputs.set(this.hostPlayerId, {
      left: false, right: false, up: false, down: false,
      fire: false, jump: false, change: false, dig: false,
    });

    // Add bots
    for (let i = 0; i < (this.settings.botCount || 0); i++) {
      this._addBot();
    }

    // Ask signaling server for a room code
    this.client.signalingWs.send(JSON.stringify({ type: 'p2p_host', settings: this.settings }));
  }

  // Called when signaling server confirms room code
  onRoomCode(code) {
    this.roomCode = code;
    p2pLog('Room created:', code);

    // Tell the local client it is now "in game" as host
    this._sendInitToSelf();
    this._start();
  }

  // Called when a peer requests to join (via signaling server)
  onPeerRequest(peerId, name, character) {
    if (this.peers.size >= CONSTANTS.NET.MAX_PLAYERS_PER_ROOM - 1) {
      p2pLog('Room full, rejecting peer', peerId);
      return;
    }
    p2pLog('Peer requesting join:', peerId, name);
    this._createPeerConnection(peerId, name, character);
  }

  // Called when signaling server relays an ICE candidate from a peer
  onPeerIce(peerId, candidate) {
    const peer = this.peers.get(peerId);
    if (peer && peer.pc) {
      peer.pc.addIceCandidate(candidate).catch(() => {});
    }
  }

  // Called when signaling server relays an SDP answer from a peer
  onPeerAnswer(peerId, sdp) {
    const peer = this.peers.get(peerId);
    if (peer && peer.pc) {
      peer.pc.setRemoteDescription({ type: 'answer', sdp }).catch((e) => {
        p2pLog('setRemoteDescription error', e);
      });
    }
  }

  // Update the host's own input (called every input change)
  updateInput(input) {
    const current = this.inputs.get(this.hostPlayerId);
    if (current) Object.assign(current, input);
  }

  // Send a chat message from the host
  sendChat(message) {
    const chatMsg = {
      type: 'chat',
      playerId: this.hostPlayerId,
      name: this.client.playerName,
      message: message.substring(0, 200),
      timestamp: Date.now(),
    };
    this._broadcastToPeers(chatMsg);
    this.client.handleMessage(chatMsg);
  }

  // Apply weapon selection for host
  applyWeapons(weapons) {
    const worm = this.engine.worms.get(this.hostPlayerId);
    if (worm && Array.isArray(weapons) && weapons.length === 5) {
      worm.weapons = weapons;
      worm.initAmmo();
    }
  }

  destroy() {
    this._stop();
    for (const [, peer] of this.peers) {
      try { peer.pc.close(); } catch (e) { /* ignore */ }
    }
    this.peers.clear();
    this.inputs.clear();
  }

  // ── private ─────────────────────────────────────────────────────────────────

  _initEngine() {
    this.engine = new GameEngine();
    this.engine.gameMode = this.settings.gameMode;
    this.engine.scoreLimit = this.settings.scoreLimit;
    this.engine.timeLimit = this.settings.timeLimit;
    this.engine.timeLeft = this.settings.timeLimit * CONSTANTS.TICK_RATE;
    this.engine.goriness = this.settings.goriness;
    this.engine.generateMap();
  }

  _addBot() {
    const botId = this._nextBotId--;
    const worm = new Bot(botId, `Bot ${-botId}`, 0, 0);
    const pos = this.engine.findSpawnPoint();
    worm.x = pos.x;
    worm.y = pos.y;
    worm.color = this.engine.worms.size % 6;
    this.engine.worms.set(botId, worm);
    this.inputs.set(botId, worm.botInput);
    this.botIds.add(botId);
  }

  _sendInitToSelf() {
    this.client.handleMessage({
      type: 'init',
      playerId: this.hostPlayerId,
      mapWidth: this.engine.mapWidth,
      mapHeight: this.engine.mapHeight,
      map: Array.from(this.engine.map),
      mapColors: Array.from(this.engine.mapColors),
      state: this.engine.getState(),
      settings: this.settings,
    });
    // Apply selected weapons
    setTimeout(() => {
      this.applyWeapons(this.client.selectedWeapons);
    }, 100);
  }

  _createPeerConnection(peerId, name, character) {
    const pc = new RTCPeerConnection({ iceServers: P2P_ICE_SERVERS });

    // Unreliable channel for game state / inputs (low latency)
    const dc = pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 });
    // Reliable channel for control messages (chat, init, game_over)
    const ctrl = pc.createDataChannel('ctrl', { ordered: true });

    this.peers.set(peerId, { pc, dc, ctrl, name, character, ready: false });

    dc.onopen = () => {
      p2pLog('Game channel open to peer', peerId);
    };

    ctrl.onopen = () => {
      p2pLog('Ctrl channel open to peer', peerId);
      const peer = this.peers.get(peerId);
      if (peer) peer.ready = true;
      this._onPeerReady(peerId, name, character);
    };

    // Receive messages from peer
    const handleData = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        this._onPeerData(peerId, msg);
      } catch (e) { /* ignore */ }
    };
    dc.onmessage = handleData;
    ctrl.onmessage = handleData;

    // ICE candidates
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.client.signalingWs.send(JSON.stringify({
          type: 'p2p_ice',
          peerId,
          candidate: ev.candidate,
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      p2pLog('Peer', peerId, 'connection state:', pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this._removePeer(peerId);
      }
    };

    // Create offer and send to peer via signaling
    pc.createOffer().then((offer) => {
      return pc.setLocalDescription(offer).then(() => {
        this.client.signalingWs.send(JSON.stringify({
          type: 'p2p_offer',
          peerId,
          sdp: offer.sdp,
        }));
      });
    }).catch((e) => p2pLog('createOffer error', e));
  }

  _onPeerReady(peerId, name, character) {
    // Add worm for this peer
    const worm = this.engine.addWorm(peerId, name);
    worm.character = character || 'Pink_Monster';
    this.inputs.set(peerId, {
      left: false, right: false, up: false, down: false,
      fire: false, jump: false, change: false, dig: false,
    });

    // Send full init to the new peer
    this._ctrlSendToPeer(peerId, {
      type: 'init',
      playerId: peerId,
      mapWidth: this.engine.mapWidth,
      mapHeight: this.engine.mapHeight,
      map: Array.from(this.engine.map),
      mapColors: Array.from(this.engine.mapColors),
      state: this.engine.getState(),
      settings: this.settings,
    });

    // Notify everyone (including host's own client)
    const joinMsg = {
      type: 'player_joined',
      playerId: peerId,
      name,
      worm: {
        id: worm.id, name: worm.name, x: worm.x, y: worm.y,
        health: worm.health, color: worm.color, character: worm.character,
      },
    };
    this._broadcastToPeers(joinMsg, peerId);
    this.client.handleMessage(joinMsg);
  }

  _removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    try { peer.pc.close(); } catch (e) { /* ignore */ }
    this.peers.delete(peerId);
    this.inputs.delete(peerId);
    this.engine.removeWorm(peerId);
    const leftMsg = { type: 'player_left', playerId: peerId };
    this._broadcastToPeers(leftMsg);
    this.client.handleMessage(leftMsg);
  }

  _onPeerData(peerId, msg) {
    switch (msg.type) {
      case 'input': {
        const current = this.inputs.get(peerId);
        if (current) Object.assign(current, msg.input);
        break;
      }
      case 'chat': {
        const peer = this.peers.get(peerId);
        const chatMsg = {
          type: 'chat',
          playerId: peerId,
          name: peer ? peer.name : `Player ${peerId}`,
          message: (msg.message || '').substring(0, 200),
          timestamp: Date.now(),
        };
        this._broadcastToPeers(chatMsg, peerId);
        this.client.handleMessage(chatMsg);
        break;
      }
      case 'weapons': {
        const worm = this.engine.worms.get(peerId);
        if (worm && Array.isArray(msg.weapons) && msg.weapons.length === 5) {
          worm.weapons = msg.weapons;
          worm.initAmmo();
        }
        break;
      }
      case 'pong': {
        const timer = this.pingTimers.get(peerId);
        if (timer) {
          const latency = Date.now() - msg.ts;
          this._ctrlSendToPeer(peerId, { type: 'latency', latency });
        }
        break;
      }
    }
  }

  _start() {
    if (this.running) return;
    this.running = true;
    this.lastTick = Date.now();
    const tickInterval = 1000 / CONSTANTS.TICK_RATE;
    let accumulator = 0;

    this.interval = setInterval(() => {
      const now = Date.now();
      accumulator += now - this.lastTick;
      this.lastTick = now;
      if (accumulator > 200) accumulator = 200;

      while (accumulator >= tickInterval) {
        accumulator -= tickInterval;

        // Update bot inputs
        for (const botId of this.botIds) {
          const bot = this.engine.worms.get(botId);
          if (bot && bot.isBot) {
            this.inputs.set(botId, bot.updateBotAI(this.engine));
          }
        }

        this.engine.update(this.inputs);

        // Map deltas
        if (this.engine.changedCells.length > 0) {
          const cells = this.engine.changedCells.map(idx => ({
            idx,
            mat: this.engine.map[idx],
            color: this.engine.mapColors[idx],
          }));
          const delta = { type: 'map_delta', cells };
          this._broadcastToPeers(delta);
          this.client.handleMessage(delta);
        }

        // State snapshot
        if (this.engine.tick % CONSTANTS.NET.SNAPSHOT_RATE === 0) {
          const stateMsg = { type: 'state', state: this.engine.getState() };
          this._broadcastToPeers(stateMsg);
          this.client.handleMessage(stateMsg);
        }

        // Events
        if (this.engine.events.length > 0) {
          const evMsg = { type: 'events', events: this.engine.events };
          this._broadcastToPeers(evMsg);
          this.client.handleMessage(evMsg);
        }

        // Ping peers
        if (this.engine.tick % (CONSTANTS.TICK_RATE * 2) === 0) {
          const pingTs = Date.now();
          for (const [pid] of this.peers) {
            this.pingTimers.set(pid, { sent: pingTs });
            this._ctrlSendToPeer(pid, { type: 'ping', ts: pingTs });
          }
        }

        // Game over
        if (this.engine.gameOver) {
          const overMsg = {
            type: 'game_over',
            winner: this.engine.winner,
            state: this.engine.getState(),
          };
          this._broadcastToPeers(overMsg);
          this.client.handleMessage(overMsg);
          this._stop();
          setTimeout(() => this._restart(), 8000);
          return;
        }
      }
    }, Math.floor(tickInterval / 2));
  }

  _stop() {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  _restart() {
    this._initEngine();

    // Re-add host worm
    const hostWorm = this.engine.addWorm(this.hostPlayerId, this.client.playerName);
    hostWorm.character = this.client.selectedCharacter;
    this.inputs.set(this.hostPlayerId, {
      left: false, right: false, up: false, down: false,
      fire: false, jump: false, change: false, dig: false,
    });
    this.applyWeapons(this.client.selectedWeapons);

    // Re-add peers
    for (const [pid, peer] of this.peers) {
      this.engine.addWorm(pid, peer.name);
      this.inputs.set(pid, {
        left: false, right: false, up: false, down: false,
        fire: false, jump: false, change: false, dig: false,
      });
    }

    // Re-add bots
    this.botIds.clear();
    for (let i = 0; i < (this.settings.botCount || 0); i++) {
      this._addBot();
    }

    const restartMsg = {
      type: 'restart',
      map: Array.from(this.engine.map),
      mapColors: Array.from(this.engine.mapColors),
      state: this.engine.getState(),
      settings: this.settings,
    };

    // Send personalised restart to each peer (with their own playerId)
    for (const [pid] of this.peers) {
      this._ctrlSendToPeer(pid, Object.assign({}, restartMsg, { playerId: pid }));
    }

    // Host's own client
    this.client.handleMessage(Object.assign({}, restartMsg, { playerId: this.hostPlayerId }));

    this._start();
  }

  // Send on reliable ctrl channel to one peer
  _ctrlSendToPeer(peerId, msg) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    const str = JSON.stringify(msg);
    try {
      if (peer.ctrl && peer.ctrl.readyState === 'open') peer.ctrl.send(str);
    } catch (e) { /* ignore */ }
  }

  // Broadcast on unreliable game channel to all peers (skip excludeId)
  _broadcastToPeers(msg, excludeId) {
    const str = JSON.stringify(msg);
    for (const [pid, peer] of this.peers) {
      if (pid === excludeId) continue;
      try {
        // Prefer game (unreliable) channel; fall back to ctrl
        if (peer.dc && peer.dc.readyState === 'open') {
          peer.dc.send(str);
        } else if (peer.ctrl && peer.ctrl.readyState === 'open') {
          peer.ctrl.send(str);
        }
      } catch (e) { /* ignore */ }
    }
  }
}

// ─── P2PPeer ──────────────────────────────────────────────────────────────────

class P2PPeer {
  constructor(gameClient) {
    this.client = gameClient;
    this.pc = null;
    this.dc = null;   // unreliable game channel
    this.ctrl = null; // reliable ctrl channel
    this.connected = false;
    this.playerId = null;
  }

  // ── public API ──────────────────────────────────────────────────────────────

  join(roomCode, name, character) {
    this.client.signalingWs.send(JSON.stringify({
      type: 'p2p_join',
      code: roomCode.toUpperCase(),
      name,
      character,
    }));
  }

  // Called when signaling server relays a WebRTC offer from the host
  onOffer(sdp) {
    const pc = new RTCPeerConnection({ iceServers: P2P_ICE_SERVERS });
    this.pc = pc;

    // ICE candidates
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.client.signalingWs.send(JSON.stringify({
          type: 'p2p_ice',
          candidate: ev.candidate,
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      p2pLog('Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        this.connected = true;
        p2pLog('Connected to host!');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.connected = false;
        this.client.addChatMessage('system', 'Lost connection to host.');
        this.client.showMenu();
      }
    };

    // Receive channels from host
    pc.ondatachannel = (ev) => {
      const ch = ev.channel;
      if (ch.label === 'game') {
        this.dc = ch;
        ch.onmessage = (e) => this._onData(e.data);
      } else if (ch.label === 'ctrl') {
        this.ctrl = ch;
        ch.onmessage = (e) => this._onData(e.data);
      }
    };

    pc.setRemoteDescription({ type: 'offer', sdp })
      .then(() => pc.createAnswer())
      .then((answer) => {
        return pc.setLocalDescription(answer).then(() => {
          this.client.signalingWs.send(JSON.stringify({
            type: 'p2p_answer',
            sdp: answer.sdp,
          }));
        });
      })
      .catch((e) => p2pLog('Answer error', e));
  }

  // Called when signaling server relays an ICE candidate from the host
  onIce(candidate) {
    if (this.pc) {
      this.pc.addIceCandidate(candidate).catch(() => {});
    }
  }

  // Send a message to the host (input, chat, etc.)
  sendToHost(msg) {
    const str = JSON.stringify(msg);
    try {
      if (msg.type === 'input' && this.dc && this.dc.readyState === 'open') {
        this.dc.send(str);
      } else if (this.ctrl && this.ctrl.readyState === 'open') {
        this.ctrl.send(str);
      }
    } catch (e) { /* ignore */ }
  }

  destroy() {
    try { if (this.pc) this.pc.close(); } catch (e) { /* ignore */ }
    this.pc = null;
    this.dc = null;
    this.ctrl = null;
    this.connected = false;
  }

  // ── private ─────────────────────────────────────────────────────────────────

  _onData(raw) {
    try {
      const msg = JSON.parse(raw);
      // Store our player ID from the init message
      if (msg.type === 'init') {
        this.playerId = msg.playerId;
        this.client.playerId = msg.playerId;
      }
      this.client.handleMessage(msg);
    } catch (e) { /* ignore */ }
  }
}
