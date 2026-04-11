// Liero26 - Tests
const CONSTANTS = require('../src/shared/constants');
const WEAPONS = require('../src/shared/weapons');
const { GameEngine, Worm, Projectile } = require('../src/shared/engine');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

// Test Constants
console.log('Testing Constants...');
assert(CONSTANTS.MAP_WIDTH === 504, 'Map width is 504');
assert(CONSTANTS.MAP_HEIGHT === 350, 'Map height is 350');
assert(CONSTANTS.TICK_RATE === 70, 'Tick rate is 70');
assert(CONSTANTS.WORM.HEALTH === 100, 'Worm health is 100');
assert(CONSTANTS.MODE.DEATHMATCH === 0, 'Deathmatch mode is 0');
assert(CONSTANTS.MODE_NAMES.length === 4, 'Four game modes');

// Test Weapons
console.log('\nTesting Weapons...');
assert(WEAPONS.length === 50, 'All 50 weapons loaded');
assert(WEAPONS[0].name === 'SHOTGUN', 'First weapon is Shotgun');
assert(WEAPONS[3].name === 'BAZOOKA', 'Bazooka at index 3');
assert(WEAPONS[28].name === 'LASER', 'Laser at index 28');
assert(WEAPONS[39].name === 'GAUSS GUN', 'Gauss Gun at index 39');
assert(WEAPONS[40].name === 'FLAMETHROWER MK2', 'Flamethrower Mk2 at index 40');
assert(WEAPONS[49].name === 'BLACK HOLE', 'Black Hole at index 49');
assert(WEAPONS[0].parts === 15, 'Shotgun fires 15 pellets');
assert(WEAPONS[9].name === 'FLAMER', 'Flamer at index 9');
assert(WEAPONS[10].name === 'GRENADE', 'Grenade at index 10');

// Test unique weapon names
const names = new Set(WEAPONS.map(w => w.name));
assert(names.size === 50, 'All weapon names are unique');

// Test GameEngine
console.log('\nTesting Game Engine...');
const engine = new GameEngine();
assert(engine.worms.size === 0, 'Engine starts with no worms');
assert(engine.tick === 0, 'Engine starts at tick 0');
assert(!engine.gameOver, 'Game not over at start');

// Test map generation
engine.generateMap();
assert(engine.map !== null, 'Map generated');
assert(engine.map.length === CONSTANTS.MAP_WIDTH * CONSTANTS.MAP_HEIGHT, 'Map has correct size');
assert(engine.mapColors.length === engine.map.length, 'Map colors match map size');

// Borders should be rock
assert(engine.map[0] === CONSTANTS.MATERIAL.ROCK, 'Top-left is rock');
assert(engine.map[CONSTANTS.MAP_WIDTH - 1] === CONSTANTS.MATERIAL.ROCK, 'Top-right is rock');

// Test worm spawning
const worm1 = engine.addWorm(1, 'TestPlayer1');
assert(worm1 !== null, 'Worm 1 created');
assert(worm1.name === 'TestPlayer1', 'Worm 1 has correct name');
assert(worm1.health === 100, 'Worm 1 has full health');
assert(worm1.alive, 'Worm 1 is alive');
assert(worm1.weapons.length === 5, 'Worm 1 has 5 weapon slots');
assert(engine.worms.size === 1, 'Engine has 1 worm');

const worm2 = engine.addWorm(2, 'TestPlayer2');
assert(engine.worms.size === 2, 'Engine has 2 worms');

// Test spawn point validity
assert(worm1.x >= 0 && worm1.x < CONSTANTS.MAP_WIDTH, 'Worm 1 x in bounds');
assert(worm1.y >= 0 && worm1.y < CONSTANTS.MAP_HEIGHT, 'Worm 1 y in bounds');

// Test isSolid
assert(engine.isSolid(-1, 0) === true, 'Out of bounds is solid');
assert(engine.isSolid(0, -1) === true, 'Out of bounds above is solid');

// Test terrain destruction
const testX = Math.floor(CONSTANTS.MAP_WIDTH / 2);
const testY = Math.floor(CONSTANTS.MAP_HEIGHT / 2);
// Place some dirt
engine.map[testY * CONSTANTS.MAP_WIDTH + testX] = CONSTANTS.MATERIAL.DIRT;
engine.mapColors[testY * CONSTANTS.MAP_WIDTH + testX] = 85;
assert(engine.isSolid(testX, testY) === true, 'Dirt is solid');
engine.destroyTerrain(testX, testY, 3);
assert(engine.isSolid(testX, testY) === false, 'Terrain destroyed');

// Test game tick
const inputs = new Map();
inputs.set(1, { left: false, right: true, up: false, down: false, fire: false, jump: false, change: false, dig: false });
inputs.set(2, { left: false, right: false, up: false, down: false, fire: false, jump: false, change: false, dig: false });

engine.update(inputs);
assert(engine.tick === 1, 'Tick incremented to 1');
assert(engine.timeLeft < engine.timeLimit * CONSTANTS.TICK_RATE, 'Time decremented');

// Test multiple ticks
for (let i = 0; i < 10; i++) {
  engine.update(inputs);
}
assert(engine.tick === 11, 'Tick incremented to 11 after 10 more updates');

// Test state serialization
const state = engine.getState();
assert(state.tick === 11, 'State tick matches');
assert(Object.keys(state.worms).length === 2, 'State has 2 worms');
assert(state.projectiles.length === 0, 'No projectiles yet');
assert(state.gameMode === CONSTANTS.MODE.DEATHMATCH, 'Default deathmatch mode');

// Test game modes
const engineTDM = new GameEngine();
engineTDM.gameMode = CONSTANTS.MODE.TEAM_DEATHMATCH;
engineTDM.generateMap();
const w1 = engineTDM.addWorm(1, 'Team1');
w1.team = 0;
const w2 = engineTDM.addWorm(2, 'Team2');
w2.team = 1;
assert(w1.team === 0, 'Player 1 team 0');
assert(w2.team === 1, 'Player 2 team 1');

// Test worm removal
engine.removeWorm(2);
assert(engine.worms.size === 1, 'Worm removed, 1 left');

// Test bonus spawning
assert(engine.bonuses.length === 0, 'No bonuses at start');

// Test game settings
assert(engine.scoreLimit === CONSTANTS.DEFAULTS.SCORE_LIMIT, 'Default score limit');

// Test Worm class
console.log('\nTesting Worm class...');
const testWorm = new Worm(99, 'TestWorm', 100, 100);
assert(testWorm.id === 99, 'Worm id correct');
assert(testWorm.ammo.length === 5, 'Worm has 5 ammo slots');
assert(testWorm.loadingLeft.length === 5, 'Worm has 5 loading slots');
assert(testWorm.rope.active === false, 'Rope starts inactive');

// Test aim bounds
testWorm.aim = 100;
testWorm.aim = Math.max(CONSTANTS.WORM.AIM_MIN, Math.min(CONSTANTS.WORM.AIM_MAX, testWorm.aim));
assert(testWorm.aim === 90, 'Aim clamped to max');

testWorm.aim = -100;
testWorm.aim = Math.max(CONSTANTS.WORM.AIM_MIN, Math.min(CONSTANTS.WORM.AIM_MAX, testWorm.aim));
assert(testWorm.aim === -90, 'Aim clamped to min');

// Results
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(40)}`);

if (failed > 0) {
  process.exit(1);
}
