// Liero26 - Client Game
// Main client application handling networking, input, and game loop

class LieroClient {
  constructor() {
    this.ws = null;
    this.renderer = null;
    this.sound = new SoundEngine();
    this.playerId = null;
    this.playerName = '';
    this.state = null;
    this.map = null;
    this.mapColors = null;
    this.connected = false;
    this.inGame = false;
    this.rooms = [];
    this.currentRoomId = null;
    this.currentRoomPassword = null;

    // Input state
    this.keys = {};
    this.input = {
      left: false, right: false, up: false, down: false,
      fire: false, jump: false, change: false, dig: false,
    };
    this.inputChanged = false;

    // Key bindings (default WebLiero-style)
    this.bindings = {
      'ArrowLeft': 'left',
      'ArrowRight': 'right',
      'ArrowUp': 'up',
      'ArrowDown': 'down',
      'KeyD': 'fire',
      'KeyS': 'jump',
      'KeyA': 'change',
      'KeyC': 'dig',
    };

    // Client-side particles (visual only)
    window._particles = [];

    // Chat
    this.chatMessages = [];
    this.chatOpen = false;
    this.chatInput = '';

    // Weapon selection
    this.selectedWeapons = [0, 3, 10, 14, 28]; // Default loadout
    this.weaponSelectOpen = false;
    this.weaponSelectSlot = 0;

    // Character selection
    this.selectedCharacter = localStorage.getItem('liero_character') || 'Pink_Monster';
    this.availableCharacters = ['Pink_Monster', 'Dude_Monster', 'Owlet_Monster'];
    this.showCharacterSelect = false;

    // Tab scoreboard
    this.showScoreboard = false;

    // Spectator mode
    this.spectating = false;
    this.spectateTarget = null;

    // Ping / latency
    this.latency = 0;

    // Kill streaks
    this.streakMessages = []; // { text, timer }

    // Damage numbers (floating text)
    this.damageNumbers = []; // { x, y, value, timer, vy }

    // Countdown
    this.countdownValue = 0;

    // Post-round stats
    this.postRoundStats = null;
    this.showPostRoundStats = false;

    // Reconnect info
    this._lastRoomId = null;
    this._lastRoomPassword = null;
    this._reconnectAttempts = 0;

    // UI state
    this.screen = 'menu'; // 'menu', 'lobby', 'character', 'weapons', 'game'
  }

  init() {
    // Set up canvas
    const canvas = document.getElementById('game-canvas');
    this.renderer = new Renderer(canvas);

    // Set up input
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('keyup', (e) => this.onKeyUp(e));
    this.initTouchControls();

    // Show menu
    this.showMenu();

    // Start render loop
    this.renderLoop();
  }

