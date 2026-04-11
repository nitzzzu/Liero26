// Liero26 - Shared Game Engine
// Deterministic game simulation that runs on both client and server

(function() {
const CONSTANTS = (typeof require !== 'undefined') ? require('./constants') : window.CONSTANTS;
const WEAPONS = (typeof require !== 'undefined') ? require('./weapons') : window.WEAPONS;

// Sine/Cosine lookup table (128 entries for Liero's aim system)
const sinTable = [];
const cosTable = [];
for (let i = 0; i < 128; i++) {
  const angle = (i / 128) * Math.PI * 2;
  sinTable[i] = Math.sin(angle);
  cosTable[i] = Math.cos(angle);
}

function aimToAngle(aim) {
  // Convert aim value (-90 to 90) to radians
  return (aim / 180) * Math.PI;
}

function getAimDirX(aim, facing) {
  const angle = aimToAngle(aim);
  return Math.cos(angle) * (facing === 1 ? 1 : -1);
}

function getAimDirY(aim) {
  const angle = aimToAngle(aim);
  return -Math.sin(angle);
}

class Projectile {
  constructor(id, weaponId, ownerId, x, y, vx, vy) {
    this.id = id;
    this.weaponId = weaponId;
    this.ownerId = ownerId;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.age = 0;
    this.active = true;
    this.exploTimer = 0;
    const w = WEAPONS[weaponId];
    if (w.timeToExplo > 0) {
      this.exploTimer = w.timeToExplo + Math.floor(Math.random() * (w.timeToExploV + 1));
    }
  }
}

class Particle {
  constructor(x, y, vx, vy, color, life, gravity) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.life = life;
    this.maxLife = life;
    this.gravity = gravity || CONSTANTS.BLOOD.GRAVITY;
    this.active = true;
  }
}

class NinjaRope {
  constructor() {
    this.active = false;
    this.attached = false;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.length = CONSTANTS.ROPE.MAX_LENGTH * 50;
    this.anchorX = 0;
    this.anchorY = 0;
  }
}

class Worm {
  constructor(id, name, x, y) {
    this.id = id;
    this.name = name || `Player ${id}`;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.aim = 0;
    this.aimVel = 0;
    this.facing = 1; // 1=right, -1=left
    this.health = CONSTANTS.WORM.HEALTH;
    this.alive = true;
    this.respawnTimer = 0;
    this.weapons = [0, 3, 10, 14, 28]; // default loadout
    this.currentWeapon = 0;
    this.ammo = [];
    this.loadingLeft = [];
    this.showWeapon = false;
    this.rope = new NinjaRope();
    this.kills = 0;
    this.deaths = 0;
    this.lives = 15;
    this.team = 0;
    this.onGround = false;
    this.lastDamageBy = -1;
    this.digTimer = 0;
    this.stateAge = 0;
    this.color = 0;
    this.initAmmo();
  }

  initAmmo() {
    this.ammo = [];
    this.loadingLeft = [];
    for (let i = 0; i < 5; i++) {
      const w = WEAPONS[this.weapons[i]];
      this.ammo[i] = w ? w.ammo : 0;
      this.loadingLeft[i] = 0;
    }
  }
}

class Bonus {
  constructor(id, x, y, type) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.type = type; // 0=health, 1=weapon
    this.timer = 3000 + Math.floor(Math.random() * 2000);
    this.weaponId = Math.floor(Math.random() * 40);
    this.active = true;
    this.flickering = false;
  }
}

class GameEngine {
  constructor() {
    this.map = null;
    this.mapWidth = CONSTANTS.MAP_WIDTH;
    this.mapHeight = CONSTANTS.MAP_HEIGHT;
    this.worms = new Map();
    this.projectiles = [];
    this.particles = [];
    this.bonuses = [];
    this.nextProjectileId = 0;
    this.nextBonusId = 0;
    this.tick = 0;
    this.events = [];
    this.gameMode = CONSTANTS.MODE.DEATHMATCH;
    this.scoreLimit = CONSTANTS.DEFAULTS.SCORE_LIMIT;
    this.timeLimit = CONSTANTS.DEFAULTS.TIME_LIMIT;
    this.timeLeft = this.timeLimit * CONSTANTS.TICK_RATE;
    this.gameOver = false;
    this.winner = null;
    this.bonusSpawnTimer = 0;
    // Hold the flag
    this.flag = null;
    this.flagHolder = null;
  }

  generateMap() {
    const w = this.mapWidth;
    const h = this.mapHeight;
    // Map is a flat Uint8Array: each cell is a material type
    this.map = new Uint8Array(w * h);
    // Terrain colors for rendering (palette index per pixel)
    this.mapColors = new Uint8Array(w * h);

    // Perlin-like terrain generation using multiple octaves of noise
    const noise = this._generateNoise(w, h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const n = noise[idx];

        // Border is rock
        if (x <= 1 || x >= w - 2 || y <= 1 || y >= h - 2) {
          this.map[idx] = CONSTANTS.MATERIAL.ROCK;
          this.mapColors[idx] = 160 + Math.floor(Math.random() * 4);
          continue;
        }

        if (n > 0.62) {
          // Rock (indestructible)
          this.map[idx] = CONSTANTS.MATERIAL.ROCK;
          this.mapColors[idx] = 160 + Math.floor(Math.random() * 4);
        } else if (n > 0.35) {
          // Dirt (destructible)
          this.map[idx] = CONSTANTS.MATERIAL.DIRT;
          const shade = Math.floor((n - 0.35) * 10);
          this.mapColors[idx] = 82 + shade + Math.floor(Math.random() * 2);
        } else {
          // Background (air)
          this.map[idx] = CONSTANTS.MATERIAL.BACKGROUND;
          this.mapColors[idx] = 0;
        }
      }
    }

