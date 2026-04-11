# Liero26 — Ideas, Features & Expansion Plan

## Overview

This document collects ideas for improving and expanding Liero26, organised by category.  
Sources: original Liero community, [WebLiero mods by KangaRoo1372](https://github.com/KangaRoo1372/webliero), [WebLiero GitLab](https://gitlab.com/webliero), and general game-dev good practice.

---

## 1. Bug Fixes & Polish (Quick Wins)

### 1.1 Critical
- [ ] **Map delta streaming** — terrain destruction is not synced to late-joining clients or after reconnect. Send a compressed terrain diff or re-send full map on reconnect.
- [ ] **Input prediction / lag compensation** — currently the client just displays the last server snapshot; fast movement feels laggy. Add client-side prediction with server reconciliation.
- [ ] **Respawn invincibility** — newly spawned worms can be instantly killed. Add ~60-tick invincibility flash.
- [ ] **Server port mismatch** — `README.md` says port 3000 but `server/index.js` defaults to 3001. Align to one value.
- [ ] **Spectator mode** — `player.spectating` flag exists but is never acted on; implement spectator-only camera.

### 1.2 Gameplay
- [ ] **Aim wrap-around** — when you hold up or down past 90° nothing happens; original Liero wraps to ±90° with a gentle stop. Add a small bounce-back feel.
- [ ] **Shell casings stick/bounce** — shells currently use particle gravity but don't bounce off terrain. Give them a `bounce: 60` like a real casing.
- [ ] **Bonus drop on kill** — original Liero drops a weapon/health bonus ~17% of kills. The `BONUS.DROP_CHANCE` constant (1700) is defined but unused.
- [ ] **Grasshopper special** — the `grasshopper: true` flag exists on the Grasshopper weapon but no special explosive-bounce logic is implemented.
- [ ] **Hellraider spawns** — `spawnsProjectiles: true` on Hellraider is defined but the spawn logic is not coded.
- [ ] **Blood staining on terrain** — particles stick to terrain but don't permanently stain it. Paint `mapColors` at the particle position when it comes to rest.

### 1.3 Networking
- [ ] **Reconnection** — disconnecting and reconnecting loses room context; auto-rejoin the last room.
- [ ] **Heartbeat / ping display** — show latency in HUD.
- [ ] **Room password** — add an optional password field to Room creation.

---

## 2. Bloodier / More Visceral Feel

Inspired by classic Liero's reputation as one of the goriest DOS games and KangaRoo's "bloody" WebLiero mods.

- [ ] **Permanent blood stains** — when a blood particle lands on dirt, paint the `mapColors` cell a red-tinted shade. These persist for the rest of the match.
- [ ] **Gib system** — on death, scatter 6–12 large (3×3 pixel) fleshy chunks with high velocity and long lifetime. Use palette indices 80–87 and 172–179 (skin/red tones).
- [ ] **Increased base blood** — double the default `bloodOnHit` for all weapons (or add a server-side "goriness" multiplier settable per room).
- [ ] **Blood pooling** — accumulate a blood-stain counter per cell; at threshold, change the cell's colour index to a darker red permanently.
- [ ] **Wound sprites** — draw a damage overlay (red smear) on the worm sprite when health < 30 (recolor the sprite using a colour-multiply composite operation on Canvas).
- [ ] **Explosion gibs** — large explosions (radius ≥ large) scatter body-part sprites (simple 4×4 chunks) in addition to splinter particles.
- [ ] **Screen blood splat** — when local player takes heavy damage, flash a translucent red overlay on the HUD canvas.
- [ ] **Increased particle cap** — raise `BLOOD.LIMIT` from 500 to 1500 for denser visual effect.
- [ ] **Longer blood lifetime** — multiply particle `life` by 1.5× globally for a bloodier, longer-lasting mess.

---

## 3. New Characters & Sprites

### 3.1 Character System
- [ ] **Multi-character support** — extend `Worm` with a `character` string field. The client passes it when joining. The renderer loads the matching sprite folder from `public/sprites/<character>/`.
- [ ] **Character select screen** — add a character picker after weapon select (grid of thumbnails). Save choice in localStorage.
- [ ] **Per-character stats** (optional mod) — define `speed`, `health`, `jumpForce` multipliers per character as a JSON file in `public/sprites/<character>/stats.json`.

### 3.2 Importing from Itch.io
Good free/CC0 character sprite sheets to import:
- **"Tiny RPG Character Assets"** (Pixel Frog) — 16×16 knight, mage, archer. Scale up 2× to 32×32.
- **"Free Pixel Art Character"** (DezraDesigns) — multiple animations, 48×48 (needs downscale crop).
- **"KayKit — Dungeon Pack"** — has animated humanoids.
- **"Pixel Adventure"** (Pixel Frog) — great idle/run/jump/hurt/death sheets.

Import steps:
1. Download PNG from itch.io.
2. Use [Aseprite](https://www.aseprite.org/) or [Libresprite](https://libresprite.github.io/) to crop each animation into a horizontal 32×32-per-frame strip.
3. Export as: `<Name>_Idle_4.png`, `<Name>_Walk_6.png`, etc. (use frame interpolation if source has different counts).
4. Drop into `public/sprites/<Name>/`.

### 3.3 Weapon Sprites
- [ ] Add `public/sprites/weapons/` directory with projectile frames (16×16 sheets).
- [ ] Render-side: when `w.spriteSheet` is set, draw the animated sprite on the overlay canvas instead of palette pixels.
- [ ] Priority: Bazooka rocket, Grenade (tumbling), Mine (blinking LED), Napalm canister.
- Good itch.io source: **"Pixel Weapon Pack"** (Kenney.nl — CC0).

---

## 4. Mod System

### 4.1 WebLiero Mod Compatibility (`.json` + `.wlsprt`)
Following how KangaRoo's mods work (see [webliero repo](https://github.com/KangaRoo1372/webliero)):
- [ ] **Upload UI** — add a "Load Mod" button in the lobby. Accept a `.json` + `.wlsprt` pair (or zip).
- [ ] **JSON parser** — override `WEAPONS`, `CONSTANTS`, and background/palette settings from the mod JSON.
- [ ] **`.wlsprt` parser** — binary format: 768-byte palette (256 × RGB) + sprite bitmaps. Decode in JS using `DataView`.
- [ ] **Mod broadcast** — when a room creator loads a mod, broadcast `{ type: 'mod', modData: {...} }` to all players so they get the same assets.
- [ ] **Mod validation** — sanitise all numeric fields (clamp to safe ranges) before applying.

### 4.2 Custom Map Loading
- [ ] Accept `.lev` format (original Liero level binary) or a simple PNG-based format.
- [ ] PNG map encoding: one channel = material type (0/1/4 mapped to pixel brightness ranges).
- [ ] Add map select screen in lobby alongside room settings.

### 4.3 In-Game Mod Console (WebLiero-style `/loadmod`)
- [ ] Add chat commands: `/loadmod`, `/reloadmap`, `/setmode <mode>`, `/kick <player>`, `/bloodlevel <0-3>`.
- [ ] Only the room creator can execute server-side commands.

---

## 5. New Weapons Ideas

| Weapon | Behaviour |
|--------|-----------|
| **Flamethrower Mk2** | Longer range, leaves burning ground tiles that deal tick damage |
| **Portal Gun** | Two projectiles; entering one portal exits the other (teleport) |
| **Gravity Bomb** | Creates a gravity well that pulls worms and projectiles |
| **Freeze Ray** | Slows enemy movement/aim for 2 seconds |
| **Drill Rocket** | Tunnels through dirt without exploding until it exits |
| **Chain Lightning** | Arcs between nearest worms up to 3 hops |
| **Boomerang** | Returns to the thrower; damages on both trips |
| **Teleport Mine** | On proximity trigger, teleports victim to random map location |
| **Riot Shield** (active) | Blocks incoming projectiles for 1 second while held |
| **Black Hole** | Fires a mini black hole that grows, eats terrain, then collapses |

All new weapons follow the same `WEAPONS` object schema — no engine changes required for basic projectile behaviour.

---

## 6. New Game Modes

| Mode | Description |
|------|-------------|
| **Capture the Flag** | Two flags, two bases. Proper CTF with carrier tracking |
| **King of the Hill** | A moving zone scores points per second for the worm inside it |
| **Survival / Waves** | AI-controlled enemy worms spawn in increasing waves |
| **Race** | Checkpoints placed on map; first to visit all wins |
| **Weapons Only** | Random weapon spawned every 5 seconds, no default loadout |
| **One-Shot** | All weapons fire once per life; headshot / precision focus |

---

## 7. Map & Terrain Improvements

- [ ] **Pre-designed maps** — load from JSON/PNG files instead of only procedural generation. Include a set of classic Liero-style layouts (tunnels, arenas, open fields).
- [ ] **Map regen between rounds** — already has a `MAP_REGEN` constant (false by default); implement the toggle.
- [ ] **Background layers** — parallax sky/cave texture behind the transparent background cells.
- [ ] **Water/lava zones** — define rectangle regions with altered gravity or damage ticks.
- [ ] **Destructible rock** — add a third terrain type that requires a large explosion to break.
- [ ] **Spawnable terrain** — the dirtball effect works; add an "Ice Ball" that spawns slippery platform tiles.
- [ ] **Map editor** — browser-based paint tool to draw maps and export as JSON.

---

## 8. PhaserJS — Should We Use It?

### What Phaser offers
- Scene management, asset loader, physics (Arcade, Matter.js), tilemap support, particle systems, cameras with zoom/shake, input, WebGL renderer.

### Analysis for Liero26

**Reasons to use Phaser:**
- Built-in tilemap system would simplify map rendering and collision (replace custom Uint8Array + manual pixel ops).
- Particle system would handle blood/splinter effects with better performance.
- Camera system with proper screen shake, zoom, split-screen support.
- Asset pipeline (texture atlases, spine animations) for character sprites.
- Active community, good documentation.

**Reasons NOT to use Phaser:**
- The current pixel-exact renderer is a core feature (504×350 logical pixels, palette-indexed). Phaser's WebGL renderer would break this unless using a RenderTexture with point-sampling.
- Replacing the physics engine would require rewriting `engine.js` — breaking server/client shared determinism.
- The server would still run the plain JS engine; Phaser is browser-only, so the shared-code architecture would need rethinking.
- Adds ~1 MB bundle weight (currently zero build step, zero dependencies on the client).
- The tight coupling between projectile physics and terrain (pixel-level collision) is hard to replicate with standard Phaser physics bodies.

**Recommended compromise:**
- Keep the current shared physics engine untouched.
- Use Phaser **only for rendering** on the client: create a Phaser `Scene`, render the `Uint8Array` map into a `Phaser.GameObjects.Graphics` or a `RenderTexture` each frame, and draw sprites via Phaser's sprite system with animations.
- This retains pixel-perfect rendering and the deterministic physics while gaining Phaser's camera, particle, and animation tooling.
- The migration can be done incrementally — swap `renderer.js` for a `PhaseRenderer.js` that implements the same interface.

**Verdict:** Phaser integration is worthwhile for the rendering layer if the team wants richer visual effects and camera work. The physics and network layers should remain as-is.

---

## 9. Multiplayer & Social Features

- [ ] **Spectator mode** (fix existing stub) — spectators follow any player with camera, no input sent.
- [ ] **Player profiles** — store name + stats in localStorage; show lifetime K/D in lobby.
- [ ] **Replay system** — record all `input` events server-side; allow replay download and playback.
- [ ] **Kill feed improvements** — show weapon icon next to kill notification.
- [ ] **Emotes / taunts** — bind a key to spawn a speech bubble with a random phrase.
- [ ] **Team colour selection** — in Team Deathmatch, let players pick red or blue team.
- [ ] **Private rooms** — password-protected rooms.
- [ ] **Bot players** — server-side AI worms that pathfind with A\* on the terrain and pick random targets.

---

## 10. Audio Improvements

- [ ] **Real sampled sounds** — optionally load `.ogg` / `.mp3` sound packs to replace procedural sounds.
- [ ] **Stereo panning** — position sounds left/right based on x offset from player, not just distance falloff.
- [ ] **Reverb** — add `ConvolverNode` for cave-like reverb (toggleable; performance cost).
- [ ] **Weapon-specific music triggers** — brief music stings on kills / round end.
- [ ] **Sound mods** — allow uploading a sound pack (zip of `.ogg` files) mapped by name to the existing sound IDs.
- [ ] **Volume controls** — separate sliders for music, SFX, and voice (if added) in the settings menu.

---

## 11. UI / UX

- [ ] **Settings screen** — key rebinding, volume sliders, toggle touch controls, toggle gore level.
- [ ] **Minimap** — small map overview (top-right corner) showing worm positions with colour dots.
- [ ] **Damage numbers** — floating damage text rising from hit position (toggleable).
- [ ] **Weapon icons** — 16×16 pixel-art icons for each weapon in the HUD slots instead of text.
- [ ] **Round-start countdown** — 3-2-1 overlay before players can move.
- [ ] **Kill streak announcements** — "DOUBLE KILL", "RAMPAGE" etc. at 2/3/5 consecutive kills.
- [ ] **Post-round stats screen** — show accuracy, damage dealt, favourite weapon per player.
- [ ] **Mobile improvements** — larger touch buttons, gyroscope aim assist option.
- [ ] **Colorblind mode** — alternative worm colour palette with high-contrast shapes.

---

## 12. Performance & Technical Debt

- [ ] **Terrain delta sync** — send only changed terrain cells rather than full map on map changes.
- [ ] **Binary WebSocket protocol** — replace JSON with a compact binary format (e.g. `msgpack` or hand-rolled `DataView`) to halve state packet size.
- [ ] **Web Worker for physics** — run the client-side engine in a Web Worker to avoid main-thread frame drops.
- [ ] **OffscreenCanvas** — move the pixel buffer rendering to a Worker with OffscreenCanvas for zero-jank rendering.
- [ ] **Persistent rooms** — rooms currently restart engines on all players leaving; persist room state with a grace period.
- [ ] **Docker health check** — `Dockerfile` exists but has no `HEALTHCHECK` directive.
- [ ] **TypeScript migration** — add JSDoc types or migrate to TS for better IDE support and safety (especially the network protocol types).
- [ ] **E2E tests** — add Playwright tests that launch the server and simulate two WebSocket clients fighting.

---

## 13. Inspiration from KangaRoo's WebLiero Mods

From [github.com/KangaRoo1372/webliero](https://github.com/KangaRoo1372/webliero) the mod system allows:

1. **Custom palettes** — replacing the full 256-colour VGA palette changes the entire visual feel of the game (e.g. neon theme, night vision green, sepia).
2. **Weapon physics overrides** — dramatically altered gravity, speed, and damage values create entirely different gameplay (e.g. super-bouncy weapons, zero-gravity maps).
3. **Custom projectile sprites** — via the `.wlsprt` format, every weapon gets its own 8×8 sprite.
4. **Map-specific mods** — some mods are designed for specific community maps from the [webliero-maps repository](https://gitlab.com/webliero/webliero-maps).

**Directly applicable ideas:**
- Implement the palette override: a `mod.palette` field replaces `PALETTE` at runtime.
- Add a `bloodColour` field to weapon definitions: the blood spawned by a weapon uses a custom palette range (e.g. green alien blood, neon pink).
- Allow per-room weapon set restrictions (whitelist or blacklist specific weapons).
- Support community map sharing: a `/api/maps` endpoint serves a catalogue of pre-designed maps.

---

## 14. Prioritised Roadmap

### Phase 1 — Stability & Completeness (fix before adding)
1. Server port fix (README / server.js)
2. Map delta sync on reconnect
3. Respawn invincibility
4. Blood staining on terrain
5. Hellraider + Grasshopper weapon logic
6. Bonus drop on kill

### Phase 2 — Bloodier & More Fun
1. Permanent blood stains on terrain
2. Gib system on death
3. Screen blood splat overlay
4. Increased particle cap + lifetime

### Phase 3 — Mods & Content
1. WebLiero JSON mod loader
2. Character select + sprite packs from itch.io
3. Weapon projectile sprites
4. Custom map loading (PNG format)

### Phase 4 — New Features
1. Bot players (AI)
2. More game modes (KotH, CTF)
3. Replay system
4. Phaser rendering layer (optional)

### Phase 5 — Polish
1. Binary WebSocket protocol
2. Web Worker physics
3. E2E test suite
4. Settings screen with key rebinding
