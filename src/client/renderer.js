// Liero26 - Canvas Renderer
// Pixel-perfect rendering at native resolution, scaled up

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    // Game renders at native Liero resolution
    this.gameWidth = 504;
    this.gameHeight = 350;

    // Off-screen buffer for pixel-perfect rendering
    this.buffer = document.createElement('canvas');
    this.buffer.width = this.gameWidth;
    this.buffer.height = this.gameHeight;
    this.bufCtx = this.buffer.getContext('2d');
    this.bufCtx.imageSmoothingEnabled = false;

    // ImageData for direct pixel manipulation
    this.imageData = this.bufCtx.createImageData(this.gameWidth, this.gameHeight);
    this.pixels = new Uint32Array(this.imageData.data.buffer);

    // Map background buffer (static terrain)
    this.mapBuffer = document.createElement('canvas');
    this.mapBuffer.width = this.gameWidth;
    this.mapBuffer.height = this.gameHeight;
    this.mapBufCtx = this.mapBuffer.getContext('2d');

    // Viewport / camera
    this.camX = 0;
    this.camY = 0;
    this.viewWidth = 320;
    this.viewHeight = 200;
    this.scale = 1;

    // Animation state
    this.animTick = 0;
    this.screenShake = 0;
    this.screenShakeX = 0;
    this.screenShakeY = 0;

    // Explosions effect list
    this.explosions = [];

    // Map data cache
    this.mapDirty = true;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const maxW = window.innerWidth;
    const maxH = window.innerHeight;

    // Calculate scale to fit while maintaining aspect ratio
    // We show a viewport of the map, not the whole map
    const scaleX = maxW / this.viewWidth;
    const scaleY = maxH / this.viewHeight;
    this.scale = Math.max(1, Math.floor(Math.min(scaleX, scaleY)));

    this.canvas.width = this.viewWidth * this.scale;
    this.canvas.height = this.viewHeight * this.scale;
    this.canvas.style.width = (this.viewWidth * this.scale) + 'px';
    this.canvas.style.height = (this.viewHeight * this.scale) + 'px';
    this.ctx.imageSmoothingEnabled = false;
  }

  setPixel(x, y, r, g, b, a) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || x >= this.gameWidth || y < 0 || y >= this.gameHeight) return;
    this.pixels[y * this.gameWidth + x] = (a << 24) | (b << 16) | (g << 8) | r;
  }

  getPixelFromPalette(index) {
    if (index < 0 || index >= PALETTE.length) return [0, 0, 0];
    return PALETTE[index];
  }

  updateCamera(targetX, targetY) {
    // Smooth camera follow
    const destX = targetX - this.viewWidth / 2;
    const destY = targetY - this.viewHeight / 2;
    this.camX += (destX - this.camX) * 0.12;
    this.camY += (destY - this.camY) * 0.12;

    // Clamp to map bounds
    this.camX = Math.max(0, Math.min(this.gameWidth - this.viewWidth, this.camX));
    this.camY = Math.max(0, Math.min(this.gameHeight - this.viewHeight, this.camY));

    // Screen shake
    if (this.screenShake > 0) {
      this.screenShakeX = (Math.random() - 0.5) * this.screenShake;
      this.screenShakeY = (Math.random() - 0.5) * this.screenShake;
      this.screenShake *= 0.85;
      if (this.screenShake < 0.5) this.screenShake = 0;
    } else {
      this.screenShakeX = 0;
      this.screenShakeY = 0;
    }
  }

  renderMap(map, mapColors) {
    // Render the full map to imageData
    for (let y = 0; y < this.gameHeight; y++) {
      for (let x = 0; x < this.gameWidth; x++) {
        const idx = y * this.gameWidth + x;
        const colorIdx = mapColors[idx];
        const mat = map[idx];

        if (mat === 0) {
          // Background - dark sky gradient
          const grad = Math.floor(20 + (y / this.gameHeight) * 15);
          this.pixels[idx] = (255 << 24) | (grad << 16) | (grad / 2 << 8) | (grad / 3);
        } else {
          const c = this.getPixelFromPalette(colorIdx);
          this.pixels[idx] = (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
        }
      }
    }
  }

  render(state, map, mapColors, localPlayerId) {
    this.animTick++;

    // Render full map to pixel buffer
    this.renderMap(map, mapColors);

    // Render bonuses
    if (state.bonuses) {
      for (const b of state.bonuses) {
        if (b.flickering && this.animTick % 4 < 2) continue;
        this.renderBonus(b);
      }
    }

    // Render flag (hold the flag mode)
    if (state.flag) {
      this.renderFlag(state.flag);
    }

    // Render projectiles
    if (state.projectiles) {
      for (const p of state.projectiles) {
        this.renderProjectile(p);
      }
    }

    // Render particles (client-side only)
    if (window._particles) {
      for (const p of window._particles) {
        if (!p.active) continue;
        const c = this.getPixelFromPalette(p.color);
        const alpha = Math.min(1, p.life / 10);
        this.setPixel(Math.floor(p.x), Math.floor(p.y),
          c[0] * alpha, c[1] * alpha, c[2] * alpha, 255);
      }
    }

    // Render worms
    for (const id in state.worms) {
      const w = state.worms[id];
      if (!w.alive) continue;
      this.renderWorm(w, parseInt(id) === localPlayerId);
    }

    // Update camera to follow local player
    const localWorm = state.worms[localPlayerId];
    if (localWorm) {
      this.updateCamera(localWorm.x, localWorm.y);
    }

    // Render explosions
    this.renderExplosions();

    // Copy visible viewport from buffer to screen
    this.bufCtx.putImageData(this.imageData, 0, 0);

    // Draw viewport region scaled to canvas
    const sx = Math.floor(this.camX + this.screenShakeX);
    const sy = Math.floor(this.camY + this.screenShakeY);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(
      this.buffer,
      sx, sy, this.viewWidth, this.viewHeight,
      0, 0, this.canvas.width, this.canvas.height
    );

    // Draw HUD overlay (on scaled canvas)
    this.renderHUD(state, localPlayerId);
  }

  renderWorm(w, isLocal) {
    const colors = WORM_COLORS[w.color % WORM_COLORS.length];
    const x = Math.floor(w.x);
    const y = Math.floor(w.y);
    const r = 3;

    // Draw worm body (3-pixel radius circle with shading)
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= r) {
          const shade = Math.floor(dist);
          const c = colors.body[Math.min(shade, colors.body.length - 1)];
          this.setPixel(x + dx, y + dy, c[0], c[1], c[2], 255);
        }
      }
    }

    // Draw outline
    const outPts = [[-r-1,0],[r+1,0],[0,-r-1],[0,r+1],[-r,-r],[r,-r],[-r,r],[r,r]];
    for (const [dx, dy] of outPts) {
      this.setPixel(x + dx, y + dy, colors.outline[0], colors.outline[1], colors.outline[2], 255);
    }

    // Draw aiming crosshair
    const aimX = getAimDirX(w.aim, w.facing);
    const aimY = getAimDirY(w.aim);
    const crossDist = 12;
    const cx = Math.floor(x + aimX * crossDist);
    const cy = Math.floor(y + aimY * crossDist);
    const cc = colors.crosshair;

    // Crosshair pattern
    this.setPixel(cx, cy, cc[0], cc[1], cc[2], 255);
    this.setPixel(cx - 1, cy, cc[0], cc[1], cc[2], 255);
    this.setPixel(cx + 1, cy, cc[0], cc[1], cc[2], 255);
    this.setPixel(cx, cy - 1, cc[0], cc[1], cc[2], 255);
    this.setPixel(cx, cy + 1, cc[0], cc[1], cc[2], 255);

    // Laser sight
    if (w.weapons && WEAPONS[w.weapons[w.currentWeapon]] && WEAPONS[w.weapons[w.currentWeapon]].laserSight) {
      for (let d = 5; d < 200; d += 2) {
        const lx = Math.floor(x + aimX * d);
        const ly = Math.floor(y + aimY * d);
        if (lx < 0 || lx >= this.gameWidth || ly < 0 || ly >= this.gameHeight) break;
        this.setPixel(lx, ly, 255, 0, 0, 255);
      }
    }

    // Draw ninja rope
    if (w.rope && w.rope.active) {
      this.renderRope(x, y, w.rope);
    }

    // Draw name tag
    if (!isLocal || true) {
      this.renderText(w.name, x - (w.name.length * 2), y - r - 8,
        cc[0], cc[1], cc[2], true);
    }

    // Health bar (only for local player's view or when close)
    if (isLocal) {
      const barW = 20;
      const barX = x - barW / 2;
      const barY = y + r + 3;
      const healthPct = w.health / 100;

      // Background
      for (let i = 0; i < barW; i++) {
        this.setPixel(barX + i, barY, 40, 40, 40, 255);
        this.setPixel(barX + i, barY + 1, 40, 40, 40, 255);
      }
      // Health fill
      const fillW = Math.floor(barW * healthPct);
      const hr = healthPct > 0.5 ? Math.floor(255 * (1 - healthPct) * 2) : 255;
      const hg = healthPct > 0.5 ? 255 : Math.floor(255 * healthPct * 2);
      for (let i = 0; i < fillW; i++) {
        this.setPixel(barX + i, barY, hr, hg, 0, 255);
        this.setPixel(barX + i, barY + 1, hr, hg, 0, 255);
      }
    }

    // Show weapon indicator
    if (w.showWeapon && w.weapons) {
      const weapName = WEAPONS[w.weapons[w.currentWeapon]].name;
      this.renderText(weapName, x - (weapName.length * 2), y - r - 15,
        255, 255, 0, true);
    }
  }

  renderRope(wx, wy, rope) {
    const ex = rope.attached ? rope.anchorX : rope.x;
    const ey = rope.attached ? rope.anchorY : rope.y;

    // Draw rope line
    const dx = ex - wx;
    const dy = ey - wy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;

    const steps = Math.floor(dist);
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const x = Math.floor(wx + dx * t);
      const y = Math.floor(wy + dy * t);
      // Rope color oscillation
      const c = PALETTE[62 + (i % 3)];
      this.setPixel(x, y, c[0], c[1], c[2], 255);
    }

    // Draw anchor point
    if (rope.attached) {
      this.setPixel(Math.floor(ex), Math.floor(ey), 255, 255, 255, 255);
      this.setPixel(Math.floor(ex) - 1, Math.floor(ey), 200, 200, 200, 255);
      this.setPixel(Math.floor(ex) + 1, Math.floor(ey), 200, 200, 200, 255);
    }
  }

  renderProjectile(p) {
    const w = WEAPONS[p.weaponId];
    if (!w) return;
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);

    if (w.isLaser) {
      // Draw laser beam
      const len = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (len === 0) return;
      const nx = p.vx / len;
      const ny = p.vy / len;
      const beamLen = 300;
      for (let d = 0; d < beamLen; d++) {
        const bx = Math.floor(p.x + nx * d);
        const by = Math.floor(p.y + ny * d);
        const intensity = 1 - (d / beamLen) * 0.5;
        const r = Math.floor(255 * intensity);
        const g = Math.floor(64 * intensity);
        const b = Math.floor(64 * intensity);
        this.setPixel(bx, by, r, g, b, 255);
      }
      return;
    }

    if (w.colorAnim) {
      // Animated color projectile (flames, etc.)
      const frame = (this.animTick + p.id) % (w.colorAnim.to - w.colorAnim.from + 1);
      const c = PALETTE[w.colorAnim.from + frame];
      const size = w.shotType === 1 ? 2 : 1;
      for (let dy = -size; dy <= size; dy++) {
        for (let dx = -size; dx <= size; dx++) {
          if (Math.abs(dx) + Math.abs(dy) <= size) {
            this.setPixel(x + dx, y + dy, c[0], c[1], c[2], 255);
          }
        }
      }
      return;
    }

    if (w.startFrame !== undefined && w.startFrame >= 0) {
      // Sprite-based projectile (bazooka, grenade, etc.)
      const size = w.shotType === 3 ? 2 : 1;
      // Use weapon-based colors
      const colors = [
        [180, 180, 180], // outer
        [220, 220, 220], // middle
        [255, 255, 255], // center
      ];
      if (w.name.includes('NUKE') || w.name.includes('DOOMSDAY')) {
        colors[0] = [100, 100, 0];
        colors[1] = [150, 150, 0];
        colors[2] = [200, 200, 0];
      } else if (w.name.includes('MINE') || w.name.includes('TRAP')) {
        colors[0] = [80, 80, 80];
        colors[1] = [120, 120, 120];
        colors[2] = [160, 160, 160];
      }

      for (let dy = -size; dy <= size; dy++) {
        for (let dx = -size; dx <= size; dx++) {
          const dist = Math.abs(dx) + Math.abs(dy);
          if (dist <= size) {
            const c = colors[Math.min(dist, colors.length - 1)];
            this.setPixel(x + dx, y + dy, c[0], c[1], c[2], 255);
          }
        }
      }
      return;
    }

    // Default: color bullet (shotgun pellets, etc.)
    if (w.color > 0) {
      const c = PALETTE[w.color] || [200, 200, 200];
      this.setPixel(x, y, c[0], c[1], c[2], 255);
      // Trail
      const tx = Math.floor(x - p.vx);
      const ty = Math.floor(y - p.vy);
      this.setPixel(tx, ty, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 255);
    } else {
      this.setPixel(x, y, 255, 255, 255, 255);
    }
  }

  renderBonus(b) {
    const x = Math.floor(b.x);
    const y = Math.floor(b.y);
    const size = 4;

    if (b.type === 0) {
      // Health bonus - red cross
      for (let i = -size; i <= size; i++) {
        this.setPixel(x + i, y, 255, 0, 0, 255);
        this.setPixel(x + i, y + 1, 255, 0, 0, 255);
        this.setPixel(x, y + i, 255, 0, 0, 255);
        this.setPixel(x + 1, y + i, 255, 0, 0, 255);
      }
      // White outline
      for (let i = -size - 1; i <= size + 1; i++) {
        this.setPixel(x + i, y - size - 1, 255, 255, 255, 255);
        this.setPixel(x + i, y + size + 1, 255, 255, 255, 255);
      }
    } else {
      // Weapon bonus - ammo box
      for (let dy = -size; dy <= size; dy++) {
        for (let dx = -size; dx <= size; dx++) {
          if (Math.abs(dx) === size || Math.abs(dy) === size) {
            this.setPixel(x + dx, y + dy, 0, 128, 255, 255);
          } else {
            this.setPixel(x + dx, y + dy, 0, 64, 128, 255);
          }
        }
      }
      // "W" letter
      this.setPixel(x - 2, y - 1, 255, 255, 255, 255);
      this.setPixel(x - 2, y, 255, 255, 255, 255);
      this.setPixel(x - 2, y + 1, 255, 255, 255, 255);
      this.setPixel(x - 1, y + 2, 255, 255, 255, 255);
      this.setPixel(x, y + 1, 255, 255, 255, 255);
      this.setPixel(x + 1, y + 2, 255, 255, 255, 255);
      this.setPixel(x + 2, y - 1, 255, 255, 255, 255);
      this.setPixel(x + 2, y, 255, 255, 255, 255);
      this.setPixel(x + 2, y + 1, 255, 255, 255, 255);
    }
  }

  renderFlag(flag) {
    const x = Math.floor(flag.x);
    const y = Math.floor(flag.y);
    // Flag pole
    for (let i = 0; i < 10; i++) {
      this.setPixel(x, y - i, 150, 100, 50, 255);
    }
    // Flag cloth (animated wave)
    for (let fy = 0; fy < 5; fy++) {
      for (let fx = 0; fx < 8; fx++) {
        const wave = Math.sin((this.animTick + fx) * 0.3) * 1;
        this.setPixel(x + 1 + fx, y - 9 + fy + Math.floor(wave), 255, 200, 0, 255);
      }
    }
  }

  addExplosion(x, y, radius) {
    this.explosions.push({ x, y, radius, age: 0, maxAge: 12 });
    this.screenShake = Math.min(this.screenShake + radius * 0.5, 10);
  }

  renderExplosions() {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.age++;
      if (e.age > e.maxAge) {
        this.explosions.splice(i, 1);
        continue;
      }

      const progress = e.age / e.maxAge;
      const currentR = e.radius * (0.5 + progress * 0.5);

      // Flash ring
      for (let a = 0; a < 32; a++) {
        const angle = (a / 32) * Math.PI * 2;
        const ring = currentR * (0.8 + Math.random() * 0.4);
        const px = Math.floor(e.x + Math.cos(angle) * ring);
        const py = Math.floor(e.y + Math.sin(angle) * ring);
        const intensity = 1 - progress;
        const r = Math.floor(255 * intensity);
        const g = Math.floor(200 * intensity * (1 - progress));
        const b = Math.floor(100 * intensity * (1 - progress * 2));
        this.setPixel(px, py, r, Math.max(0, g), Math.max(0, b), 255);
      }

      // Center flash (early frames)
      if (e.age < 4) {
        const flashR = Math.floor(e.radius * 0.5);
        for (let dy = -flashR; dy <= flashR; dy++) {
          for (let dx = -flashR; dx <= flashR; dx++) {
            if (dx * dx + dy * dy <= flashR * flashR) {
              const fi = 1 - e.age / 4;
              this.setPixel(Math.floor(e.x) + dx, Math.floor(e.y) + dy,
                255, Math.floor(255 * fi), Math.floor(128 * fi), 255);
            }
          }
        }
      }
    }
  }

  renderHUD(state, localPlayerId) {
    const ctx = this.ctx;
    const s = this.scale;
    const w = state.worms[localPlayerId];

    ctx.save();

    // Weapon display (bottom)
    if (w && w.weapons) {
      const barY = this.canvas.height - 28 * s;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, barY, this.canvas.width, 28 * s);

      for (let i = 0; i < 5; i++) {
        const weapon = WEAPONS[w.weapons[i]];
        if (!weapon) continue;

        const slotX = 10 * s + i * (this.canvas.width / 5);
        const isActive = i === w.currentWeapon;

        // Slot background
        if (isActive) {
          ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
          ctx.fillRect(slotX - 2 * s, barY + 1 * s, (this.canvas.width / 5) - 4 * s, 26 * s);
        }

        // Weapon name
        ctx.fillStyle = isActive ? '#FFD700' : '#AAAAAA';
        ctx.font = `${8 * s}px monospace`;
        ctx.fillText(weapon.name, slotX, barY + 10 * s);

        // Ammo bar
        const ammo = w.ammo[i];
        const maxAmmo = weapon.ammo;
        const loading = w.loadingLeft[i] > 0;

        if (loading) {
          ctx.fillStyle = '#FF4444';
          ctx.font = `${6 * s}px monospace`;
          ctx.fillText('LOADING...', slotX, barY + 20 * s);
        } else {
          const barWidth = 50 * s;
          const ammoPct = ammo / maxAmmo;
          ctx.fillStyle = '#333';
          ctx.fillRect(slotX, barY + 14 * s, barWidth, 4 * s);
          ctx.fillStyle = ammoPct > 0.3 ? '#44FF44' : '#FF4444';
          ctx.fillRect(slotX, barY + 14 * s, barWidth * ammoPct, 4 * s);

          // Ammo count
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `${6 * s}px monospace`;
          ctx.fillText(`${ammo}/${maxAmmo}`, slotX + barWidth + 4 * s, barY + 18 * s);
        }
      }
    }

    // Health display (top left)
    if (w) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(4 * s, 4 * s, 104 * s, 16 * s);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `${8 * s}px monospace`;
      ctx.fillText('HP', 8 * s, 14 * s);

      const hpPct = Math.max(0, w.health / 100);
      ctx.fillStyle = '#333';
      ctx.fillRect(24 * s, 7 * s, 80 * s, 10 * s);
      ctx.fillStyle = hpPct > 0.5 ? '#44FF44' : hpPct > 0.25 ? '#FFFF00' : '#FF4444';
      ctx.fillRect(24 * s, 7 * s, 80 * s * hpPct, 10 * s);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(`${Math.ceil(w.health)}`, 80 * s, 14 * s);
    }

    // Scoreboard (top right)
    const scores = [];
    for (const id in state.worms) {
      const worm = state.worms[id];
      scores.push({ name: worm.name, kills: worm.kills, deaths: worm.deaths, id: parseInt(id) });
    }
    scores.sort((a, b) => b.kills - a.kills);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    const scoreW = 120 * s;
    ctx.fillRect(this.canvas.width - scoreW - 4 * s, 4 * s, scoreW, (4 + scores.length * 10) * s);
    ctx.font = `${7 * s}px monospace`;

    for (let i = 0; i < scores.length; i++) {
      const sc = scores[i];
      const isLocal = sc.id === localPlayerId;
      ctx.fillStyle = isLocal ? '#FFD700' : '#FFFFFF';
      const colors = WORM_COLORS[state.worms[sc.id].color % WORM_COLORS.length];
      const cc = colors.crosshair;
      ctx.fillStyle = `rgb(${cc[0]},${cc[1]},${cc[2]})`;
      ctx.fillText(`${sc.name}: ${sc.kills}`, this.canvas.width - scoreW, (13 + i * 10) * s);
    }

    // Timer (top center)
    if (state.timeLeft !== undefined) {
      const seconds = Math.max(0, Math.floor(state.timeLeft / 70));
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(this.canvas.width / 2 - 25 * s, 4 * s, 50 * s, 14 * s);
      ctx.fillStyle = seconds < 30 ? '#FF4444' : '#FFFFFF';
      ctx.font = `${10 * s}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(timeStr, this.canvas.width / 2, 15 * s);
      ctx.textAlign = 'left';
    }

    // Game mode indicator
    if (state.gameMode !== undefined) {
      ctx.fillStyle = '#888888';
      ctx.font = `${6 * s}px monospace`;
      ctx.fillText(CONSTANTS.MODE_NAMES[state.gameMode], 8 * s, 28 * s);
    }

    // Player direction indicators (dots at screen edge showing where other players are)
    if (w && w.alive) {
      for (const id in state.worms) {
        if (parseInt(id) === localPlayerId) continue;
        const other = state.worms[id];
        if (!other.alive) continue;

        const dx = other.x - w.x;
        const dy = other.y - w.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < this.viewWidth * 0.4) continue;

        const angle = Math.atan2(dy, dx);
        const edgeX = this.canvas.width / 2 + Math.cos(angle) * (this.canvas.width / 2 - 10 * s);
        const edgeY = this.canvas.height / 2 + Math.sin(angle) * (this.canvas.height / 2 - 10 * s);

        const colors = WORM_COLORS[other.color % WORM_COLORS.length].crosshair;
        ctx.fillStyle = `rgb(${colors[0]},${colors[1]},${colors[2]})`;
        ctx.beginPath();
        ctx.arc(edgeX, edgeY, 3 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Game over overlay
    if (state.gameOver) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFD700';
      ctx.font = `bold ${20 * s}px monospace`;
      ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 20 * s);

      if (state.winner !== null && state.winner !== undefined) {
        const winnerWorm = state.worms[state.winner];
        if (winnerWorm) {
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `${12 * s}px monospace`;
          ctx.fillText(`Winner: ${winnerWorm.name}`, this.canvas.width / 2, this.canvas.height / 2 + 10 * s);
          ctx.fillText(`Kills: ${winnerWorm.kills}`, this.canvas.width / 2, this.canvas.height / 2 + 25 * s);
        }
      }

      ctx.fillStyle = '#888888';
      ctx.font = `${8 * s}px monospace`;
      ctx.fillText('New match starting soon...', this.canvas.width / 2, this.canvas.height / 2 + 50 * s);
      ctx.textAlign = 'left';
    }

    ctx.restore();
  }

  // Tiny pixel font renderer for in-game text
  renderText(text, x, y, r, g, b, shadow) {
    // Simple 4x5 pixel font
    const chars = {
      'A': [0x69f99], 'B': [0xe9e9e], 'C': [0x79887], 'D': [0xe9997e],
      'E': [0xf8e8f], 'F': [0xf8e88], 'G': [0x798b7], 'H': [0x99f99],
      'I': [0xe444e], 'J': [0x1119e], 'K': [0x9aca9], 'L': [0x8888f],
      'M': [0x9f999], 'N': [0x9db99], 'O': [0x69996], 'P': [0xe9e88],
      'Q': [0x69b57], 'R': [0xe9ea9], 'S': [0x78167], 'T': [0xf4444],
      'U': [0x99996], 'V': [0x999a4], 'W': [0x999f9], 'X': [0x96699],
      'Y': [0x99744], 'Z': [0xf124f],
      '0': [0x6bd96], '1': [0x4c44e], '2': [0x6916f], '3': [0xe1617],
      '4': [0x99f11], '5': [0xf8e1e], '6': [0x78e97], '7': [0xf1244],
      '8': [0x69696], '9': [0x69711], ' ': [0x00000], ':': [0x04040],
      '-': [0x00e00], '.': [0x00004], '_': [0x0000f], '/': [0x11248],
      '!': [0x44404],
    };

    text = text.toUpperCase();
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const glyph = chars[ch] ? chars[ch][0] : 0;
      if (glyph === 0 && ch !== ' ') continue;
      for (let py = 0; py < 5; py++) {
        for (let px = 0; px < 4; px++) {
          const bit = (glyph >> (19 - py * 4 - px)) & 1;
          if (bit) {
            if (shadow) {
              this.setPixel(x + i * 4 + px + 1, y + py + 1, 0, 0, 0, 255);
            }
            this.setPixel(x + i * 4 + px, y + py, r, g, b, 255);
          }
        }
      }
    }
  }
}