  showMenu() {
    this.screen = 'menu';
    document.getElementById('menu-screen').style.display = 'flex';
    document.getElementById('game-screen').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('weapon-screen').style.display = 'none';
    document.getElementById('character-screen').style.display = 'none';
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.host}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.connected = true;
      this._reconnectAttempts = 0;
      console.log('Connected to server');
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      this.handleMessage(msg);
    };

    this.ws.onclose = () => {
      this.connected = false;
      console.log('Disconnected');
      // Auto-reconnect if we were in a game
      if (this.screen === 'game' && this._lastRoomId && this._reconnectAttempts < 5) {
        this._reconnectAttempts++;
        this.addChatMessage('system', `Disconnected. Reconnecting... (${this._reconnectAttempts}/5)`);
        setTimeout(() => this._attemptReconnect(), 2000 * this._reconnectAttempts);
      } else if (this.screen === 'game') {
        this.showMenu();
      }
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket error');
    };
  }

  _attemptReconnect() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.host}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.connected = true;
      this._reconnectAttempts = 0;
      // Rejoin last room
      this.ws.send(JSON.stringify({
        type: 'rejoin',
        roomId: this._lastRoomId,
        name: this.playerName,
        character: this.selectedCharacter,
        password: this._lastRoomPassword,
      }));
      // Resend weapons
      setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'weapons', weapons: this.selectedWeapons }));
        }
      }, 300);
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      this.handleMessage(msg);
    };

    this.ws.onclose = () => {
      this.connected = false;
      if (this._lastRoomId && this._reconnectAttempts < 5) {
        this._reconnectAttempts++;
        setTimeout(() => this._attemptReconnect(), 2000 * this._reconnectAttempts);
      } else {
        this.showMenu();
      }
    };

    this.ws.onerror = () => {};
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'room_list':
        this.rooms = msg.rooms;
        this.updateLobby();
        break;

      case 'init':
        this.playerId = msg.playerId;
        this.map = new Uint8Array(msg.map);
        this.mapColors = new Uint8Array(msg.mapColors);
        this.state = msg.state;
        this.renderer.gameWidth = msg.mapWidth;
        this.renderer.gameHeight = msg.mapHeight;
        this.renderer.imageData = this.renderer.bufCtx.createImageData(msg.mapWidth, msg.mapHeight);
        this.renderer.pixels = new Uint32Array(this.renderer.imageData.data.buffer);
        this.renderer.buffer.width = msg.mapWidth;
        this.renderer.buffer.height = msg.mapHeight;
        this.inGame = true;
        this.screen = 'game';
        this.postRoundStats = null;
        this.showPostRoundStats = false;
        this.streakMessages = [];
        this.damageNumbers = [];
        document.getElementById('menu-screen').style.display = 'none';
        document.getElementById('lobby-screen').style.display = 'none';
        document.getElementById('weapon-screen').style.display = 'none';
        document.getElementById('character-screen').style.display = 'none';
        document.getElementById('game-screen').style.display = 'block';
        this.sound.init();
        this.sound.play('begin');
        this.sound.startMusic('/music.mid');
        break;

      case 'state':
        this.state = msg.state;
        // Update countdown
        if (msg.state.countdown !== undefined) {
          this.countdownValue = msg.state.countdown;
        }
        break;

      case 'map_delta':
        // Apply terrain changes
        if (this.map && msg.cells) {
          for (const cell of msg.cells) {
            this.map[cell.idx] = cell.mat;
            this.mapColors[cell.idx] = cell.color;
          }
        }
        break;

      case 'events':
        this.handleEvents(msg.events);
        break;

      case 'player_joined':
        if (this.state && this.state.worms) {
          this.state.worms[msg.playerId] = msg.worm;
        }
        this.addChatMessage('system', `${msg.name} joined the game`);
        break;

      case 'player_left':
        if (this.state && this.state.worms) {
          delete this.state.worms[msg.playerId];
        }
        this.addChatMessage('system', `Player left the game`);
        break;

      case 'chat':
        this.addChatMessage(msg.name, msg.message);
        break;

      case 'restart':
        this.map = new Uint8Array(msg.map);
        this.mapColors = new Uint8Array(msg.mapColors);
        this.state = msg.state;
        this.renderer.explosions = [];
        window._particles = [];
        this.postRoundStats = null;
        this.showPostRoundStats = false;
        this.streakMessages = [];
        this.damageNumbers = [];
        this.addChatMessage('system', 'New match started!');
        this.sound.play('begin');
        break;

      case 'game_over':
        this.state = msg.state || this.state;
        if (msg.stats) {
          this.postRoundStats = msg.stats;
          // Show stats after a short delay
          setTimeout(() => { this.showPostRoundStats = true; }, 2000);
        }
        break;

      case 'room_created':
        this.send({ type: 'list_rooms' });
        break;

      case 'ping':
        // Respond immediately
        this.send({ type: 'pong', ts: msg.ts });
        break;

      case 'latency':
        this.latency = msg.latency;
        break;

      case 'error':
        alert(msg.message);
        break;
    }
  }

  handleEvents(events) {
    if (!events) return;
    const localWorm = this.state && this.state.worms ? this.state.worms[this.playerId] : null;
    const lx = localWorm ? localWorm.x : 0;
    const ly = localWorm ? localWorm.y : 0;

    for (const event of events) {
      switch (event.type) {
        case 'sound':
          this.sound.play(event.sound, event.x, event.y, lx, ly);
          break;
        case 'explosion':
          this.renderer.addExplosion(event.x, event.y, event.radius);
          // Update local map (destroy terrain)
          if (this.map) {
            const r = event.radius;
            for (let dy = -r; dy <= r; dy++) {
              for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy <= r * r) {
                  const px = Math.floor(event.x + dx);
                  const py = Math.floor(event.y + dy);
                  if (px > 1 && px < this.renderer.gameWidth - 2 &&
                      py > 1 && py < this.renderer.gameHeight - 2) {
                    const idx = py * this.renderer.gameWidth + px;
                    const mat = this.map[idx];
                    if (mat !== 0 && mat !== 4 && mat !== 9 && mat !== 32) {
                      this.map[idx] = 0;
                      this.mapColors[idx] = 0;
                    }
                  }
                }
              }
            }
          }
          break;
        case 'kill': {
          if (this.state && this.state.worms) {
            const killer = this.state.worms[event.killerId];
            const victim = this.state.worms[event.victimId];
            if (killer && victim) {
              const weapName = event.weaponId >= 0 && WEAPONS[event.weaponId] ? ` [${WEAPONS[event.weaponId].name}]` : '';
              if (event.killerId === event.victimId) {
                this.addChatMessage('system', `${victim.name} committed suicide`);
              } else {
                this.addChatMessage('system', `${killer.name} killed ${victim.name}${weapName}`);
              }
            }
            // Screen blood splat if local player was killed
            if (event.victimId === this.playerId) {
              this.renderer.triggerBloodSplat(0.6);
            }
          }
          break;
        }
        case 'damage': {
          if (this.state && this.state.worms) {
            const target = this.state.worms[event.targetId];
            if (target) {
              // Blood particles
              const bloodCount = Math.min(Math.ceil(event.damage * 1.5), 12);
              for (let i = 0; i < bloodCount; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 0.3 + Math.random() * 1.5;
                window._particles.push({
                  x: target.x, y: target.y,
                  vx: Math.cos(angle) * speed,
                  vy: Math.sin(angle) * speed,
                  color: 80 + Math.floor(Math.random() * 8),
                  life: Math.ceil((30 + Math.floor(Math.random() * 20)) * 1.5),
                  gravity: 0.015,
                  active: true,
                  bounce: 0,
                  size: 1,
                });
              }
              // Floating damage number
              this.damageNumbers.push({
                x: target.x,
                y: target.y - 5,
                value: event.damage,
                vy: -0.8,
                timer: 50,
              });
              // Screen blood splat on heavy damage to local player
              if (event.targetId === this.playerId && event.damage >= 10) {
                const intensity = Math.min(event.damage / 50, 0.5);
                this.renderer.triggerBloodSplat(intensity);
              }
            }
          }
          break;
        }
        case 'streak': {
          if (event.playerId === this.playerId || (this.state && this.state.worms && this.state.worms[event.playerId])) {
            const worm = this.state && this.state.worms ? this.state.worms[event.playerId] : null;
            const name = worm ? worm.name : 'Player';
            this.streakMessages.push({
              text: event.text,
              name: name,
              timer: 120,
              isLocal: event.playerId === this.playerId,
            });
          }
          break;
        }
        case 'countdown_done':
          this.countdownValue = 0;
          break;
        case 'chain_lightning':
          this.renderer.addChainLightning(event.fromX, event.fromY, event.toX, event.toY);
          break;
        case 'teleport':
          // Flash effect
          break;
        case 'frozen':
          break;
      }
    }
  }

  onKeyDown(e) {
    // Let the browser handle typing in any text input normally
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    if (this.chatOpen) {
      if (e.key === 'Enter') {
        if (this.chatInput.trim()) {
          this.send({ type: 'chat', message: this.chatInput.trim() });
        }
        this.chatOpen = false;
        this.chatInput = '';
        this.updateChatUI();
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        this.chatOpen = false;
        this.chatInput = '';
        this.updateChatUI();
        e.preventDefault();
        return;
      }
      if (e.key === 'Backspace') {
        this.chatInput = this.chatInput.slice(0, -1);
        this.updateChatUI();
        e.preventDefault();
        return;
      }
      if (e.key.length === 1) {
        this.chatInput += e.key;
        this.updateChatUI();
        e.preventDefault();
        return;
      }
      return;
    }

    if (e.key === 'Enter' && this.screen === 'game') {
      this.chatOpen = true;
      this.updateChatUI();
      e.preventDefault();
      return;
    }

    if (e.key === 'Tab') {
      this.showScoreboard = true;
      e.preventDefault();
      return;
    }

    if (e.key === 'Escape') {
      if (this.screen === 'game' && this.showPostRoundStats) {
        this.showPostRoundStats = false;
      }
      return;
    }

    this.keys[e.code] = true;
    this.updateInput();
    e.preventDefault();
  }

  onKeyUp(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    if (e.key === 'Tab') {
      this.showScoreboard = false;
      e.preventDefault();
      return;
    }

    this.keys[e.code] = false;
    this.updateInput();
    e.preventDefault();
  }

  updateInput() {
    const newInput = {
      left: false, right: false, up: false, down: false,
      fire: false, jump: false, change: false, dig: false,
    };

    for (const [code, action] of Object.entries(this.bindings)) {
      if (this.keys[code]) newInput[action] = true;
    }

    // Merge touch state
    if (this.touchState) {
      for (const action of Object.keys(newInput)) {
        if (this.touchState[action]) newInput[action] = true;
      }
    }

    // Check if changed
    let changed = false;
    for (const key of Object.keys(newInput)) {
      if (newInput[key] !== this.input[key]) { changed = true; break; }
    }

    if (changed) {
      this.input = newInput;
      this.send({ type: 'input', input: this.input });
    }
  }

  initTouchControls() {
    this.touchState = {};
    const controls = document.getElementById('touch-controls');
    if (!controls) return;

    // Only show on actual touch devices
    if (!('ontouchstart' in window) && !navigator.maxTouchPoints) return;
    controls.style.display = 'flex';

    controls.querySelectorAll('[data-action]').forEach(btn => {
      const action = btn.dataset.action;
      // Rope button activates both 'change' and 'jump' simultaneously
      const ropeActions = action === 'rope' ? ['change', 'jump'] : [action];

      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        ropeActions.forEach(a => { this.touchState[a] = true; });
        if (action === 'fire' && navigator.vibrate) navigator.vibrate(40);
        this.updateInput();
      }, { passive: false });
      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        ropeActions.forEach(a => { this.touchState[a] = false; });
        this.updateInput();
      }, { passive: false });
      btn.addEventListener('touchcancel', () => {
        ropeActions.forEach(a => { this.touchState[a] = false; });
        this.updateInput();
      });
    });
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // Lobby UI
  showLobby() {
    this.screen = 'lobby';
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'flex';
    document.getElementById('game-screen').style.display = 'none';
    document.getElementById('weapon-screen').style.display = 'none';
    document.getElementById('character-screen').style.display = 'none';
    this.send({ type: 'list_rooms' });
  }

  updateLobby() {
    const roomList = document.getElementById('room-list');
    if (!roomList) return;
    roomList.innerHTML = '';

    for (const room of this.rooms) {
      const div = document.createElement('div');
      div.className = 'room-item';

      const nameDiv = document.createElement('div');
      nameDiv.className = 'room-name';
      nameDiv.textContent = room.name + (room.hasPassword ? ' 🔒' : '');

      const infoDiv = document.createElement('div');
      infoDiv.className = 'room-info';
      infoDiv.textContent = `${room.gameMode} · ${room.players}/${room.maxPlayers} players`;

      const joinBtn = document.createElement('button');
      joinBtn.className = 'btn btn-join';
      joinBtn.textContent = 'JOIN';
      const roomId = room.id;
      const hasPass = room.hasPassword;
      joinBtn.addEventListener('click', () => {
        if (hasPass) {
          const pw = prompt('Enter room password:');
          if (pw !== null) client.joinRoom(roomId, pw);
        } else {
          client.joinRoom(roomId, null);
        }
      });

      div.appendChild(nameDiv);
      div.appendChild(infoDiv);
      div.appendChild(joinBtn);
      roomList.appendChild(div);
    }
  }

  joinRoom(roomId, password) {
    this.currentRoomId = roomId;
    this.currentRoomPassword = password;
    this._lastRoomId = roomId;
    this._lastRoomPassword = password;
    this.showCharacterSelectScreen();
  }

  showCharacterSelectScreen() {
    this.screen = 'character';
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'none';
    document.getElementById('weapon-screen').style.display = 'none';
    document.getElementById('character-screen').style.display = 'flex';
    this.renderCharacterSelect();
  }

  renderCharacterSelect() {
    const container = document.getElementById('character-list');
    if (!container) return;
    container.innerHTML = '';

    for (const char of this.availableCharacters) {
      const div = document.createElement('div');
      div.className = 'character-item' + (char === this.selectedCharacter ? ' character-selected' : '');

      const img = document.createElement('img');
      img.src = `/sprites/${char}/${char}_Idle_4.png`;
      img.alt = char;
      img.className = 'character-thumb';
      img.onerror = () => { img.style.display = 'none'; };

      const nameDiv = document.createElement('div');
      nameDiv.className = 'character-name';
      nameDiv.textContent = char.replace(/_/g, ' ');

      div.appendChild(img);
      div.appendChild(nameDiv);

      const charName = char;
      div.onclick = () => {
        this.selectedCharacter = charName;
        localStorage.setItem('liero_character', charName);
        this.renderCharacterSelect();
      };
      container.appendChild(div);
    }
  }

  showWeaponSelect() {
    this.screen = 'weapons';
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('character-screen').style.display = 'none';
    document.getElementById('weapon-screen').style.display = 'flex';
    document.getElementById('game-screen').style.display = 'none';
    this.renderWeaponSelect();
  }

  renderWeaponSelect() {
    const container = document.getElementById('weapon-list');
    if (!container) return;
    container.innerHTML = '';

    // Selected weapons display
    const selectedDiv = document.getElementById('selected-weapons');
    if (selectedDiv) {
      selectedDiv.innerHTML = '';
      const header = document.createElement('h3');
      header.textContent = 'YOUR LOADOUT:';
      selectedDiv.appendChild(header);
      for (let i = 0; i < 5; i++) {
        const w = WEAPONS[this.selectedWeapons[i]];
        const div = document.createElement('div');
        div.className = 'selected-weapon-item';
        const slotSpan = document.createElement('span');
        slotSpan.className = 'slot-num';
        slotSpan.textContent = `${i + 1}.`;
        div.appendChild(slotSpan);
        div.appendChild(document.createTextNode(' ' + w.name));
        const slotIdx = i;
        div.onclick = () => {
          this.weaponSelectSlot = slotIdx;
          this.renderWeaponSelect();
        };
        if (i === this.weaponSelectSlot) div.classList.add('active-slot');
        selectedDiv.appendChild(div);
      }
    }

    // All weapons grid
    for (const w of WEAPONS) {
      const div = document.createElement('div');
      div.className = 'weapon-item';
      const isSelected = this.selectedWeapons.includes(w.id);
      if (isSelected) div.classList.add('weapon-selected');

      const nameDiv = document.createElement('div');
      nameDiv.className = 'weapon-name';
      nameDiv.textContent = w.name;
      div.appendChild(nameDiv);

      const statsDiv = document.createElement('div');
      statsDiv.className = 'weapon-stats';
      const dmgSpan = document.createElement('span');
      dmgSpan.textContent = `DMG:${w.hitDamage}`;
      const spdSpan = document.createElement('span');
      spdSpan.textContent = `SPD:${Math.floor(w.speed / 10)}`;
      const amoSpan = document.createElement('span');
      amoSpan.textContent = `AMO:${w.ammo}`;
      statsDiv.appendChild(dmgSpan);
      statsDiv.appendChild(spdSpan);
      statsDiv.appendChild(amoSpan);
      div.appendChild(statsDiv);

      const weapId = w.id;
      div.onclick = () => {
        this.selectedWeapons[this.weaponSelectSlot] = weapId;
        this.weaponSelectSlot = (this.weaponSelectSlot + 1) % 5;
        this.renderWeaponSelect();
      };
      container.appendChild(div);
    }
  }

  startGame() {
    this.send({
      type: 'join',
      roomId: this.currentRoomId,
      name: this.playerName,
      character: this.selectedCharacter,
      password: this.currentRoomPassword,
    });
    // Send weapon selection
    setTimeout(() => {
      this.send({ type: 'weapons', weapons: this.selectedWeapons });
    }, 500);
  }

  createRoom() {
    const name = document.getElementById('room-name-input').value.trim() || 'New Room';
    const modeSelect = document.getElementById('room-mode-select');
    const gameMode = modeSelect ? parseInt(modeSelect.value) : 0;
    const passwordInput = document.getElementById('room-password-input');
    const password = passwordInput ? passwordInput.value.trim() : '';

    this.send({
      type: 'create_room',
      name,
      gameMode,
      scoreLimit: 15,
      timeLimit: 300,
      password: password || null,
      goriness: 2,
    });
  }

  // Chat
  addChatMessage(sender, message) {
    this.chatMessages.push({ sender, message, time: Date.now() });
    if (this.chatMessages.length > 30) this.chatMessages.shift();
    this.updateChatUI();
  }

  updateChatUI() {
    const chatDiv = document.getElementById('chat-container');
    if (!chatDiv) return;

    chatDiv.innerHTML = '';
    const now = Date.now();
    const recent = this.chatMessages.filter(m => now - m.time < 10000 || this.chatOpen);
    let hasContent = false;

    for (const msg of recent) {
      hasContent = true;
      const div = document.createElement('div');
      div.className = msg.sender === 'system' ? 'chat-system' : 'chat-player';
      if (msg.sender !== 'system') {
        const nameSpan = document.createElement('span');
        nameSpan.className = 'chat-name';
        nameSpan.textContent = msg.sender + ':';
        div.appendChild(nameSpan);
        div.appendChild(document.createTextNode(' ' + msg.message));
      } else {
        div.textContent = msg.message;
      }
      chatDiv.appendChild(div);
    }

    if (this.chatOpen) {
      hasContent = true;
      const inputDiv = document.createElement('div');
      inputDiv.className = 'chat-input-line';
      inputDiv.textContent = '> ' + this.chatInput;
      const cursor = document.createElement('span');
      cursor.className = 'cursor';
      cursor.textContent = '|';
      inputDiv.appendChild(cursor);
      chatDiv.appendChild(inputDiv);
    }

    chatDiv.style.display = (hasContent || this.chatOpen) ? 'block' : 'none';
  }

  // Client-side particle update
  updateParticles() {
    const particles = window._particles;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.life--;

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      // Stick to / bounce off terrain
      if (this.map) {
        const px = Math.floor(p.x);
        const py = Math.floor(p.y);
        if (px >= 0 && px < this.renderer.gameWidth && py >= 0 && py < this.renderer.gameHeight) {
          if (this.map[py * this.renderer.gameWidth + px] !== 0) {
            if (p.bounce > 0) {
              const bounceF = p.bounce / 100;
              p.vy = -p.vy * bounceF;
              if (Math.abs(p.vy) < 0.15) { p.bounce = 0; p.vx = 0; p.vy = 0; }
            } else {
              p.vx = 0;
              p.vy = 0;
              // Blood stain on terrain (visual only on client)
              if (p.color >= 80 && p.color < 88) {
                const idx = py * this.renderer.gameWidth + px;
                if (this.mapColors && this.map[idx] !== 0) {
                  this.mapColors[idx] = 80 + Math.floor(Math.random() * 8);
                }
              }
            }
          }
        }
      }

      // Out of bounds
      if (p.x < 0 || p.x >= 504 || p.y < 0 || p.y >= 350) {
        particles.splice(i, 1);
      }
    }

    // Limit
    while (particles.length > 800) {
      particles.shift();
    }
  }

  // Update damage numbers
  updateDamageNumbers() {
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dn = this.damageNumbers[i];
      dn.y += dn.vy;
      dn.vy *= 0.95;
      dn.timer--;
      if (dn.timer <= 0) this.damageNumbers.splice(i, 1);
    }
  }

  // Update streak messages
  updateStreakMessages() {
    for (let i = this.streakMessages.length - 1; i >= 0; i--) {
      this.streakMessages[i].timer--;
      if (this.streakMessages[i].timer <= 0) this.streakMessages.splice(i, 1);
    }
  }

  // Main render loop
  renderLoop() {
    requestAnimationFrame(() => this.renderLoop());

    if (this.screen !== 'game' || !this.state || !this.map) return;

    // Update client particles
    this.updateParticles();
    this.updateDamageNumbers();
    this.updateStreakMessages();

    // Determine camera target (spectator follows first alive worm)
    let cameraTarget = null;
    const localWorm = this.state.worms ? this.state.worms[this.playerId] : null;

    if (localWorm && !localWorm.spectating) {
      cameraTarget = localWorm;
    } else {
      // Spectator: follow first alive worm
      for (const id in this.state.worms) {
        const w = this.state.worms[id];
        if (w.alive && parseInt(id) !== this.playerId) {
          cameraTarget = w;
          break;
        }
      }
    }

    // Render
    this.renderer.render(this.state, this.map, this.mapColors, this.playerId, cameraTarget);

    // Render damage numbers
    this.renderer.renderDamageNumbers(this.damageNumbers);

    // Render streak messages
    this.renderer.renderStreakMessages(this.streakMessages);

    // Render countdown
    if (this.countdownValue > 0) {
      this.renderer.renderCountdown(this.countdownValue);
    }

    // Render minimap
    this.renderer.renderMinimap(this.state, this.map, this.mapColors);

    // Render post-round stats
    if (this.showPostRoundStats && this.postRoundStats) {
      this.renderer.renderPostRoundStats(this.postRoundStats, this.playerId);
    }

    // Render scoreboard overlay
    if (this.showScoreboard) {
      this.renderScoreboard();
    }

    // Update ping display
    const pingEl = document.getElementById('ping-display');
    if (pingEl) {
      pingEl.textContent = `${this.latency}ms`;
      pingEl.style.color = this.latency < 80 ? '#44ff44' : this.latency < 200 ? '#ffff44' : '#ff4444';
    }

    // Update chat visibility
    this.updateChatUI();
  }

  renderScoreboard() {
    const ctx = this.renderer.ctx;
    const s = this.renderer.scale;
    const cw = this.renderer.canvas.width;
    const ch = this.renderer.canvas.height;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(cw * 0.15, ch * 0.1, cw * 0.7, ch * 0.8);

    ctx.fillStyle = '#FFD700';
    ctx.font = `bold ${14 * s}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('SCOREBOARD', cw / 2, ch * 0.18);

    // Headers
    ctx.fillStyle = '#888888';
    ctx.font = `${8 * s}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('PLAYER', cw * 0.2, ch * 0.25);
    ctx.textAlign = 'center';
    ctx.fillText('KILLS', cw * 0.55, ch * 0.25);
    ctx.fillText('DEATHS', cw * 0.7, ch * 0.25);
    ctx.fillText('PING', cw * 0.82, ch * 0.25);

    if (!this.state) return;

    const scores = [];
    for (const id in this.state.worms) {
      scores.push(this.state.worms[id]);
    }
    scores.sort((a, b) => b.kills - a.kills);

    ctx.font = `${9 * s}px monospace`;
    for (let i = 0; i < scores.length; i++) {
      const w = scores[i];
      const y = ch * 0.3 + i * 14 * s;
      const colors = WORM_COLORS[w.color % WORM_COLORS.length].crosshair;
      ctx.fillStyle = `rgb(${colors[0]},${colors[1]},${colors[2]})`;
      ctx.textAlign = 'left';
      ctx.fillText(w.name + (w.isBot ? ' [BOT]' : ''), cw * 0.2, y);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(w.kills.toString(), cw * 0.55, y);
      ctx.fillText(w.deaths.toString(), cw * 0.7, y);
      if (parseInt(Object.keys(this.state.worms).find(id => this.state.worms[id] === w)) === this.playerId) {
        ctx.fillText(`${this.latency}ms`, cw * 0.82, y);
      }
    }
    ctx.textAlign = 'left';
  }
}

