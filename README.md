# Liero26 🐛⚔️

A fully playable browser-based clone of the classic MS-DOS game **Liero** (1998) with real-time multiplayer support, pixel-perfect graphics, and all 40 original weapons.

## Features

- **Full Game Engine** - Complete physics simulation based on original Liero v1.33 constants
- **40 Weapons** - All original weapons faithfully recreated (Shotgun, Bazooka, Grenade, Laser, Zimm, and more)
- **Real-Time Multiplayer** - WebSocket-based networking with room system
- **4 Game Modes** - Deathmatch, Team Deathmatch, Last Man Standing, Hold the Flag
- **Pixel Art Graphics** - Native 504x350 resolution, scaled up with crisp pixel rendering
- **Destructible Terrain** - Procedurally generated maps with fully destructible dirt and indestructible rock
- **Ninja Rope** - The iconic grappling hook with full physics simulation
- **Procedural Sound** - All sound effects generated via Web Audio API
- **Weapon Selection** - Choose your 5-weapon loadout before each match
- **Chat System** - In-game text chat
- **Scoreboard** - Live scoring and kill feed
- **Screen Shake** - Satisfying explosion effects
- **Player Indicators** - Edge-of-screen dots showing other player positions

## Quick Start

```bash
npm install
npm start
```

Open **http://localhost:3000** in your browser.

## Controls

| Key | Action |
|-----|--------|
| ← → | Move left/right |
| ↑ ↓ | Aim up/down |
| D | Shoot |
| S | Jump |
| A | Show weapon / Change mode |
| A + ← → | Switch weapon |
| A + S | Fire ninja rope |
| A + ↑ ↓ | Adjust rope length |
| C | Dig |
| Tab | Scoreboard |
| Enter | Chat |

## Game Modes

- **Deathmatch** - Free-for-all, first to score limit wins
- **Team Deathmatch** - Two teams, deaths count for opposing team
- **Last Man Standing** - Limited lives, last player alive wins
- **Hold the Flag** - Hold the flag to score points over time

## Architecture

```
src/
├── shared/           # Shared between server & client
│   ├── constants.js  # Game physics constants (from original Liero)
│   ├── weapons.js    # All 40 weapon definitions
│   ├── palette.js    # VGA color palette
│   └── engine.js     # Deterministic game simulation
├── server/
│   └── index.js      # Express + WebSocket game server
├── client/
│   ├── renderer.js   # Canvas pixel renderer
│   ├── sound.js      # Procedural audio engine
│   └── game.js       # Client networking & input handling
public/
├── index.html        # Game HTML
└── style.css         # UI styles
```

## Based On

- **Liero v1.33** by Metsänelaimet (1998-1999) — [Source](https://github.com/gliptic/liero)
- **WebLiero** — [FAQ](https://github.com/pilaf/webliero-faq)

## License

ISC
