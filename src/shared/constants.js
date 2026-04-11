// Liero26 - Shared Game Constants
// Based on original Liero v1.33 physics constants from TC/openliero/tc.cfg

;(function() {
var CONSTANTS = {
  // Fixed-point scale factor (original Liero uses 16-bit fixed point)
  FP_SCALE: 65536,
  FP_SHIFT: 16,

  // Map dimensions (classic Liero)
  MAP_WIDTH: 504,
  MAP_HEIGHT: 350,

  // Game tick rate
  TICK_RATE: 70, // Original Liero runs at ~70 FPS logic
  TICK_MS: 1000 / 70,

  // Worm physics (converted from fixed-point)
  WORM: {
    GRAVITY: 1500 / 65536,
    WALK_VEL: 3000 / 65536,
    MAX_VEL_X: 29184 / 65536,
    JUMP_FORCE: 56064 / 65536,
    FRICTION_MULT: 89,
    FRICTION_DIV: 100,
    RADIUS: 3,
    HEALTH: 100,
    SPAWN_RECT: { x: 5, y: 5, w: 494, h: 340 },
    MIN_SPAWN_DIST: 160,
    AIM_SPEED: 0.28,
    AIM_MAX_VEL: 4.5,
    AIM_FRICTION_MULT: 83,
    AIM_FRICTION_DIV: 100,
    AIM_MIN: -90,
    AIM_MAX: 90,
    DIG_SPEED: 1,
    COLORS_P1: [6, 14, 22, 30],  // worm colors player 1
    COLORS_P2: [80, 82, 84, 86], // worm colors player 2
  },

  // Ninja rope physics
  ROPE: {
    INITIAL_LENGTH: 4000 / 65536,
    ATTACH_LENGTH: 450 / 65536,
    MIN_LENGTH: 170 / 65536,
    MAX_LENGTH: 4000 / 65536,
    GRAVITY: 1000 / 65536,
    THROW_VEL_X: 2,
    THROW_VEL_Y: 2,
    PULL_VEL: 24 / 65536,
    RELEASE_VEL: 24 / 65536,
    FORCE_SHL_X: 2,
    FORCE_DIV_X: 3,
    FORCE_SHL_Y: 2,
    FORCE_DIV_Y: 3,
    FORCE_LEN_SHL: 4,
    COLOR_BEGIN: 62,
    COLOR_END: 64,
    SPEED: 3.5,
  },

  // Bonus (health/weapon pickups)
  BONUS: {
    GRAVITY: 1500 / 65536,
    BOUNCE_MULT: 40,
    BOUNCE_DIV: 100,
    FLICKER_TIME: 220,
    EXPLODE_RISK: 10,
    HEALTH_VAR: 51,
    MIN_HEALTH: 10,
    DROP_CHANCE: 1700,
    SPAWN_INTERVAL: 400, // ticks between spawn attempts
  },

  // Blood/particles
  BLOOD: {
    FIRST_COLOR: 80,
    NUM_COLORS: 2,
    STEP_UP: 25,
    STEP_DOWN: 25,
    LIMIT: 500,
    GRAVITY: 1000 / 65536,
  },

  // Material types (for terrain)
  MATERIAL: {
    BACKGROUND: 0,
    DIRT: 1,
    DIRT_ROCK: 2,
    ROCK: 4,
    DIRT2: 8,
    ROCK2: 9,
    SPECIAL: 10,
    WORM_ONLY: 24,
    ROCK3: 32,
  },

  // Scoring
  SCORE: {
    KILL: 1,
    SUICIDE: -1,
  },

  // Network
  NET: {
    SNAPSHOT_RATE: 3, // send state every N ticks
    INPUT_BUFFER_SIZE: 10,
    MAX_PLAYERS_PER_ROOM: 8,
    ROOM_NAME_MAX: 24,
  },

  // Game modes
  MODE: {
    DEATHMATCH: 0,
    TEAM_DEATHMATCH: 1,
    LAST_MAN_STANDING: 2,
    HOLD_THE_FLAG: 3,
  },

  MODE_NAMES: ['Deathmatch', 'Team Deathmatch', 'Last Man Standing', 'Hold the Flag'],

  // Default game settings
  DEFAULTS: {
    SCORE_LIMIT: 15,
    TIME_LIMIT: 600, // seconds
    LOADING_TIME: 100,
    BONUS_HEALTH: true,
    BONUS_WEAPONS: true,
    MAP_REGEN: false,
  },
};

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONSTANTS;
} else if (typeof window !== 'undefined') {
  window.CONSTANTS = CONSTANTS;
}

})();
