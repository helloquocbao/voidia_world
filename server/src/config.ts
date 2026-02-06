// Server configuration
export const CONFIG = {
  // Server
  PORT: parseInt(process.env.PORT || "3001"),

  // Game tick
  TICK_RATE: 20, // Hz (20 ticks per second = 50ms per tick)

  // Room settings
  MAX_PLAYERS_PER_ROOM: 100,
  MIN_PLAYERS_TO_START: 1, // For testing, set to 1. Production: 5-10

  // Map settings
  MAP_WIDTH: 2000,
  MAP_HEIGHT: 2000,
  GRID_CELL_SIZE: 200, // AOI grid cell size

  // Player settings
  PLAYER_SPEED: 200, // pixels per second
  PLAYER_MAX_HP: 100,
  PLAYER_ATTACK_DAMAGE: 10,
  PLAYER_ATTACK_COOLDOWN: 500, // ms
  PLAYER_ATTACK_RANGE: 80,

  // Boss settings
  BOSS_MAX_HP: 10000,
  BOSS_SPEED: 100,
  BOSS_POSITION: { x: 1000, y: 1000 }, // Center of map
  BOSS_ENRAGE_TIME: 300000, // 5 minutes

  // Boss skills
  BOSS_SKILL_1: {
    id: "ground_slam",
    damage: 30,
    radius: 150,
    castTime: 1500, // ms
    cooldown: 5000, // ms
  },
  BOSS_SKILL_2: {
    id: "fire_circle",
    damage: 20,
    innerRadius: 100,
    outerRadius: 300,
    castTime: 2000, // ms
    cooldown: 8000, // ms
    duration: 3000, // ms - AOE stays on ground
  },

  // Network
  SNAPSHOT_RATE: 10, // Hz (10 snapshots per second)
  INPUT_BUFFER_SIZE: 32,
};