// Global client instance
let client;

function initGame() {
  client = new LieroClient();
  client.init();
}

function connectAndPlay() {
  const nameInput = document.getElementById('player-name');
  client.playerName = (nameInput.value.trim() || 'Player').substring(0, 20);
  client.connect();

  // Wait for connection then show lobby
  const waitForConnection = setInterval(() => {
    if (client.connected) {
      clearInterval(waitForConnection);
      client.showLobby();
    }
  }, 100);

  setTimeout(() => {
    clearInterval(waitForConnection);
    if (!client.connected) {
      alert('Could not connect to server. Make sure the server is running.');
    }
  }, 5000);
}

function quickPlay() {
  const nameInput = document.getElementById('player-name');
  client.playerName = (nameInput.value.trim() || 'Player').substring(0, 20);
  const botCount = parseInt(document.getElementById('bot-count')?.value || '0', 10);
  client.connect();

  const waitForConnection = setInterval(() => {
    if (client.connected) {
      clearInterval(waitForConnection);
      // Join first available room
      client.currentRoomId = 1;
      client._lastRoomId = 1;
      client.send({
        type: 'join',
        roomId: 1,
        name: client.playerName,
        character: client.selectedCharacter,
      });
      setTimeout(() => {
        client.send({ type: 'weapons', weapons: client.selectedWeapons });
        for (let i = 0; i < botCount; i++) {
          client.send({ type: 'add_bot' });
        }
      }, 500);
    }
  }, 100);
}

function startGameFromCharacterSelect() {
  client.showWeaponSelect();
}

function startGameFromWeaponSelect() {
  client.startGame();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initGame);