    // Create some caves/tunnels
    this._carveCaves(8 + Math.floor(Math.random() * 10));

    return { map: this.map, mapColors: this.mapColors };
  }

  _generateNoise(w, h) {
    const result = new Float32Array(w * h);
    const octaves = 5;
    const persistence = 0.5;

    for (let oct = 0; oct < octaves; oct++) {
      const freq = Math.pow(2, oct);
      const amp = Math.pow(persistence, oct);
      const gridW = Math.ceil(w / (64 / freq)) + 2;
      const gridH = Math.ceil(h / (64 / freq)) + 2;
      const grid = new Float32Array(gridW * gridH);
      for (let i = 0; i < grid.length; i++) grid[i] = Math.random();

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const gx = (x * freq) / 64;
          const gy = (y * freq) / 64;
          const ix = Math.floor(gx);
          const iy = Math.floor(gy);
          const fx = gx - ix;
          const fy = gy - iy;
          const sfx = fx * fx * (3 - 2 * fx);
          const sfy = fy * fy * (3 - 2 * fy);

          const ixc = Math.min(ix, gridW - 2);
          const iyc = Math.min(iy, gridH - 2);
          const v00 = grid[iyc * gridW + ixc];
          const v10 = grid[iyc * gridW + ixc + 1];
          const v01 = grid[(iyc + 1) * gridW + ixc];
          const v11 = grid[(iyc + 1) * gridW + ixc + 1];

          const top = v00 + (v10 - v00) * sfx;
          const bot = v01 + (v11 - v01) * sfx;
          result[y * w + x] += (top + (bot - top) * sfy) * amp;
        }
      }
    }

    // Normalize
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < result.length; i++) {
      if (result[i] < min) min = result[i];
      if (result[i] > max) max = result[i];
    }
    const range = max - min || 1;
    for (let i = 0; i < result.length; i++) {
      result[i] = (result[i] - min) / range;
    }
    return result;
  }

  _carveCaves(count) {
    const w = this.mapWidth;
    const h = this.mapHeight;
    for (let c = 0; c < count; c++) {
      let cx = 30 + Math.floor(Math.random() * (w - 60));
      let cy = 30 + Math.floor(Math.random() * (h - 60));
      const length = 40 + Math.floor(Math.random() * 80);
      let dx = (Math.random() - 0.5) * 2;
      let dy = (Math.random() - 0.5) * 2;

      for (let i = 0; i < length; i++) {
        const radius = 5 + Math.floor(Math.random() * 8);
        this._carveCircle(Math.floor(cx), Math.floor(cy), radius);
        cx += dx;
        cy += dy;
        dx += (Math.random() - 0.5) * 0.5;
        dy += (Math.random() - 0.5) * 0.5;
        const speed = Math.sqrt(dx * dx + dy * dy);
        if (speed > 2) { dx = (dx / speed) * 2; dy = (dy / speed) * 2; }
        cx = Math.max(10, Math.min(w - 10, cx));
        cy = Math.max(10, Math.min(h - 10, cy));
      }
    }
  }

  _carveCircle(cx, cy, radius) {
    const w = this.mapWidth;
    const h = this.mapHeight;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          const x = cx + dx;
          const y = cy + dy;
          if (x > 2 && x < w - 3 && y > 2 && y < h - 3) {
            const idx = y * w + x;
            if (this.map[idx] !== CONSTANTS.MATERIAL.ROCK || Math.random() < 0.3) {
              this.map[idx] = CONSTANTS.MATERIAL.BACKGROUND;
              this.mapColors[idx] = 0;
            }
          }
        }
      }
    }
  }

  addWorm(id, name) {
    const pos = this.findSpawnPoint();
    const worm = new Worm(id, name, pos.x, pos.y);
    worm.color = this.worms.size % 6;
    this.worms.set(id, worm);
    return worm;
  }

  removeWorm(id) {
    this.worms.delete(id);
  }

  findSpawnPoint() {
    const r = CONSTANTS.WORM.SPAWN_RECT;
    for (let attempt = 0; attempt < 200; attempt++) {
      const x = r.x + Math.floor(Math.random() * r.w);
      const y = r.y + Math.floor(Math.random() * r.h);
      if (this._isSpawnValid(x, y)) {
        return { x, y };
      }
    }
    // Fallback - carve a spawn point in the center
    const cx = Math.floor(this.mapWidth / 2);
    const cy = Math.floor(this.mapHeight / 2);
    this._carveCircle(cx, cy, 10);
    return { x: cx, y: cy };
  }

  _isSpawnValid(x, y) {
    if (!this.map) return true;
    const r = CONSTANTS.WORM.RADIUS;
    for (let dy = -r - 2; dy <= r + 2; dy++) {
      for (let dx = -r - 2; dx <= r + 2; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || px >= this.mapWidth || py < 0 || py >= this.mapHeight) return false;
        const mat = this.map[py * this.mapWidth + px];
        // Worm must spawn in open air (background only)
        if (mat !== CONSTANTS.MATERIAL.BACKGROUND) {
          return false;
        }
      }
    }
    // Check distance from other worms
    for (const [, w] of this.worms) {
      if (!w.alive) continue;
      const dist = Math.sqrt((w.x - x) ** 2 + (w.y - y) ** 2);
      if (dist < CONSTANTS.WORM.MIN_SPAWN_DIST) return false;
    }
    return true;
  }

  isSolid(x, y) {
    if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) return true;
    const mat = this.map[Math.floor(y) * this.mapWidth + Math.floor(x)];
    return mat !== CONSTANTS.MATERIAL.BACKGROUND;
  }

  isRock(x, y) {
    if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) return true;
    const mat = this.map[Math.floor(y) * this.mapWidth + Math.floor(x)];
    return mat === CONSTANTS.MATERIAL.ROCK || mat === CONSTANTS.MATERIAL.ROCK2 ||
           mat === CONSTANTS.MATERIAL.ROCK3;
  }

  destroyTerrain(cx, cy, radius) {
    const w = this.mapWidth;
    const h = this.mapHeight;
    let destroyed = false;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          const x = Math.floor(cx + dx);
          const y = Math.floor(cy + dy);
          if (x > 1 && x < w - 2 && y > 1 && y < h - 2) {
            const idx = y * w + x;
            if (this.map[idx] !== CONSTANTS.MATERIAL.BACKGROUND &&
                this.map[idx] !== CONSTANTS.MATERIAL.ROCK &&
                this.map[idx] !== CONSTANTS.MATERIAL.ROCK2 &&
                this.map[idx] !== CONSTANTS.MATERIAL.ROCK3) {
              this.map[idx] = CONSTANTS.MATERIAL.BACKGROUND;
              this.mapColors[idx] = 0;
              destroyed = true;
            }
          }
        }
      }
    }
    return destroyed;
  }

  addDirt(cx, cy, radius) {
    const w = this.mapWidth;
    const h = this.mapHeight;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          const x = Math.floor(cx + dx);
          const y = Math.floor(cy + dy);
          if (x > 1 && x < w - 2 && y > 1 && y < h - 2) {
            const idx = y * w + x;
            if (this.map[idx] === CONSTANTS.MATERIAL.BACKGROUND) {
              this.map[idx] = CONSTANTS.MATERIAL.DIRT;
              this.mapColors[idx] = 82 + Math.floor(Math.random() * 6);
            }
          }
        }
      }
    }
  }

  update(inputs) {
    if (this.gameOver) return;
    this.tick++;
    this.events = [];

    // Update time
    if (this.timeLeft > 0) {
      this.timeLeft--;
      if (this.timeLeft <= 0) {
        this._checkGameOver();
      }
    }

    // Process inputs for each worm
    for (const [id, worm] of this.worms) {
      const input = inputs.get(id);
      if (worm.alive && input) {
        this._updateWormInput(worm, input);
      }
      if (!worm.alive) {
        worm.respawnTimer--;
        if (worm.respawnTimer <= 0) {
          this._respawnWorm(worm);
        }
      }
    }

    // Physics update
    for (const [, worm] of this.worms) {
      if (worm.alive) {
        this._updateWormPhysics(worm);
        this._updateRope(worm);
        this._updateWeaponLoading(worm);
      }
      worm.stateAge++;
    }

    // Update projectiles
    this._updateProjectiles();

    // Update particles
    this._updateParticles();

    // Update bonuses
    this._updateBonuses();

    // Bonus spawn
    this.bonusSpawnTimer++;
    if (this.bonusSpawnTimer >= CONSTANTS.BONUS.SPAWN_INTERVAL) {
      this.bonusSpawnTimer = 0;
      if (this.bonuses.length < 3 && Math.random() < 0.3) {
        this._spawnBonus();
      }
    }

    // Hold the flag mode
    if (this.gameMode === CONSTANTS.MODE.HOLD_THE_FLAG) {
      this._updateFlag();
    }
  }

  _updateWormInput(worm, input) {
    // Movement
    if (input.left) {
      worm.vx -= CONSTANTS.WORM.WALK_VEL;
      worm.facing = -1;
    }
    if (input.right) {
      worm.vx += CONSTANTS.WORM.WALK_VEL;
      worm.facing = 1;
    }

    // Jumping
    if (input.jump && worm.onGround) {
      worm.vy = -CONSTANTS.WORM.JUMP_FORCE;
      worm.onGround = false;
    }

    // Aiming
    if (input.up) {
      worm.aimVel += CONSTANTS.WORM.AIM_SPEED;
    }
    if (input.down) {
      worm.aimVel -= CONSTANTS.WORM.AIM_SPEED;
    }

    // Show weapon (weapon select mode)
    worm.showWeapon = !!input.change;

    // Weapon switching
    if (input.change) {
      if (input.left && !input._prevLeft) {
        worm.currentWeapon = (worm.currentWeapon + 4) % 5;
      }
      if (input.right && !input._prevRight) {
        worm.currentWeapon = (worm.currentWeapon + 1) % 5;
      }
      // Ninja rope with change + jump
      if (input.jump && !input._prevJump) {
        this._fireRope(worm);
      }
      // Rope length control
      if (input.up && worm.rope.active) {
        worm.rope.length = Math.max(20, worm.rope.length - 1);
      }
      if (input.down && worm.rope.active) {
        worm.rope.length = Math.min(200, worm.rope.length + 1);
      }
    } else {
      // Release rope when not holding change
      if (!input.change && input._prevChange && worm.rope.active) {
        worm.rope.active = false;
        worm.rope.attached = false;
      }
    }

    // Firing
    if (input.fire && !input.change) {
      this._fireWeapon(worm);
    }

    // Digging
    if (input.dig) {
      this._dig(worm);
    }

    // Store previous input state for edge detection
    input._prevLeft = input.left;
    input._prevRight = input.right;
    input._prevJump = input.jump;
    input._prevChange = input.change;
    input._prevFire = input.fire;
  }

  _updateWormPhysics(worm) {
    // Gravity
    worm.vy += CONSTANTS.WORM.GRAVITY;

    // Friction
    worm.vx = (worm.vx * CONSTANTS.WORM.FRICTION_MULT) / CONSTANTS.WORM.FRICTION_DIV;

    // Aim friction
    worm.aimVel = (worm.aimVel * CONSTANTS.WORM.AIM_FRICTION_MULT) / CONSTANTS.WORM.AIM_FRICTION_DIV;
    worm.aim += worm.aimVel;
    worm.aim = Math.max(CONSTANTS.WORM.AIM_MIN, Math.min(CONSTANTS.WORM.AIM_MAX, worm.aim));

    // Velocity clamping
    worm.vx = Math.max(-CONSTANTS.WORM.MAX_VEL_X, Math.min(CONSTANTS.WORM.MAX_VEL_X, worm.vx));

    // Movement with collision
    const newX = worm.x + worm.vx;
    const newY = worm.y + worm.vy;
    const r = CONSTANTS.WORM.RADIUS;

    worm.onGround = false;

    // Horizontal collision
    if (!this._wormFits(newX, worm.y, r)) {
      worm.vx = 0;
    } else {
      worm.x = newX;
    }

    // Vertical collision
    if (!this._wormFits(worm.x, newY, r)) {
      if (worm.vy > 0) {
        worm.onGround = true;
      }
      worm.vy = 0;
    } else {
      worm.y = newY;
    }

    // Keep in bounds
    worm.x = Math.max(r + 2, Math.min(this.mapWidth - r - 2, worm.x));
    worm.y = Math.max(r + 2, Math.min(this.mapHeight - r - 2, worm.y));
  }

  _wormFits(x, y, r) {
    // Check corners + center
    for (let dy = -r; dy <= r; dy += r) {
      for (let dx = -r; dx <= r; dx += r) {
        if (this.isSolid(x + dx, y + dy)) return false;
      }
    }
    return true;
  }

  _updateRope(worm) {
    const rope = worm.rope;
    if (!rope.active) return;

    if (!rope.attached) {
      // Rope is flying
      rope.vy += CONSTANTS.ROPE.GRAVITY;
      rope.x += rope.vx;
      rope.y += rope.vy;

      // Check for attachment
      if (this.isSolid(rope.x, rope.y)) {
        rope.attached = true;
        rope.anchorX = rope.x;
        rope.anchorY = rope.y;
      }

      // Max length check
      const dx = rope.x - worm.x;
      const dy = rope.y - worm.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > rope.length * 3) {
        rope.active = false;
      }
    } else {
      // Rope is attached - pull worm toward anchor
      const dx = rope.anchorX - worm.x;
      const dy = rope.anchorY - worm.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 1) {
        const pullStrength = 0.15;
        const nx = dx / dist;
        const ny = dy / dist;

        if (dist > rope.length) {
          worm.vx += nx * pullStrength * 2;
          worm.vy += ny * pullStrength * 2;

          // Limit distance
          const excess = dist - rope.length;
          worm.x += nx * excess * 0.5;
          worm.y += ny * excess * 0.5;
        }

        // Pendulum swing
        worm.vx += nx * pullStrength * 0.3;
        worm.vy += ny * pullStrength * 0.3;
      }

      // Check if anchor terrain was destroyed
      if (!this.isSolid(rope.anchorX, rope.anchorY)) {
        rope.active = false;
        rope.attached = false;
      }
    }
  }

  _fireRope(worm) {
    const rope = worm.rope;
    if (rope.active) {
      rope.active = false;
      rope.attached = false;
      return;
    }

    rope.active = true;
    rope.attached = false;
    rope.x = worm.x;
    rope.y = worm.y;
    rope.length = 100;

    const dirX = getAimDirX(worm.aim, worm.facing);
    const dirY = getAimDirY(worm.aim);
    rope.vx = dirX * CONSTANTS.ROPE.SPEED;
    rope.vy = dirY * CONSTANTS.ROPE.SPEED;
  }

  _updateWeaponLoading(worm) {
    for (let i = 0; i < 5; i++) {
      if (worm.loadingLeft[i] > 0) {
        worm.loadingLeft[i]--;
        if (worm.loadingLeft[i] <= 0) {
          const w = WEAPONS[worm.weapons[i]];
          worm.ammo[i] = w.ammo;
        }
      }
    }
  }

  _fireWeapon(worm) {
    const weapIdx = worm.currentWeapon;
    if (worm.ammo[weapIdx] <= 0) return;
    if (worm.loadingLeft[weapIdx] > 0) return;

    const w = WEAPONS[worm.weapons[weapIdx]];

    // Delay check
    if (w.delay > 0 && worm.stateAge % Math.max(1, Math.floor(w.delay / 10)) !== 0) return;

    worm.ammo[weapIdx]--;

    // Start reload when ammo depleted
    if (worm.ammo[weapIdx] <= 0) {
      worm.loadingLeft[weapIdx] = w.loadingTime;
    }

    const dirX = getAimDirX(worm.aim, worm.facing);
    const dirY = getAimDirY(worm.aim);

    // Recoil
    if (w.recoil > 0) {
      worm.vx -= dirX * w.recoil * 0.003;
      worm.vy -= dirY * w.recoil * 0.003;
    }

    // Spawn projectiles
    for (let p = 0; p < w.parts; p++) {
      const spread = w.distribution || 0;
      const sx = dirX + (Math.random() - 0.5) * spread * 2;
      const sy = dirY + (Math.random() - 0.5) * spread * 2;
      const len = Math.sqrt(sx * sx + sy * sy) || 1;
      const speed = (w.speed + Math.random() * (w.addSpeed || 0)) / 100;

      const cone = w.fireCone / 1000;
      const coneAngle = (Math.random() - 0.5) * cone;
      const cos = Math.cos(coneAngle);
      const sin = Math.sin(coneAngle);
      const nx = sx / len;
      const ny = sy / len;
      const fx = nx * cos - ny * sin;
      const fy = nx * sin + ny * cos;

      const proj = new Projectile(
        this.nextProjectileId++,
        worm.weapons[weapIdx],
        worm.id,
        worm.x + dirX * 5,
        worm.y + dirY * 5,
        fx * speed,
        fy * speed
      );
      this.projectiles.push(proj);
    }

    // Sound event
    if (w.sound) {
      this.events.push({ type: 'sound', sound: w.sound, x: worm.x, y: worm.y });
    }

    // Shell ejection
    if (w.leaveShells) {
      this._spawnShell(worm.x, worm.y, worm.facing);
    }
  }

  _spawnShell(x, y, facing) {
    const vx = -facing * (0.3 + Math.random() * 0.5);
    const vy = -(0.5 + Math.random() * 1);
    this.particles.push(new Particle(x, y, vx, vy, 75, 40, CONSTANTS.BLOOD.GRAVITY));
  }

  _dig(worm) {
    const dirX = getAimDirX(worm.aim, worm.facing);
    const dirY = getAimDirY(worm.aim);
    for (let d = 0; d < 8; d++) {
      const x = Math.floor(worm.x + dirX * d);
      const y = Math.floor(worm.y + dirY * d);
      if (x > 1 && x < this.mapWidth - 2 && y > 1 && y < this.mapHeight - 2) {
        const idx = y * this.mapWidth + x;
        if (this.map[idx] === CONSTANTS.MATERIAL.DIRT || this.map[idx] === CONSTANTS.MATERIAL.DIRT2) {
          this.map[idx] = CONSTANTS.MATERIAL.BACKGROUND;
          this.mapColors[idx] = 0;
          // Dirt particle
          if (Math.random() < 0.3) {
            this.particles.push(new Particle(
              x, y,
              (Math.random() - 0.5) * 0.5,
              -(Math.random() * 0.5),
              85 + Math.floor(Math.random() * 4),
              20 + Math.floor(Math.random() * 20),
              CONSTANTS.BLOOD.GRAVITY
            ));
          }
        }
      }
    }
  }

  _updateProjectiles() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      if (!proj.active) {
        this.projectiles.splice(i, 1);
        continue;
      }

      const w = WEAPONS[proj.weaponId];
      proj.age++;

      // Gravity
      proj.vy += (w.gravity || 0);

      // Accelerating projectiles (missiles)
      if (w.accelerating) {
        const speed = Math.sqrt(proj.vx * proj.vx + proj.vy * proj.vy);
        if (speed > 0 && speed < w.speed / 50) {
          proj.vx *= 1.03;
          proj.vy *= 1.03;
        }
      }

      // Move
      const newX = proj.x + proj.vx;
      const newY = proj.y + proj.vy;

      // Laser type - instant trace
      if (w.isLaser) {
        this._traceLaser(proj, w);
        continue;
      }

      // Check for worm collision
      if (w.wormCollide) {
        for (const [id, worm] of this.worms) {
          if (!worm.alive) continue;
          if (id === proj.ownerId && proj.age < 15) continue; // Don't hit self immediately

          const dx = worm.x - newX;
          const dy = worm.y - newY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONSTANTS.WORM.RADIUS + 2) {
            this._projectileHit(proj, w, worm);
            break;
          }
        }
        if (!proj.active) continue;
      }

      // Ground collision
      if (this.isSolid(newX, newY)) {
        if (w.bounce > 0) {
          // Bounce
          const bounceF = w.bounce / 100;
          if (this.isSolid(newX, proj.y)) proj.vx = -proj.vx * bounceF;
          if (this.isSolid(proj.x, newY)) proj.vy = -proj.vy * bounceF;
          // Sound
          this.events.push({ type: 'sound', sound: 'bump', x: proj.x, y: proj.y });
        } else if (w.groundCollide) {
          this._projectileExplode(proj, w);
          continue;
        } else if (w.dirtEffect) {
          this.addDirt(Math.floor(newX), Math.floor(newY), 4 + Math.floor(Math.random() * 3));
          proj.active = false;
          continue;
        }
      } else {
        proj.x = newX;
        proj.y = newY;
      }

      // Timer explosion
      if (w.timeToExplo > 0) {
        proj.exploTimer--;
        if (proj.exploTimer <= 0) {
          this._projectileExplode(proj, w);
          continue;
        }
      }

      // Proximity mine detection
      if (w.detectDistance > 0) {
        for (const [id, worm] of this.worms) {
          if (!worm.alive || id === proj.ownerId) continue;
          const dx = worm.x - proj.x;
          const dy = worm.y - proj.y;
          if (Math.sqrt(dx * dx + dy * dy) < w.detectDistance) {
            this._projectileExplode(proj, w);
            break;
          }
        }
      }

      // Out of bounds
      if (proj.x < 0 || proj.x >= this.mapWidth || proj.y < 0 || proj.y >= this.mapHeight) {
        proj.active = false;
      }

      // Max age
      if (proj.age > 700) {
        proj.active = false;
      }
    }
  }

  _traceLaser(proj, w) {
    const dirX = proj.vx;
    const dirY = proj.vy;
    const len = Math.sqrt(dirX * dirX + dirY * dirY);
    if (len === 0) { proj.active = false; return; }
    const nx = dirX / len;
    const ny = dirY / len;

    for (let d = 0; d < 300; d++) {
      const x = proj.x + nx * d;
      const y = proj.y + ny * d;

      // Check worm hit
      for (const [id, worm] of this.worms) {
        if (!worm.alive || (id === proj.ownerId && d < 10)) continue;
        const dx = worm.x - x;
        const dy = worm.y - y;
        if (Math.sqrt(dx * dx + dy * dy) < CONSTANTS.WORM.RADIUS + 1) {
          this._damageWorm(worm, w.hitDamage, proj.ownerId);
          this._spawnBlood(worm.x, worm.y, w.bloodOnHit);
          proj.active = false;
          return;
        }
      }

      // Check terrain hit
      if (this.isSolid(x, y)) {
        this.destroyTerrain(x, y, 1);
        proj.active = false;
        this.events.push({ type: 'sound', sound: 'exp2', x, y });
        return;
      }

      if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) {
        proj.active = false;
        return;
      }
    }
    proj.active = false;
  }

  _projectileHit(proj, w, worm) {
    // Direct damage
    if (w.hitDamage > 0) {
      this._damageWorm(worm, w.hitDamage, proj.ownerId);
    }

    // Blood
    if (w.bloodOnHit > 0) {
      this._spawnBlood(worm.x, worm.y, w.bloodOnHit);
    }

    // Blow away
    if (w.blowAway > 0) {
      const force = w.blowAway * 0.03;
      worm.vx += proj.vx * force;
      worm.vy += proj.vy * force;
    }

    if (w.exploSize > 0) {
      this._projectileExplode(proj, w);
    } else {
      proj.active = false;
    }
  }

  _projectileExplode(proj, w) {
    proj.active = false;

    const sizes = { tiny: 2, small: 4, medium: 8, large: 12, huge: 20 };
    const radius = sizes[w.createOnExp] || 6;

    // Destroy terrain
    this.destroyTerrain(proj.x, proj.y, radius);

    // Damage worms in radius
    for (const [, worm] of this.worms) {
      if (!worm.alive) continue;
      const dx = worm.x - proj.x;
      const dy = worm.y - proj.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius * 2) {
        const damage = Math.floor((1 - dist / (radius * 2)) * (w.splinterAmount || 10));
        if (damage > 0) {
          this._damageWorm(worm, damage, proj.ownerId);
          // Blow away from explosion
          if (dist > 0) {
            const force = (1 - dist / (radius * 2)) * 1.5;
            worm.vx += (dx / dist) * force;
            worm.vy += (dy / dist) * force;
          }
        }
      }
    }

    // Affect other projectiles
    if (radius >= 8) {
      for (const other of this.projectiles) {
        if (!other.active || other === proj) continue;
        const ow = WEAPONS[other.weaponId];
        if (!ow.affectByExplosions) continue;
        const dx = other.x - proj.x;
        const dy = other.y - proj.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < radius * 3) {
          other.vx += (dx / (dist || 1)) * 0.5;
          other.vy += (dy / (dist || 1)) * 0.5;
        }
      }
    }

    // Splinter particles
    if (w.splinterAmount > 0) {
      const count = Math.min(w.splinterAmount, 30);
      for (let s = 0; s < count; s++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.5 + Math.random() * 2;
        this.particles.push(new Particle(
          proj.x, proj.y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          w.splinterColour || 66,
          20 + Math.floor(Math.random() * 30),
          CONSTANTS.BLOOD.GRAVITY
        ));
      }
    }

    // Spawn sub-projectiles (cluster bombs, napalm, etc.)
    // Skip if this is already a sub-projectile to prevent exponential chaining
    if (w.spawnOnExplo && !proj.isSubProjectile) {
      this._spawnSubProjectiles(proj, w);
    }

    // Explosion effect event
    this.events.push({
      type: 'explosion', x: proj.x, y: proj.y, radius,
    });

    // Sound
    const snd = radius >= 12 ? 'exp3' : radius >= 8 ? 'exp2' : 'exp4';
    this.events.push({ type: 'sound', sound: snd, x: proj.x, y: proj.y });
  }

  _spawnSubProjectiles(proj, w) {
    let count = 0;
    let subWeaponId = proj.weaponId;

    if (w.spawnOnExplo === 'cluster') {
      count = 5;
    } else if (w.spawnOnExplo === 'napalm') {
      count = 8;
    } else if (w.spawnOnExplo === 'chiquita') {
      count = 6;
    } else if (w.spawnOnExplo === 'crackler') {
      count = 4;
    }

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 1.5;
      const subProj = new Projectile(
        this.nextProjectileId++,
        subWeaponId,
        proj.ownerId,
        proj.x, proj.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed
      );
      subProj.exploTimer = 30 + Math.floor(Math.random() * 60);
      subProj.isSubProjectile = true;
      this.projectiles.push(subProj);
    }
  }

  _damageWorm(worm, damage, attackerId) {
    worm.health -= damage;
    worm.lastDamageBy = attackerId;

    this.events.push({
      type: 'damage', targetId: worm.id, damage, attackerId,
    });

    if (worm.health <= 0) {
      this._killWorm(worm, attackerId);
    }
  }

  _killWorm(worm, killerId) {
    worm.alive = false;
    worm.health = 0;
    worm.respawnTimer = CONSTANTS.TICK_RATE * 3; // 3 seconds respawn
    worm.deaths++;
    worm.rope.active = false;
    worm.rope.attached = false;

    // Blood explosion
    this._spawnBlood(worm.x, worm.y, 50);

    // Score
    if (killerId !== worm.id && killerId >= 0) {
      const killer = this.worms.get(killerId);
      if (killer) {
        if (this.gameMode === CONSTANTS.MODE.TEAM_DEATHMATCH && killer.team === worm.team) {
          // Team kill - no points
        } else {
          killer.kills++;
        }
      }
    }

    // Last man standing - lose a life
    if (this.gameMode === CONSTANTS.MODE.LAST_MAN_STANDING) {
      worm.lives--;
      if (worm.lives <= 0) {
        worm.respawnTimer = 999999; // Don't respawn
      }
    }

    // Death sound
    const deathSounds = ['death1', 'death2', 'death3'];
    this.events.push({
      type: 'sound',
      sound: deathSounds[Math.floor(Math.random() * deathSounds.length)],
      x: worm.x, y: worm.y,
    });

    this.events.push({
      type: 'kill', killerId, victimId: worm.id,
    });

    this._checkGameOver();
  }

  _respawnWorm(worm) {
    const pos = this.findSpawnPoint();
    worm.x = pos.x;
    worm.y = pos.y;
    worm.vx = 0;
    worm.vy = 0;
    worm.health = CONSTANTS.WORM.HEALTH;
    worm.alive = true;
    worm.rope.active = false;
    worm.rope.attached = false;
    worm.initAmmo();
    this.events.push({ type: 'sound', sound: 'alive', x: worm.x, y: worm.y });
    this.events.push({ type: 'respawn', id: worm.id, x: worm.x, y: worm.y });
  }

  _spawnBlood(x, y, amount) {
    const count = Math.min(amount, 20);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.3 + Math.random() * 1.5;
      this.particles.push(new Particle(
        x, y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        CONSTANTS.BLOOD.FIRST_COLOR + Math.floor(Math.random() * CONSTANTS.BLOOD.NUM_COLORS),
        30 + Math.floor(Math.random() * 40),
        CONSTANTS.BLOOD.GRAVITY
      ));
    }
  }

  _updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.life--;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      // Stick to terrain
      if (this.isSolid(p.x, p.y)) {
        p.vx = 0;
        p.vy = 0;
        // Blood stains on terrain
        if (p.color >= CONSTANTS.BLOOD.FIRST_COLOR && p.life > 5) {
          const px = Math.floor(p.x);
          const py = Math.floor(p.y);
          if (px > 0 && px < this.mapWidth && py > 0 && py < this.mapHeight) {
            // Don't color background, the blood sticks to terrain
          }
        }
      }

      // Out of bounds
      if (p.x < 0 || p.x >= this.mapWidth || p.y < 0 || p.y >= this.mapHeight) {
        this.particles.splice(i, 1);
      }
    }

    // Limit particles
    while (this.particles.length > CONSTANTS.BLOOD.LIMIT) {
      this.particles.shift();
    }
  }

  _updateBonuses() {
    for (let i = this.bonuses.length - 1; i >= 0; i--) {
      const b = this.bonuses[i];
      if (!b.active) {
        this.bonuses.splice(i, 1);
        continue;
      }

      b.vy += CONSTANTS.BONUS.GRAVITY;
      b.x += b.vx;
      b.y += b.vy;
      b.timer--;

      // Flicker before expiring
      if (b.timer < CONSTANTS.BONUS.FLICKER_TIME) {
        b.flickering = true;
      }

      if (b.timer <= 0) {
        b.active = false;
        continue;
      }

      // Terrain collision
      if (this.isSolid(b.x, b.y)) {
        b.vy = -b.vy * (CONSTANTS.BONUS.BOUNCE_MULT / CONSTANTS.BONUS.BOUNCE_DIV);
        b.vx = b.vx * (CONSTANTS.BONUS.BOUNCE_MULT / CONSTANTS.BONUS.BOUNCE_DIV);
        b.y -= b.vy;
      }

      // Worm pickup
      for (const [, worm] of this.worms) {
        if (!worm.alive) continue;
        const dx = worm.x - b.x;
        const dy = worm.y - b.y;
        if (Math.sqrt(dx * dx + dy * dy) < 8) {
          if (b.type === 0) {
            // Health bonus
            const heal = CONSTANTS.BONUS.MIN_HEALTH + Math.floor(Math.random() * CONSTANTS.BONUS.HEALTH_VAR);
            worm.health = Math.min(CONSTANTS.WORM.HEALTH, worm.health + heal);
          } else {
            // Weapon bonus - refill ammo
            const slot = Math.floor(Math.random() * 5);
            worm.ammo[slot] = WEAPONS[worm.weapons[slot]].ammo;
            worm.loadingLeft[slot] = 0;
          }
          b.active = false;
          this.events.push({ type: 'sound', sound: 'reloaded', x: b.x, y: b.y });
          break;
        }
      }
    }
  }

  _spawnBonus() {
    const pos = this.findSpawnPoint();
    const type = Math.random() < 0.6 ? 0 : 1; // 60% health, 40% weapon
    const bonus = new Bonus(this.nextBonusId++, pos.x, pos.y, type);
    this.bonuses.push(bonus);
  }

  _updateFlag() {
    if (!this.flag) {
      // Spawn flag
      const pos = this.findSpawnPoint();
      this.flag = { x: pos.x, y: pos.y, vy: 0, holder: null };
    }

    if (this.flag.holder !== null) {
      const worm = this.worms.get(this.flag.holder);
      if (worm && worm.alive) {
        this.flag.x = worm.x;
        this.flag.y = worm.y - 5;
        // Score while holding
        if (this.tick % CONSTANTS.TICK_RATE === 0) {
          worm.kills++;
          this._checkGameOver();
        }
      } else {
        this.flag.holder = null;
      }
    } else {
      // Flag falls with gravity
      this.flag.vy += CONSTANTS.BONUS.GRAVITY;
      this.flag.y += this.flag.vy;
      if (this.isSolid(this.flag.x, this.flag.y)) {
        this.flag.vy = 0;
        this.flag.y = Math.floor(this.flag.y) - 1;
      }

      // Check pickup
      for (const [id, worm] of this.worms) {
        if (!worm.alive) continue;
        const dx = worm.x - this.flag.x;
        const dy = worm.y - this.flag.y;
        if (Math.sqrt(dx * dx + dy * dy) < 10) {
          this.flag.holder = id;
          this.events.push({ type: 'flag_pickup', playerId: id });
          break;
        }
      }
    }
  }

  _checkGameOver() {
    if (this.gameOver) return;

    if (this.gameMode === CONSTANTS.MODE.DEATHMATCH || this.gameMode === CONSTANTS.MODE.HOLD_THE_FLAG) {
      for (const [, worm] of this.worms) {
        const limit = this.gameMode === CONSTANTS.MODE.HOLD_THE_FLAG ? this.scoreLimit * 10 : this.scoreLimit;
        if (worm.kills >= limit) {
          this.gameOver = true;
          this.winner = worm.id;
          this.events.push({ type: 'game_over', winner: worm.id, name: worm.name });
          return;
        }
      }
    }

    if (this.gameMode === CONSTANTS.MODE.LAST_MAN_STANDING) {
      let alive = [];
      for (const [, worm] of this.worms) {
        if (worm.lives > 0) alive.push(worm);
      }
      if (alive.length <= 1 && this.worms.size > 1) {
        this.gameOver = true;
        this.winner = alive.length === 1 ? alive[0].id : null;
        this.events.push({ type: 'game_over', winner: this.winner });
        return;
      }
    }

    if (this.gameMode === CONSTANTS.MODE.TEAM_DEATHMATCH) {
      const teamScores = [0, 0];
      for (const [, worm] of this.worms) {
        teamScores[worm.team] += worm.kills;
      }
      for (let t = 0; t < 2; t++) {
        if (teamScores[t] >= this.scoreLimit) {
          this.gameOver = true;
          this.winner = t;
          this.events.push({ type: 'game_over', winnerTeam: t });
          return;
        }
      }
    }

    // Time up
    if (this.timeLeft <= 0) {
      this.gameOver = true;
      let best = null;
      let bestScore = -1;
      for (const [, worm] of this.worms) {
        if (worm.kills > bestScore) {
          bestScore = worm.kills;
          best = worm.id;
        }
      }
      this.winner = best;
      this.events.push({ type: 'game_over', winner: best });
    }
  }

  getState() {
    const worms = {};
    for (const [id, w] of this.worms) {
      worms[id] = {
        id: w.id, name: w.name, x: w.x, y: w.y, vx: w.vx, vy: w.vy,
        aim: w.aim, facing: w.facing, health: w.health, alive: w.alive,
        currentWeapon: w.currentWeapon, weapons: w.weapons, ammo: w.ammo,
        loadingLeft: w.loadingLeft, kills: w.kills, deaths: w.deaths,
        lives: w.lives, team: w.team, showWeapon: w.showWeapon, color: w.color,
        rope: {
          active: w.rope.active, attached: w.rope.attached,
          x: w.rope.x, y: w.rope.y, anchorX: w.rope.anchorX, anchorY: w.rope.anchorY,
        },
      };
    }
    return {
      tick: this.tick,
      worms,
      projectiles: this.projectiles.map(p => ({
        id: p.id, weaponId: p.weaponId, ownerId: p.ownerId,
        x: p.x, y: p.y, vx: p.vx, vy: p.vy, age: p.age,
      })),
      bonuses: this.bonuses.map(b => ({
        id: b.id, x: b.x, y: b.y, type: b.type, flickering: b.flickering, weaponId: b.weaponId,
      })),
      flag: this.flag,
      gameMode: this.gameMode,
      timeLeft: this.timeLeft,
      gameOver: this.gameOver,
      winner: this.winner,
      events: this.events,
    };
  }

  loadState(state) {
    this.tick = state.tick;
    this.worms.clear();
    for (const id in state.worms) {
      const sw = state.worms[id];
      const worm = new Worm(sw.id, sw.name, sw.x, sw.y);
      Object.assign(worm, sw);
      worm.rope = new NinjaRope();
      Object.assign(worm.rope, sw.rope);
      this.worms.set(parseInt(id), worm);
    }
    this.projectiles = state.projectiles.map(p => {
      const proj = new Projectile(p.id, p.weaponId, p.ownerId, p.x, p.y, p.vx, p.vy);
      proj.age = p.age;
      return proj;
    });
    this.flag = state.flag;
    this.gameMode = state.gameMode;
    this.timeLeft = state.timeLeft;
    this.gameOver = state.gameOver;
    this.winner = state.winner;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GameEngine, Worm, Projectile, Particle, NinjaRope, Bonus, getAimDirX, getAimDirY, WEAPONS };
} else if (typeof window !== 'undefined') {
  window.GameEngine = GameEngine;
  window.Worm = Worm;
  window.Projectile = Projectile;
  window.Particle = Particle;
  window.getAimDirX = getAimDirX;
  window.getAimDirY = getAimDirY;
}

})();
