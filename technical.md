# Liero26 — Technical Reference

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Repository Layout](#2-repository-layout)
3. [Game Engine (`engine.js`)](#3-game-engine-enginejs)
4. [Weapons System (`weapons.js`)](#4-weapons-system-weaponsjs)
5. [Sprite & Rendering System (`renderer.js`)](#5-sprite--rendering-system-rendererjs)
6. [Palette & Colours (`palette.js`)](#6-palette--colours-palettejs)
7. [Sound Engine (`sound.js`)](#7-sound-engine-soundjs)
8. [Client Application (`game.js`)](#8-client-application-gamejs)
9. [Server (`server/index.js`)](#9-server-serverindexjs)
10. [Network Protocol](#10-network-protocol)
11. [Shared Constants (`constants.js`)](#11-shared-constants-constantsjs)
12. [Adding Mods — Characters & Weapon Sprites](#12-adding-mods--characters--weapon-sprites)

---

## 1. Project Overview

Liero26 is a browser-based multiplayer clone of the classic DOS game **Liero v1.33** (1998).  
It runs an authoritative game server in Node.js and renders the game inside an HTML5 `<canvas>` on the client.

Technology stack:
- **Server:** Node.js + Express + `ws` (WebSocket)  
- **Client:** Vanilla JS, HTML5 Canvas 2D, Web Audio API  
- **Shared logic:** Plain JS modules with IIFE wrapping for dual Node.js/browser compatibility  
- **No build step** — scripts are served directly as static files

---

## 2. Repository Layout

```
src/
  shared/
    constants.js   — Physics constants, map size, tick rate, game modes
    weapons.js     — Definitions for all 40 weapons
    palette.js     — 256-colour VGA palette + 6 worm colour sets
    engine.js      — Deterministic game simulation (runs on server AND client)
  server/
    index.js       — Express HTTP + WebSocket server, Room management
  client/
    renderer.js    — Canvas pixel renderer + sprite animation
    sound.js       — Procedural Web Audio sound effects + MIDI music
    game.js        — WebSocket client, input handling, UI screens
public/
  index.html       — Shell HTML with UI screens
  style.css        — UI CSS
  sprites/         — Sprite sheet PNGs (worm character animations)
  midiplayer.js    — Third-party MIDI player library
  music.mid        — Background music
tests/
  test.js          — 54 unit tests (run with `npm test`)
```

---

## 3. Game Engine (`engine.js`)

### 3.1 Design Philosophy

The engine is **deterministic** and runs identically on both the server (authoritative) and the client (for local prediction).  
It exposes itself as a class `GameEngine` via CommonJS (`module.exports`) on Node.js and as `window.GameEngine` in the browser.

### 3.2 Core Classes

| Class | Role |
|-------|------|
| `GameEngine` | Top-level simulation; owns everything below |
| `Worm` | A player character with physics, health, weapons, rope |
| `Projectile` | A fired bullet/grenade/rocket |
| `Particle` | A visual-only blood/splinter/shell particle |
| `NinjaRope` | Grappling hook attached to a Worm |
| `Bonus` | Health or weapon pickup on the map |

### 3.3 Map Generation

The map is a flat `Uint8Array` of `MAP_WIDTH × MAP_HEIGHT` (504 × 350 = 176,400) bytes.  
Each byte is a **material type**:

| Value | Constant | Meaning |
|-------|----------|---------|
| 0 | `BACKGROUND` | Open air — worms and projectiles pass through |
| 1 | `DIRT` | Destructible terrain |
| 4 | `ROCK` | Indestructible terrain |
| 2,8,9,24,32 | Variants | `DIRT_ROCK`, `DIRT2`, `ROCK2`, `WORM_ONLY`, `ROCK3` |

Generation steps:
1. **Multi-octave value noise** (5 octaves, persistence 0.5, bilinear interpolation) fills every cell with a float in `[0, 1]`.
2. Threshold mapping: `> 0.62` → Rock, `0.35–0.62` → Dirt, `< 0.35` → Background.
3. Borders (2-pixel margin) are forced to Rock.
4. **Cave carving**: 8–18 random walks, each carving circles of radius 5–12 through the terrain. Rock has a 30% chance of being carved too.

A parallel `Uint8Array mapColors` stores a palette index per cell for the renderer.

### 3.4 Tick Loop

The server calls `engine.update(inputs)` at **70 Hz** (matching original Liero).  
Order of operations each tick:

```
1. Decrement time-limit counter
2. Process keyboard inputs for each Worm
3. Update Worm physics (gravity, friction, collision)
4. Update NinjaRope physics
5. Update weapon loading timers
6. Update all Projectiles
7. Update all Particles
8. Update all Bonuses
9. Bonus spawn attempt (every 400 ticks, up to 3 bonuses, 30% chance)
10. Hold-the-Flag mode update
```

### 3.5 Worm Physics

```
vx += WALK_VEL * (left/right input)
vx  = clamp(vx, -MAX_VEL_X, MAX_VEL_X)
vx *= FRICTION_MULT / FRICTION_DIV      (89/100 per tick = ~72% after 10 ticks)
vy += GRAVITY                            (1500/65536 per tick)
```

Collision is resolved separately for X then Y axes.  
The worm is a **3-pixel-radius circle** — `_wormFits()` samples corners and the center.

### 3.6 Aim System

Aim is an angle in `[-90°, +90°]` (vertical range).  
It accumulates `aimVel` (like vx/vy) that's driven by up/down keys and decays via `AIM_FRICTION`.  
Conversion to world direction:

```js
dirX = cos(aim_radians) * facing   // facing = 1 (right) or -1 (left)
dirY = -sin(aim_radians)           // negative Y = up on screen
```

### 3.7 Ninja Rope

1. **Fire** — a rope projectile is launched in the aim direction at `ROPE.SPEED` (3.5 px/tick).
2. **Flying** — the rope tip is subject to `ROPE.GRAVITY` and advances each tick.
3. **Attach** — when `isSolid(rope.x, rope.y)` is true, the tip locks to `anchorX/Y`.
4. **Swing** — a pendulum force (`pullStrength = 0.15`) pulls the worm toward the anchor. If distance > rope length, an additional correction clamp is applied.
5. **Release** — holding `change` keeps the rope active; releasing it deactivates it. The rope also detaches if its anchor terrain is destroyed.

### 3.8 Projectile Lifecycle

1. Created by `_fireWeapon()` — position offset 5 px in aim direction, velocity = `(speed/100) × spread direction`.
2. Each tick: apply `w.gravity`, optionally accelerate (missiles), move to new position.
3. **Laser/Gauss** — handled by `_traceLaser()`, a ray-march that checks worm collision and terrain in a single tick.
4. **Worm hit** — `_projectileHit()`: apply `hitDamage`, `bloodOnHit` particles, `blowAway` impulse. If `exploSize > 0`, also explode.
5. **Terrain hit** — if `bounce > 0`, reflect velocity; else if `groundCollide`, explode; else (dirtball) call `addDirt()`.
6. **Timer explosion** — `timeToExplo ± timeToExploV` ticks countdown.
7. **Proximity mine** — checks enemy worm distance every tick against `detectDistance`.
8. **Explosion** (`_projectileExplode`):
   - `destroyTerrain(x, y, radius)` — clears non-rock cells within radius
   - Damage worms within `radius × 2` (linear falloff)
   - Blow away worms proportional to proximity
   - Chain-affect other projectiles that have `affectByExplosions: true`
   - Spawn splinter Particles
   - Optionally spawn sub-projectiles (`spawnOnExplo`: cluster, napalm, chiquita, crackler)
   - Emit `explosion` and `sound` events

### 3.9 Blood & Particles

`_spawnBlood(x, y, amount)` creates up to 20 `Particle` objects with:
- Random radial velocity (`0.3–1.8 px/tick`)
- Color index `BLOOD.FIRST_COLOR` + 0 or 1 (palette indices 80–81, dark reds)
- Lifetime `30–70` ticks
- Gravity `BLOOD.GRAVITY` (same as worm gravity)

Particles stick when they hit terrain (`isSolid` → zero velocity). The pool is capped at `BLOOD.LIMIT` (500).

### 3.10 Game Modes

| ID | Name | Win condition |
|----|------|---------------|
| 0 | Deathmatch | First to `scoreLimit` kills |
| 1 | Team Deathmatch | Team score; friendly kills give no points |
| 2 | Last Man Standing | Limited lives; last survivor wins |
| 3 | Hold the Flag | Flag holder scores 1 point/tick; `scoreLimit` ends game |

---

## 4. Weapons System (`weapons.js`)

40 weapons are defined as plain JS objects in a `WEAPONS` array (indices 0–39).

### 4.1 Key Fields

| Field | Type | Meaning |
|-------|------|---------|
| `id` | int | Index in the array |
| `name` | string | Display name |
| `speed` | int | Launch speed (divided by 100 in engine) |
| `gravity` | float | Per-tick Y acceleration (`/65536` pre-computed) |
| `parts` | int | Projectiles per shot |
| `ammo` | int | Max ammo (reset on reload) |
| `loadingTime` | int | Reload duration in ticks |
| `delay` | int | Minimum ticks between shots |
| `recoil` | int | Impulse applied backwards on worm (`× 0.003`) |
| `hitDamage` | int | Damage on direct worm contact |
| `bloodOnHit` | int | Blood particles spawned on direct hit |
| `distribution` | float | Speed randomness (`/65536`) |
| `bounce` | int | Terrain bounce factor (0–100) |
| `timeToExplo` | int | Timer fuse ticks (0 = no timer) |
| `timeToExploV` | int | Fuse randomness variance |
| `blowAway` | int | Knockback force on hit (`× 0.03`) |
| `fireCone` | int | Angular spread of aim direction |
| `shotType` | int | Visual category (0=bullet, 1=glow, 2=blob, 3=rocket, 4=laser) |
| `color` | int | Palette index for bullet pixels |
| `splinterAmount` | int | Explosion damage / particle count |
| `exploSize` | int | Explosion radius category (0–4 → tiny/small/medium/large/huge) |
| `createOnExp` | string | `'tiny'|'small'|'medium'|'large'|'huge'` → pixel radius |
| `affectByExplosions` | bool | Can be chain-detonated |
| `laserSight` | bool | Draw red laser dot in aim direction |
| `isLaser` | bool | Handled by ray-march instead of physics |
| `wormCollide` | bool | Can hit worms |
| `groundCollide` | bool | Explodes on terrain |
| `dirtEffect` | bool | Adds dirt on terrain hit (Dirtball) |
| `leaveShells` | bool | Ejects a casing particle |
| `detectDistance` | int | Proximity trigger radius (mines) |
| `startFrame` | int | Sprite frame offset for animated projectiles |
| `numFrames` | int | Frame count for looping anim |
| `loopAnim` | bool | Loop the sprite animation |
| `colorAnim` | object | `{from, to}` palette range for animated glow (Flamer, Greenball) |
| `spawnOnExplo` | string | Sub-projectile type on explosion |
| `spawnsProjectiles` | bool | Hellraider continuous spawn |
| `accelerating` | bool | Missile gradually increases speed |
| `grasshopper` | bool | Grasshopper special bounce logic |
| `invisible` | bool | Not rendered (Booby Trap) |
| `sound` | string | Sound effect name |

### 4.2 Weapon Categories (by behaviour)

**Ballistic bullets** (shotType 0): SHOTGUN, CHAINGUN, RIFLE, WINCHESTER, MINIGUN, HANDGUN, UZI, DART, MINI ROCKETS  
**Glowing / energy** (shotType 1): FLAMER, GREENBALL  
**Throwing** (shotType 2): DIRTBALL  
**Explosive projectiles** (shotType 3): BAZOOKA, DOOMSDAY, MINE, BOUNCY MINE, FLOAT MINE, LARPA, BLASTER, BIG NUKE, CRACKLER, ZIMM, MINI NUKE, CANNON, BOUNCY LARPA, NAPALM, MISSILE, CHIQUITA BOMB, BOOBY TRAP, GRASSHOPPER, RB RAMPAGE, SPIKEBALLS, HELLRAIDER, EXPLOSIVES  
**Laser / instant trace** (shotType 4): LASER, GAUSS GUN  
**Cluster** (special): CLUSTER BOMB, CRACKLER, NAPALM, CHIQUITA BOMB spawn sub-projectiles  

---

## 5. Sprite & Rendering System (`renderer.js`)

### 5.1 Dual-Buffer Architecture

```
[ Game world (504×350 px) ]
        ↓ pixel manipulation via ImageData/Uint32Array
[ Off-screen buffer canvas (504×350 px) ]
        ↓ ctx.drawImage (viewport crop + scale)
[ Visible canvas (window size) ]
        ↓ ctx.drawImage (sprites drawn on top)
```

The game always runs at **504 × 350 logical pixels** (original Liero resolution).  
A 320 × 200 viewport follows the local player (smooth lerp, clamped to map edges).  
On screen the viewport is stretched to fill the entire browser window.

### 5.2 Per-Frame Render Order

1. **`renderMap()`** — re-renders every map cell into `ImageData` pixels each frame  
   - Background cells: dark sky gradient (`y`-based)  
   - Solid cells: palette lookup via `mapColors[]`
2. **`renderBonus()`** — red cross (health) or blue diamond (weapon), 4 px radius
3. **`renderFlag()`** — orange/yellow F marker (Hold the Flag mode)
4. **`renderProjectile()`** — per weapon type:
   - Laser: ray drawn into pixel buffer
   - `colorAnim`: animated palette-indexed glow (Flamer, Greenball, Crackler, Fan)
   - `startFrame` sprite: diamond shape in weapon-specific colours
   - Default: single palette-indexed pixel + 1-tick trail
5. **`renderWormPixels()`** — crosshair dots, laser sight line, ninja rope, health bar — all into pixel buffer
6. **`renderExplosions()`** — white/orange expanding circle flash (client-side)
7. **`bufCtx.putImageData()`** — commit pixel buffer to off-screen canvas
8. **`ctx.drawImage()`** — blit viewport crop, scaled to full screen
9. **`renderWormSprite()`** — draw PNG sprite sheet frame on top of the scaled canvas
10. **`renderHUD()`** — ammo, health, score, scoreboard, chat — drawn via Canvas 2D text/fill

### 5.3 Sprite Sheets

Sprites live in `public/sprites/` and are loaded at startup by `loadSprites()`.

| Animation key | File | Frames |
|---------------|------|--------|
| `idle` | `Pink_Monster_Idle_4.png` | 4 |
| `walk` | `Pink_Monster_Walk_6.png` | 6 |
| `run` | `Pink_Monster_Run_6.png` | 6 |
| `jump` | `Pink_Monster_Jump_8.png` | 8 |
| `attack` | `Pink_Monster_Attack1_4.png` | 4 |
| `hurt` | `Pink_Monster_Hurt_4.png` | 4 |
| `death` | `Pink_Monster_Death_8.png` | 8 |

All sheets use a **horizontal strip** layout: each frame is 32 × 32 px at position `frame * 32, 0`.  
The renderer samples `st.frame * 32, 0, 32, 32` and scales the result to ~24 screen-pixels at scale 1.

### 5.4 Worm Animation State Machine

Stored per worm-ID in `renderer.wormAnimState`:

```
hurt (hurtTimer > 0, 20-tick duration)
  └── any state
death (alive = false — plays once, freezes on last frame)
  └── any state
idle → walk (|vx| > 0.1)
         └── run (|vx| > 2)
walk/run → jump (|vy| > 0.5)
any → attack (showWeapon = true)
```

Each transition resets `frame = 0, frameTimer = 0`.  
Frame advances when `frameTimer ≥ SPEEDS[anim]`.

### 5.5 Sprite Flipping and Colour Glow

When `worm.facing === -1` the renderer uses a `ctx.scale(-1, 1)` + `ctx.translate` trick to mirror the sprite.  
Each worm gets a coloured shadow glow (`ctx.shadowColor`) using its `WORM_COLORS[color].crosshair` RGB, making players visually distinct.

---

## 6. Palette & Colours (`palette.js`)

A 256-entry `PALETTE` array of `[r, g, b]` triplets faithfully reproduces the original Liero VGA palette.

Notable ranges:
| Indices | Used for |
|---------|---------|
| 6–15 | Worm 1 greens |
| 62–64 | Ninja rope colours |
| 72–79 | Bullet / dart greys |
| 80–81 | Blood reds |
| 88–95 | Dirt/earth browns |
| 96–103 | Grenade anim / bonus pickups |
| 104–111 | Laser / energy colours |
| 129–131 | Flame animation |
| 133–136 | Greenball animation |
| 152–159 | Crackler electric animation |
| 160–167 | Rock greys |
| 168–171 | Fan animation |

`WORM_COLORS` is a separate array of 6 objects, each with `body`, `outline`, and `crosshair` RGB arrays used to tint player sprites and HUD elements.

---

## 7. Sound Engine (`sound.js`)

All sound effects are **procedurally generated** at startup via the Web Audio API — no audio files are loaded.  
Each sound is pre-rendered into a `Float32Array` AudioBuffer.

| Method | Used for |
|--------|---------|
| `_createNoise(dur, f1, f2, filterType)` | Gunshots, burner |
| `_createTone(dur, f1, f2, waveType)` | Blaster, throw, UI beeps |
| `_createExplosion(dur, baseFreq)` | exp2/3/4/5 |
| `_createDeath(dur, freq)` | death1/2/3 — pitch-sliding sine + noise |

**Spatial audio:** `play(name, x, y, listenerX, listenerY)` scales volume by `1 - dist/400`.  
Sounds further than 400 world-pixels are inaudible.

**Background music** is a MIDI file (`/music.mid`) played via the bundled `MidiPlayer.js` library.  
Notes are mapped to `OscillatorNode` objects with per-channel wave shapes. Channel 10 (drums) is silenced. The player loops when the file ends.

---

## 8. Client Application (`game.js`)

### 8.1 Screens

`LieroClient` tracks a `screen` string: `'menu' | 'lobby' | 'weapons' | 'game'`.  
Each screen shows/hides a `<div>` in the HTML.

### 8.2 Input

Keyboard events are mapped through `bindings`:
```
ArrowLeft/Right → left/right
ArrowUp/Down    → up/down
KeyD            → fire
KeyS            → jump
KeyA            → change (weapon mode / rope)
KeyC            → dig
```
An `input` object is updated each keydown/keyup and sent to the server whenever it changes (`inputChanged` flag).

Touch controls: on-screen D-pad and action buttons set the same `input` fields.

### 8.3 Render Loop

`requestAnimationFrame` drives `renderLoop()`. Each frame:
1. Call `renderer.render(state, map, mapColors, playerId)` if in game
2. Update client-side particles from `window._particles`
3. Handle screen-edge player indicators (off-camera dots)

### 8.4 Event Handling

The server sends `{ type: 'events', events: [...] }` packets containing side-effect triggers:

| Event type | Client action |
|------------|--------------|
| `explosion` | `renderer.explosions.push(...)`, screen shake, client particles |
| `sound` | `sound.play(name, x, y, lx, ly)` |
| `kill` | Kill-feed toast message |
| `damage` | Hurt flash if local player |
| `respawn` | Update local state |

---

## 9. Server (`server/index.js`)

### 9.1 Room Model

```
Room
 ├── engine: GameEngine        (one instance per room)
 ├── players: Map<id, {ws, name}>
 ├── inputs: Map<id, InputObject>
 ├── settings: {gameMode, scoreLimit, timeLimit}
 └── interval: setInterval handle
```

A default "Main Arena" Deathmatch room is created at startup.  
Additional rooms can be created via `POST /api/rooms` or the `create_room` WebSocket message.

### 9.2 Game Loop

```js
setInterval(() => {
  accumulator += (now - lastTick);
  lastTick = now;
  if (accumulator > 200) accumulator = 200;  // spiral-of-death guard

  while (accumulator >= tickInterval) {
    accumulator -= tickInterval;
    engine.update(inputs);

    if (tick % SNAPSHOT_RATE === 0)  broadcast({ type: 'state', state })
    if (events.length > 0)           broadcast({ type: 'events', events })
    if (gameOver)                    broadcast({ type: 'game_over', ... })
  }
}, tickInterval / 2);
```

`SNAPSHOT_RATE = 3` — full state broadcast every 3 ticks (~23 fps).  
Events (sounds, explosions, kills) are sent every tick they occur.

### 9.3 WebSocket Message Types

| Client → Server | Meaning |
|-----------------|---------|
| `join` | Join room with name |
| `input` | Current key state |
| `chat` | Chat message |
| `weapons` | Selected weapon loadout (5 IDs) |
| `create_room` | Create a new room |
| `list_rooms` | Refresh room list |

| Server → Client | Meaning |
|-----------------|---------|
| `room_list` | Array of room summaries |
| `init` | Full game state + map data |
| `state` | Compact periodic state snapshot |
| `events` | Sound/explosion/kill events |
| `player_joined` / `player_left` | Roster updates |
| `chat` | Chat broadcast |
| `restart` | New match, new map |
| `game_over` | Match ended |
| `room_created` | Confirmation |
| `error` | Error string |

---

## 10. Network Protocol

State snapshots serialize `GameEngine.getState()` which produces plain JSON:
```json
{
  "worms":  { "<id>": { id, name, x, y, vx, vy, aim, facing, health, alive, ... } },
  "projectiles": [ { id, weaponId, ownerId, x, y, vx, vy, age } ],
  "bonuses": [ { id, x, y, type, weaponId, flickering } ],
  "flag": { x, y, holderId } | null,
  "tick": 12345,
  "timeLeft": 17400
}
```

Map data (`map`, `mapColors`) are sent once on `init` as plain `Array` (converted from Uint8Array).  
Terrain destruction is currently **not** delta-streamed — the client uses its local copy and trusts server state for worm/projectile positions.

---

## 11. Shared Constants (`constants.js`)

Key values from the original Liero fixed-point config:

| Constant | Value | Notes |
|----------|-------|-------|
| `MAP_WIDTH` | 504 | Original Liero map size |
| `MAP_HEIGHT` | 350 | |
| `TICK_RATE` | 70 | Ticks per second |
| `WORM.GRAVITY` | 1500/65536 ≈ 0.0229 | Per-tick downward acceleration |
| `WORM.WALK_VEL` | 3000/65536 ≈ 0.0458 | Velocity added per tick while key held |
| `WORM.MAX_VEL_X` | 29184/65536 ≈ 0.445 | Max horizontal speed |
| `WORM.JUMP_FORCE` | 56064/65536 ≈ 0.856 | Upward impulse on jump |
| `WORM.FRICTION_MULT/DIV` | 89/100 | Per-tick horizontal friction |
| `WORM.RADIUS` | 3 | Collision half-size in pixels |
| `WORM.HEALTH` | 100 | Starting health |
| `ROPE.SPEED` | 3.5 | Rope projectile px/tick |
| `NET.SNAPSHOT_RATE` | 3 | Ticks between state broadcasts |
| `NET.MAX_PLAYERS_PER_ROOM` | 8 | Room capacity |
| `BLOOD.LIMIT` | 500 | Max simultaneous particles |

---

## 12. Adding Mods — Characters & Weapon Sprites

### 12.1 Replacing / Adding Character Sprites

The renderer loads sprites by a fixed key-to-filename mapping in `loadSprites()` (`renderer.js` ~line 206).  
To add a new character skin:

1. **Prepare sprite sheets** — horizontal strips, 32 × 32 px per frame, transparent PNG.  
   Required animation sheets: `idle` (4f), `walk` (6f), `run` (6f), `jump` (8f), `attack` (4f), `hurt` (4f), `death` (8f).

2. **Place PNGs** in `public/sprites/<character_name>/`.

3. **Extend `loadSprites()`** to accept a `character` parameter:
   ```js
   loadSprites(character = 'Pink_Monster') {
     const prefix = `/sprites/${character}/${character}_`;
     const ANIM_FILES = {
       idle:   `${prefix}Idle_4.png`,
       walk:   `${prefix}Walk_6.png`,
       // ...
     };
   }
   ```

4. **Assign character per worm** — add a `character` field to the `Worm` object (server-side) and pass it in state snapshots to the client.

5. Itch.io has many free and paid platformer/character sprite packs (search "character sprite sheet 32x32"). Download, slice to the frame grid above, and drop in `public/sprites/`.

### 12.2 Adding Custom Weapon Projectile Sprites

Currently, projectiles are rendered as palette-indexed pixels (no sprite sheets). To add sprites:

1. Create a sprite sheet `public/sprites/projectiles/<weapon_name>.png` — each frame 16×16 px.
2. Add a `spriteSheet` field to the weapon definition in `weapons.js`.
3. In `renderProjectile()` (`renderer.js`), check for `w.spriteSheet` before the pixel fallback, load it via `loadSprites()`, and draw it on the overlay canvas (same layer as worm sprites).

### 12.3 JSON Mod Format (WebLiero compatibility)

The original WebLiero uses a JSON + `.wlsprt` binary format:
- **JSON** — weapon physics, constants overrides
- **`.wlsprt`** — custom palette + 8×8 sprite data for projectiles and bonuses

To support loading WebLiero mods in Liero26:
1. Add a `/api/mod` endpoint that accepts multipart file upload.
2. Parse the JSON and merge weapon overrides into the running `GameEngine`'s `WEAPONS` copy.
3. Parse the `.wlsprt` binary to extract palette bytes and sprite bitmaps, transmitting them to clients as part of the `init` or a new `mod_loaded` message.
4. The client renderer reads the custom palette instead of the default one.

### 12.4 Adding New Weapons

Add an entry to the `WEAPONS` array in `weapons.js` at the end (next index after 39). No engine changes are needed — the engine reads all fields dynamically. Increase the weapon-select UI grid if needed.

### 12.5 Worm Colour Customisation

Add entries to the `WORM_COLORS` array in `palette.js`. The colour index wraps modulo the array length, so new entries are automatically assigned to players beyond index 5.
