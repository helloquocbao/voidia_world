/// <reference types="kaboom/global" />
import kaboom, { GameObj } from "kaboom";
import {
  TILE_DEFS,
  DECO_DEFS,
  TILE_SPRITE_SIZE,
  getTileDef,
  getDecoDef,
  isTileDefined,
  isWalkableTile,
  isDecoBlocking,
} from "./tiles";
import {
  initEnemyMaintainer,
  stopEnemyMaintainer,
  EnemyConfig,
  DifficultyInfo,
} from "./enemyMaintainer";
import { soundManager } from "./soundManager";

let started = false;
let kaboomInstance: ReturnType<typeof kaboom> | null = null;
const TILE = 32;
const CHUNK_SIZE = 5;
const PLAY_STATE_KEY = "PLAY_STATE";
const PLAY_TARGET_KEY = "PLAY_TARGET";
const PLAY_CHESTS_KEY = "PLAY_CHESTS";

type GameMapData = {
  tileSize: number;
  grid: number[][];
  decoGrid?: number[][];
  worldId?: string;
  characterHealth?: number;
  difficulty?: number; // 1-9 from WorldMap
  chunkCount?: number; // Number of chunks
};

// Reset game state - call this when unmounting GamePage component
export function resetGame() {
  if (kaboomInstance) {
    try {
      // Clean up kaboom instance
      kaboomInstance.quit();
    } catch (e) {
      console.warn("Error cleaning up kaboom:", e);
    }
    kaboomInstance = null;
  }
  started = false;
  stopEnemyMaintainer();
}

export function startGame(mapData?: GameMapData) {
  // If canvas doesn't exist, don't start (component not mounted)
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  if (!canvas) {
    console.warn("Canvas element not found, skipping game start");
    return;
  }

  if (started && kaboomInstance) {
    if (mapData) {
      console.log("Restarting game with new map data", mapData);
      go("game", { mapData });
    }
    return;
  }
  
  // Reset if started but no kaboom instance (stale state)
  if (started && !kaboomInstance) {
    started = false;
  }
  
  started = true;

  // Get actual viewport size for fullscreen
  const initialWidth = window.innerWidth;
  const initialHeight = window.innerHeight;

  const k = kaboom({
    global: true,
    canvas,
    width: initialWidth,
    height: initialHeight,
    background: [26, 42, 58],
    scale: 1,
    crisp: true,
  });
  
  // Store instance for cleanup
  kaboomInstance = k;

  // Handle window resize to keep game fullscreen
  window.addEventListener("resize", () => {
    // Kaboom doesn't have a native resize, but we can update canvas
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });

  // debug.inspect = true;

  /* ================= SPRITES ================= */

  loadSprite("player-idle", "/sprites/player/Idle.png", {
    sliceX: 8,
    anims: {
      idle: { from: 0, to: 7, speed: 15, loop: true },
    },
  });

  loadSprite("player-run", "/sprites/player/Run.png", {
    sliceX: 6,
    anims: {
      run: { from: 0, to: 5, speed: 10, loop: true },
    },
  });

  loadSprite("player-attack", "/sprites/player/Attack.png", {
    sliceX: 4,
    anims: {
      attack: { from: 0, to: 3, speed: 12 },
    },
  });

  // Goblin sprite sheet: 5 rows, row 1 has 7 columns, rows 2-5 have 6 columns
  // Using sliceX=7 to accommodate max columns
  // Row 0: Idle (7 frames), Row 1: Run (6 frames), Row 2: Attack Right (6 frames),
  // Row 3: Attack Down (6 frames), Row 4: Attack Up (6 frames)
  loadSprite("goblin", "/sprites/goblin/Goblin.png", {
    sliceX: 7,
    sliceY: 5,
    anims: {
      idle: { from: 0, to: 6, speed: 8, loop: true }, // Row 0: frames 0-6 (7 frames)
      run: { from: 7, to: 12, speed: 10, loop: true }, // Row 1: frames 7-12 (6 frames, skip 13)
      "attack-right": { from: 14, to: 19, speed: 12 }, // Row 2: frames 14-19 (6 frames, skip 20)
      "attack-down": { from: 21, to: 26, speed: 12 }, // Row 3: frames 21-26 (6 frames, skip 27)
      "attack-up": { from: 28, to: 33, speed: 12 }, // Row 4: frames 28-33 (6 frames, skip 34)
    },
  });

  // Yod sprite sheet: 3 rows, 7 columns
  // Row 0: Idle (6 frames), Row 1: Run (6 frames), Row 2: Attack (7 frames)
  loadSprite("yod", "/sprites/goblin/Yod.png", {
    sliceX: 7,
    sliceY: 3,
    anims: {
      idle: { from: 0, to: 5, speed: 8, loop: true },
      run: { from: 7, to: 12, speed: 10, loop: true },
      attack: { from: 14, to: 20, speed: 12 },
    },
  });
  TILE_DEFS.forEach((tile) => {
    loadSprite(tile.name, tile.image);
  });

  DECO_DEFS.forEach((deco) => {
    loadSprite(deco.name, deco.image);
  });
  
  loadSprite("chest", "/sprites/rewards/chest_1.png");
  
  // Key animation: 24 frames in horizontal row
  loadSprite("key", "/rewards/key_animation.png", {
    sliceX: 24,
    anims: {
      spin: { from: 0, to: 23, speed: 12, loop: true },
    },
  });

  /* ================= MAP ================= */

  function loadMap(): GameMapData | null {
    const raw = localStorage.getItem("CUSTOM_MAP");
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function findSpawn(grid: number[][], size: number) {
    // Collect all walkable tiles
    const walkableTiles: { x: number; y: number }[] = [];
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (isWalkableTile(grid[y][x])) {
          walkableTiles.push({ x, y });
        }
      }
    }

    // Pick random walkable tile
    if (walkableTiles.length > 0) {
      const spawn =
        walkableTiles[Math.floor(Math.random() * walkableTiles.length)];
      return vec2(spawn.x * size + size / 2, spawn.y * size + size / 2);
    }

    return vec2(64, 64);
  }

  function drawTiles(
    grid: number[][],
    decoGrid: number[][] | undefined,
    tileSize: number,
  ) {
    const scaleFactor = tileSize / TILE_SPRITE_SIZE;

    // Layer 1: Base tiles
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        const tileId = grid[y][x];
        const tileDef = getTileDef(tileId);
        if (!tileDef) continue;
        add([
          sprite(tileDef.name),
          pos(x * tileSize, y * tileSize),
          anchor("topleft"),
          scale(scaleFactor),
          tileDef.kind === "abyss" ? "abyss" : "ground",
        ]);
      }
    }

    // Layer 2: Decorations
    if (decoGrid) {
      for (let y = 0; y < decoGrid.length; y++) {
        for (let x = 0; x < (decoGrid[y]?.length ?? 0); x++) {
          const decoId = decoGrid[y]?.[x] ?? 0;
          if (decoId === 0) continue;
          const decoDef = getDecoDef(decoId);
          if (!decoDef) continue;
          const decoObj = add([
            sprite(decoDef.name),
            pos(x * tileSize, y * tileSize),
            anchor("topleft"),
            scale(scaleFactor),
            "decoration",
          ]);
          // Add collision area for blocking decorations
          if (decoDef.kind === "blocking") {
            decoObj.use(area({ shape: new Rect(vec2(0), tileSize, tileSize) }));
            decoObj.use(body({ isStatic: true }));
          }
        }
      }
    }
  }

  /* ================= SCENE ================= */

  scene("game", (data?: { mapData?: GameMapData }) => {
    const resolvedMap = data?.mapData ?? loadMap();
    if (!resolvedMap?.grid) {
      add([text("NO MAP FOUND"), pos(center()), anchor("center")]);
      return;
    }

    let isGameOver = false;
    const tileSize = resolvedMap.tileSize || TILE;
    const spawnPos = findSpawn(resolvedMap.grid, tileSize);
    drawTiles(resolvedMap.grid, resolvedMap.decoGrid, tileSize);

    /* ================= GOBLIN SYSTEM ================= */

    // Difficulty-based stats (matching enemyMaintainer.ts)
    const DIFFICULTY_STATS: Record<
      number,
      { hp: number; damage: number; speed: number }
    > = {
      1: { hp: 2, damage: 5, speed: 35 },
    };

    const currentDifficulty = resolvedMap.difficulty ?? 1;
    const diffStats =
      DIFFICULTY_STATS[currentDifficulty] ?? DIFFICULTY_STATS[1];

    const GOBLIN_CONFIG = {
      speed: diffStats.speed,
      chaseRange: 150,
      attackRange: 40,
      attackCooldown: 1.5,
      patrolRange: 100,
      health: diffStats.hp,
      damage: diffStats.damage,
    };

    const YOD_CONFIG = {
      speed: Math.max(30, Math.floor(diffStats.speed * 1.3)),
      chaseRange: 160,
      attackRange: 45,
      attackCooldown: 1.8,
      patrolRange: 110,
      health: Math.max(2, Math.ceil(diffStats.hp * 1.3)),
      damage: Math.max(6, Math.ceil(diffStats.damage * 1.3)),
    };

    let difficultyScale = 1;
    const STAT_SCALE_POWER = 1.5;

    type GoblinState = "idle" | "patrol" | "chase" | "attack";

    function findGoblinSpawns(grid: number[][], count: number) {
      const spawns: { x: number; y: number }[] = [];
      const candidates: { x: number; y: number }[] = [];

      for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < (grid[y]?.length ?? 0); x++) {
          if (isWalkableTile(grid[y][x])) {
            candidates.push({ x, y });
          }
        }
      }

      // Randomly pick spawn points
      for (let i = 0; i < count && candidates.length > 0; i++) {
        const idx = Math.floor(Math.random() * candidates.length);
        spawns.push(candidates[idx]);
        candidates.splice(idx, 1);
      }

      return spawns;
    }

    function spawnGoblin(
      spawnX: number,
      spawnY: number,
      customHp?: number,
      customDamage?: number,
      customSpeed?: number,
    ) {
      const variance = 0.85 + Math.random() * 0.3;
      const baseHealth =
        customHp !== undefined
          ? Math.max(1, Math.round(customHp / Math.max(0.1, difficultyScale)))
          : GOBLIN_CONFIG.health;
      const baseDamage =
        customDamage !== undefined
          ? Math.max(
              1,
              Math.round(customDamage / Math.max(0.1, difficultyScale)),
            )
          : GOBLIN_CONFIG.damage;
      const hp = Math.max(1, Math.round(baseHealth * variance));
      const damage = Math.max(1, Math.round(baseDamage * variance));
      const speed = customSpeed ?? GOBLIN_CONFIG.speed;

      const goblin = add([
        sprite("goblin", { anim: "idle" }),
        pos(spawnX * tileSize + tileSize / 2, spawnY * tileSize + tileSize / 2),
        area({ shape: new Rect(vec2(0), 40, 40) }),
        anchor("center"),
        scale(0.3),
        {
          state: "idle" as GoblinState,
          facing: 1,
          health: hp,
          maxHealth: hp,
          baseHealth: Math.max(1, Math.round(baseHealth * variance)),
          baseDamage: Math.max(1, Math.round(baseDamage * variance)),
          damage: damage,
          speed: speed,
          attackTimer: 0,
          patrolTarget: null as { x: number; y: number } | null,
          patrolOrigin: { x: spawnX, y: spawnY },
          stateTimer: 0,
        },
        "goblin",
        "enemy",
      ]);

      // HP Bar for goblin
      const HP_BAR_W = 32;
      const HP_BAR_H = 4;
      const HP_OFFSET_Y = -25;

      const hpBarBg = add([
        rect(HP_BAR_W, HP_BAR_H),
        pos(goblin.pos.x, goblin.pos.y + HP_OFFSET_Y),
        anchor("center"),
        color(40, 40, 40),
        outline(1, rgb(20, 20, 20)),
        z(100),
      ]);

      const hpBarFill = add([
        rect(HP_BAR_W, HP_BAR_H),
        pos(
          goblin.pos.x - HP_BAR_W / 2,
          goblin.pos.y + HP_OFFSET_Y - HP_BAR_H / 2,
        ),
        color(220, 60, 60),
        z(101),
      ]);

      // Update HP bar position and width each frame
      goblin.onUpdate(() => {
        if (!goblin.exists()) {
          hpBarBg.destroy();
          hpBarFill.destroy();
          return;
        }
        hpBarBg.pos.x = goblin.pos.x;
        hpBarBg.pos.y = goblin.pos.y + HP_OFFSET_Y;
        hpBarFill.pos.x = goblin.pos.x - HP_BAR_W / 2;
        hpBarFill.pos.y = goblin.pos.y + HP_OFFSET_Y - HP_BAR_H / 2;

        const ratio = goblin.health / goblin.maxHealth;
        hpBarFill.width = HP_BAR_W * ratio;

        // Change color based on HP
        if (ratio > 0.6) {
          hpBarFill.color = rgb(80, 200, 80);
        } else if (ratio > 0.3) {
          hpBarFill.color = rgb(220, 180, 60);
        } else {
          hpBarFill.color = rgb(220, 60, 60);
        }
      });

      goblin.onDestroy(() => {
        hpBarBg.destroy();
        hpBarFill.destroy();
      });

      applyDifficultyScale(goblin);
      return goblin;
    }

    function spawnYod(
      spawnX: number,
      spawnY: number,
      customHp?: number,
      customDamage?: number,
      customSpeed?: number,
    ) {
      const variance = 0.85 + Math.random() * 0.3;
      const baseHealth =
        customHp !== undefined
          ? Math.max(1, Math.round(customHp / Math.max(0.1, difficultyScale)))
          : YOD_CONFIG.health;
      const baseDamage =
        customDamage !== undefined
          ? Math.max(
              1,
              Math.round(customDamage / Math.max(0.1, difficultyScale)),
            )
          : YOD_CONFIG.damage;
      const hp = Math.max(1, Math.round(baseHealth * variance));
      const damage = Math.max(1, Math.round(baseDamage * variance));
      const speed = customSpeed ?? YOD_CONFIG.speed;

      const yod = add([
        sprite("yod", { anim: "idle" }),
        pos(spawnX * tileSize + tileSize / 2, spawnY * tileSize + tileSize / 2),
        area({ shape: new Rect(vec2(0), 40, 40) }),
        anchor("center"),
        scale(0.32),
        {
          state: "idle" as GoblinState,
          facing: 1,
          health: hp,
          maxHealth: hp,
          baseHealth: Math.max(1, Math.round(baseHealth * variance)),
          baseDamage: Math.max(1, Math.round(baseDamage * variance)),
          damage: damage,
          speed: speed,
          attackTimer: 0,
          patrolTarget: null as { x: number; y: number } | null,
          patrolOrigin: { x: spawnX, y: spawnY },
          stateTimer: 0,
        },
        "yod",
        "enemy",
      ]);

      const HP_BAR_W = 36;
      const HP_BAR_H = 4;
      const HP_OFFSET_Y = -26;

      const hpBarBg = add([
        rect(HP_BAR_W, HP_BAR_H),
        pos(yod.pos.x, yod.pos.y + HP_OFFSET_Y),
        anchor("center"),
        color(40, 40, 40),
        outline(1, rgb(20, 20, 20)),
        z(100),
      ]);

      const hpBarFill = add([
        rect(HP_BAR_W, HP_BAR_H),
        pos(yod.pos.x - HP_BAR_W / 2, yod.pos.y + HP_OFFSET_Y - HP_BAR_H / 2),
        color(220, 60, 60),
        z(101),
      ]);

      yod.onUpdate(() => {
        if (!yod.exists()) {
          hpBarBg.destroy();
          hpBarFill.destroy();
          return;
        }
        hpBarBg.pos.x = yod.pos.x;
        hpBarBg.pos.y = yod.pos.y + HP_OFFSET_Y;
        hpBarFill.pos.x = yod.pos.x - HP_BAR_W / 2;
        hpBarFill.pos.y = yod.pos.y + HP_OFFSET_Y - HP_BAR_H / 2;

        const ratio = yod.health / yod.maxHealth;
        hpBarFill.width = HP_BAR_W * ratio;
        if (ratio > 0.6) {
          hpBarFill.color = rgb(80, 200, 80);
        } else if (ratio > 0.3) {
          hpBarFill.color = rgb(220, 180, 60);
        } else {
          hpBarFill.color = rgb(220, 60, 60);
        }
      });

      yod.onDestroy(() => {
        hpBarBg.destroy();
        hpBarFill.destroy();
      });

      applyDifficultyScale(yod);
      return yod;
    }

    function applyDifficultyScale(enemy: {
      baseHealth?: number;
      baseDamage?: number;
      health?: number;
      maxHealth?: number;
      damage?: number;
    }) {
      const baseHealth = enemy.baseHealth ?? enemy.maxHealth ?? 1;
      const baseDamage = enemy.baseDamage ?? enemy.damage ?? 1;
      const statScale = Math.pow(difficultyScale, STAT_SCALE_POWER);
      const nextMax = Math.max(1, Math.ceil(baseHealth * statScale));
      const nextDamage = Math.max(1, Math.ceil(baseDamage * statScale));
      const currentRatio =
        (enemy.health ?? nextMax) / (enemy.maxHealth ?? nextMax);
      enemy.maxHealth = nextMax;
      enemy.health = Math.max(1, Math.ceil(currentRatio * nextMax));
      enemy.damage = nextDamage;
    }

    function updateGoblin(
      goblin: ReturnType<typeof spawnGoblin>,
      playerPos: Vec2,
    ) {
      const dist = goblin.pos.dist(playerPos);
      const dt_val = dt();
      goblin.attackTimer = Math.max(0, goblin.attackTimer - dt_val);
      goblin.stateTimer += dt_val;

      // State transitions
      if (dist <= GOBLIN_CONFIG.attackRange && goblin.attackTimer <= 0) {
        goblin.state = "attack";
      } else if (dist <= GOBLIN_CONFIG.chaseRange) {
        if (goblin.state !== "attack") goblin.state = "chase";
      } else {
        if (goblin.state === "chase") goblin.state = "patrol";
        if (goblin.state === "idle" && goblin.stateTimer > 2) {
          goblin.state = "patrol";
          goblin.stateTimer = 0;
        }
      }

      // State behaviors
      switch (goblin.state) {
        case "idle":
          if (goblin.curAnim() !== "idle") {
            goblin.play("idle");
          }
          break;

        case "patrol": {
          if (
            !goblin.patrolTarget ||
            goblin.pos.dist(
              vec2(
                goblin.patrolTarget.x * tileSize + tileSize / 2,
                goblin.patrolTarget.y * tileSize + tileSize / 2,
              ),
            ) < 10
          ) {
            // Pick new patrol target
            const ox = goblin.patrolOrigin.x;
            const oy = goblin.patrolOrigin.y;
            const range = Math.floor(GOBLIN_CONFIG.patrolRange / tileSize);
            const nx = ox + Math.floor(Math.random() * range * 2) - range;
            const ny = oy + Math.floor(Math.random() * range * 2) - range;
            if (
              nx >= 0 &&
              ny >= 0 &&
              ny < resolvedMap.grid.length &&
              nx < (resolvedMap.grid[ny]?.length ?? 0) &&
              isWalkableTile(resolvedMap.grid[ny]?.[nx] ?? 0)
            ) {
              goblin.patrolTarget = { x: nx, y: ny };
            } else {
              goblin.state = "idle";
              goblin.stateTimer = 0;
              break;
            }
          }

          const patrolPos = vec2(
            goblin.patrolTarget.x * tileSize + tileSize / 2,
            goblin.patrolTarget.y * tileSize + tileSize / 2,
          );
          const patrolDir = patrolPos.sub(goblin.pos).unit();
          const nextPatrolPos = goblin.pos.add(
            patrolDir.scale(GOBLIN_CONFIG.speed * 0.5 * dt_val),
          );

          // Check if next position is walkable before moving
          const patrolTileX = Math.floor(nextPatrolPos.x / tileSize);
          const patrolTileY = Math.floor(nextPatrolPos.y / tileSize);
          if (
            patrolTileY >= 0 &&
            patrolTileY < resolvedMap.grid.length &&
            patrolTileX >= 0 &&
            patrolTileX < (resolvedMap.grid[patrolTileY]?.length ?? 0) &&
            isWalkableTile(resolvedMap.grid[patrolTileY]?.[patrolTileX] ?? 0)
          ) {
            goblin.pos = nextPatrolPos;
          } else {
            // Can't move there, pick new target
            goblin.patrolTarget = null;
            goblin.state = "idle";
            goblin.stateTimer = 0;
          }

          goblin.facing = patrolDir.x >= 0 ? 1 : -1;
          goblin.flipX = goblin.facing === -1;

          if (goblin.curAnim() !== "run") {
            goblin.play("run");
          }
          break;
        }

        case "chase": {
          const chaseDir = playerPos.sub(goblin.pos).unit();
          const nextPos = goblin.pos.add(
            chaseDir.scale(GOBLIN_CONFIG.speed * dt_val),
          );

          // Check if next position is walkable
          const tileX = Math.floor(nextPos.x / tileSize);
          const tileY = Math.floor(nextPos.y / tileSize);
          if (
            tileY >= 0 &&
            tileY < resolvedMap.grid.length &&
            tileX >= 0 &&
            tileX < (resolvedMap.grid[tileY]?.length ?? 0) &&
            isWalkableTile(resolvedMap.grid[tileY]?.[tileX] ?? 0)
          ) {
            goblin.pos = nextPos;
          }

          goblin.facing = chaseDir.x >= 0 ? 1 : -1;
          goblin.flipX = goblin.facing === -1;

          if (goblin.curAnim() !== "run") {
            goblin.play("run");
          }
          break;
        }

        case "attack": {
          if (goblin.attackTimer <= 0) {
            // Determine attack direction
            const dir = playerPos.sub(goblin.pos);
            let attackAnim = "attack-right";
            if (Math.abs(dir.y) > Math.abs(dir.x)) {
              attackAnim = dir.y > 0 ? "attack-down" : "attack-up";
            }
            goblin.facing = dir.x >= 0 ? 1 : -1;
            goblin.flipX = goblin.facing === -1;

            goblin.play(attackAnim);
            goblin.attackTimer = GOBLIN_CONFIG.attackCooldown;

            // Spawn attack hitbox - starts from goblin center and extends forward
            wait(0.2, () => {
              if (!goblin.exists()) return;
              const hitbox = add([
                pos(goblin.pos.x + goblin.facing * 10, goblin.pos.y),
                area({ shape: new Rect(vec2(0), 28, 24) }),
                anchor("center"),
                lifespan(0.12),
                "goblin-attack",
                {
                  damage: goblin.damage ?? GOBLIN_CONFIG.damage,
                  source: "goblin",
                  hitSomething: false,
                },
              ]);
              
              // Check if attack hit after a short delay
              wait(0.06, () => {
                if (!hitbox.exists()) return;
                if (!hitbox.hitSomething) {
                  soundManager.play('hit-air');
                }
              });
            });
          }

          // Return to chase after attack animation
          if (goblin.attackTimer < GOBLIN_CONFIG.attackCooldown - 0.5) {
            goblin.state = "chase";
          }
          break;
        }
      }
    }

    function updateYod(yod: ReturnType<typeof spawnYod>, playerPos: Vec2) {
      const dist = yod.pos.dist(playerPos);
      const dt_val = dt();
      yod.attackTimer = Math.max(0, yod.attackTimer - dt_val);
      yod.stateTimer += dt_val;

      if (dist <= YOD_CONFIG.attackRange && yod.attackTimer <= 0) {
        yod.state = "attack";
      } else if (dist <= YOD_CONFIG.chaseRange) {
        if (yod.state !== "attack") yod.state = "chase";
      } else {
        if (yod.state === "chase") yod.state = "patrol";
        if (yod.state === "idle" && yod.stateTimer > 2) {
          yod.state = "patrol";
          yod.stateTimer = 0;
        }
      }

      switch (yod.state) {
        case "idle":
          if (yod.curAnim() !== "idle") {
            yod.play("idle");
          }
          break;

        case "patrol": {
          if (
            !yod.patrolTarget ||
            yod.pos.dist(
              vec2(
                yod.patrolTarget.x * tileSize + tileSize / 2,
                yod.patrolTarget.y * tileSize + tileSize / 2,
              ),
            ) < 10
          ) {
            const ox = yod.patrolOrigin.x;
            const oy = yod.patrolOrigin.y;
            const range = Math.floor(YOD_CONFIG.patrolRange / tileSize);
            const nx = ox + Math.floor(Math.random() * range * 2) - range;
            const ny = oy + Math.floor(Math.random() * range * 2) - range;
            if (
              nx >= 0 &&
              ny >= 0 &&
              ny < resolvedMap.grid.length &&
              nx < (resolvedMap.grid[ny]?.length ?? 0) &&
              isWalkableTile(resolvedMap.grid[ny]?.[nx] ?? 0)
            ) {
              yod.patrolTarget = { x: nx, y: ny };
            } else {
              yod.state = "idle";
              yod.stateTimer = 0;
              break;
            }
          }

          const patrolPos = vec2(
            yod.patrolTarget.x * tileSize + tileSize / 2,
            yod.patrolTarget.y * tileSize + tileSize / 2,
          );
          const patrolDir = patrolPos.sub(yod.pos).unit();
          const nextPatrolPos = yod.pos.add(
            patrolDir.scale(YOD_CONFIG.speed * 0.5 * dt_val),
          );

          const patrolTileX = Math.floor(nextPatrolPos.x / tileSize);
          const patrolTileY = Math.floor(nextPatrolPos.y / tileSize);
          if (
            patrolTileY >= 0 &&
            patrolTileY < resolvedMap.grid.length &&
            patrolTileX >= 0 &&
            patrolTileX < (resolvedMap.grid[patrolTileY]?.length ?? 0) &&
            isWalkableTile(resolvedMap.grid[patrolTileY]?.[patrolTileX] ?? 0)
          ) {
            yod.pos = nextPatrolPos;
          } else {
            yod.patrolTarget = null;
            yod.state = "idle";
            yod.stateTimer = 0;
          }

          yod.facing = patrolDir.x >= 0 ? 1 : -1;
          yod.flipX = yod.facing === -1;

          if (yod.curAnim() !== "run") {
            yod.play("run");
          }
          break;
        }

        case "chase": {
          const chaseDir = playerPos.sub(yod.pos).unit();
          const nextPos = yod.pos.add(
            chaseDir.scale(YOD_CONFIG.speed * dt_val),
          );

          const tileX = Math.floor(nextPos.x / tileSize);
          const tileY = Math.floor(nextPos.y / tileSize);
          if (
            tileY >= 0 &&
            tileY < resolvedMap.grid.length &&
            tileX >= 0 &&
            tileX < (resolvedMap.grid[tileY]?.length ?? 0) &&
            isWalkableTile(resolvedMap.grid[tileY]?.[tileX] ?? 0)
          ) {
            yod.pos = nextPos;
          }

          yod.facing = chaseDir.x >= 0 ? 1 : -1;
          yod.flipX = yod.facing === -1;

          if (yod.curAnim() !== "run") {
            yod.play("run");
          }
          break;
        }

        case "attack": {
          if (yod.attackTimer <= 0) {
            const dir = playerPos.sub(yod.pos);
            yod.facing = dir.x >= 0 ? 1 : -1;
            yod.flipX = yod.facing === -1;

            yod.play("attack");
            yod.attackTimer = YOD_CONFIG.attackCooldown;

            wait(0.2, () => {
              if (!yod.exists()) return;
              const hitbox = add([
                pos(yod.pos.x + yod.facing * 12, yod.pos.y),
                area({ shape: new Rect(vec2(0), 30, 24) }),
                anchor("center"),
                lifespan(0.12),
                "goblin-attack",
                {
                  damage: yod.damage ?? YOD_CONFIG.damage,
                  source: "yod",
                  hitSomething: false,
                },
              ]);
              
              // Check if attack hit after a short delay
              wait(0.06, () => {
                if (!hitbox.exists()) return;
                if (!hitbox.hitSomething) {
                  soundManager.play('hit-air');
                }
              });
            });
          }

          if (yod.attackTimer < YOD_CONFIG.attackCooldown - 0.5) {
            yod.state = "chase";
          }
          break;
        }
      }
    }

    // Spawn goblins on map
    const mapWidth = resolvedMap.grid[0]?.length ?? 0;
    const mapHeight = resolvedMap.grid.length;
    const baseDifficulty = resolvedMap.difficulty ?? 1;
    const chunkCount =
      resolvedMap.chunkCount ??
      Math.max(
        1,
        Math.ceil((mapWidth * mapHeight) / (CHUNK_SIZE * CHUNK_SIZE)),
      );

    // Số quái ban đầu dựa trên difficulty (giảm để game dễ hơn lúc đầu)
    // Difficulty 1: chỉ 1 quái, Difficulty 9: nhiều hơn
    const enemiesPerChunk = 0.3 + (baseDifficulty - 1) * 0.15; // 0.3 -> 1.5
    const initialGoblinCount = Math.max(
      1,
      Math.floor(chunkCount * enemiesPerChunk),
    );
    const goblinCount = Math.max(1, initialGoblinCount);
    const yodCount = Math.max(0, Math.floor(goblinCount / 2));
    const goblinSpawns = findGoblinSpawns(resolvedMap.grid, goblinCount);
    const goblins: ReturnType<typeof spawnGoblin>[] = goblinSpawns.map(
      (spawn) =>
        spawnGoblin(
          spawn.x,
          spawn.y,
          GOBLIN_CONFIG.health,
          GOBLIN_CONFIG.damage,
          GOBLIN_CONFIG.speed,
        ),
    );
    const yodSpawns = findGoblinSpawns(resolvedMap.grid, yodCount);
    const yods: ReturnType<typeof spawnYod>[] = yodSpawns.map((spawn) =>
      spawnYod(
        spawn.x,
        spawn.y,
        YOD_CONFIG.health,
        YOD_CONFIG.damage,
        YOD_CONFIG.speed,
      ),
    );

    // ===== ENEMY MAINTAINER =====
    const RPC_URL = "https://fullnode.testnet.sui.io:443";

    // Hàm spawn goblin từ EnemyMaintainer
    function spawnGoblinFromMaintainer(config: EnemyConfig) {
      const spawnYodNow = Math.random() < 1 / 3;
      // Tìm vị trí spawn xa player
      const candidates: { x: number; y: number }[] = [];
      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          if (isWalkableTile(resolvedMap.grid[y]?.[x] ?? 0)) {
            const tileX = x * tileSize + tileSize / 2;
            const tileY = y * tileSize + tileSize / 2;
            const dist = Math.sqrt(
              (player.pos.x - tileX) ** 2 + (player.pos.y - tileY) ** 2,
            );
            // Spawn xa player ít nhất 4 tiles
            if (dist > tileSize * 4) {
              candidates.push({ x, y });
            }
          }
        }
      }

      if (candidates.length === 0) return;

      const spawn = candidates[Math.floor(Math.random() * candidates.length)];
      if (spawnYodNow) {
        const newYod = spawnYod(
          spawn.x,
          spawn.y,
          Math.max(config.baseHp, YOD_CONFIG.health),
          Math.max(config.baseDamage, YOD_CONFIG.damage),
          Math.max(config.baseSpeed * 0.9, YOD_CONFIG.speed),
        );
        yods.push(newYod);
        console.log(
          `[Maintainer] Spawned yod at (${spawn.x}, ${spawn.y}) HP:${newYod.health} DMG:${newYod.damage} scale:${difficultyScale.toFixed(2)}`,
        );
      } else {
        const newGoblin = spawnGoblin(
          spawn.x,
          spawn.y,
          config.baseHp,
          config.baseDamage,
          config.baseSpeed,
        );
        goblins.push(newGoblin);
        console.log(
          `[Maintainer] Spawned goblin at (${spawn.x}, ${spawn.y}) HP:${newGoblin.health} DMG:${newGoblin.damage} scale:${difficultyScale.toFixed(2)}`,
        );
      }
    }

    // Khởi tạo maintainer
    const maintainer = initEnemyMaintainer({
      rpcUrl: RPC_URL,
      baseDifficulty,
      chunkCount,
      onSpawnEnemy: spawnGoblinFromMaintainer,
      onDifficultyUpdate: (info: DifficultyInfo) => {
        const aliveGoblins = goblins.filter((goblin) => goblin.exists());
        const aliveYods = yods.filter((yod) => yod.exists());
        window.dispatchEvent(
          new CustomEvent("game:difficulty-update", {
            detail: {
              ...info,
              currentEnemyCount: aliveGoblins.length + aliveYods.length,
            },
          }),
        );
        if (info.baseDifficulty > 0) {
          difficultyScale = info.effectiveDifficulty / info.baseDifficulty;
          goblins.forEach((goblin) => applyDifficultyScale(goblin));
          yods.forEach((yod) => applyDifficultyScale(yod));
        }
      },
    });

    // Cập nhậ t số quái ban đầu
    maintainer.updateEnemyCount(goblins.length + yods.length);

    // Start checking mỗi 10 giây
    maintainer.start(10000);

    // Update all goblins
    onUpdate(() => {
      if (isGameOver) return;
      // Đếm số quái còn sống và cập nhật maintainer
      const aliveGoblins = goblins.filter((g) => g.exists());
      const aliveYods = yods.filter((y) => y.exists());
      maintainer.updateEnemyCount(aliveGoblins.length + aliveYods.length);

      goblins.forEach((goblin) => {
        if (goblin.exists()) {
          // Check if goblin is on dangerous tile (abyss/void) - destroy it
          const gTileId = getTileIdAt(goblin.pos);
          if (
            gTileId === null ||
            !isTileDefined(gTileId) ||
            !isWalkableTile(gTileId)
          ) {
            goblin.destroy();
            return;
          }
          updateGoblin(goblin, player.pos);
        }
      });
      yods.forEach((yod) => {
        if (yod.exists()) {
          const yTileId = getTileIdAt(yod.pos);
          if (
            yTileId === null ||
            !isTileDefined(yTileId) ||
            !isWalkableTile(yTileId)
          ) {
            yod.destroy();
            return;
          }
          updateYod(yod, player.pos);
        }
      });
    });

    // Handle player attack hitting goblins
    onCollide("attack", "goblin", (attack, goblin) => {
      attack.hitSomething = true;
      soundManager.play('hit-enemy');
      goblin.health -= 1;
      if (goblin.health <= 0) {
        goblin.destroy();
      } else {
        // Knockback
        const knockDir = goblin.pos.sub(player.pos).unit();
        goblin.pos = goblin.pos.add(knockDir.scale(20));
      }
    });
    onCollide("attack", "yod", (attack, yod) => {
      attack.hitSomething = true;
      soundManager.play('hit-enemy');
      yod.health -= 1;
      if (yod.health <= 0) {
        yod.destroy();
      } else {
        const knockDir = yod.pos.sub(player.pos).unit();
        yod.pos = yod.pos.add(knockDir.scale(20));
      }
    });

    // Handle goblin attack hitting player - moved after player creation
    // See below after player is created

    /* ================= PLAYER ================= */

    const PLAYER_MAX_HP = resolvedMap?.characterHealth ?? 100;
    let playerHP = PLAYER_MAX_HP;
    let playerInvincible = false;

    const player = add([
      sprite("player-idle", { anim: "idle" }),
      pos(spawnPos),
      area({ shape: new Rect(vec2(0), 65, 70) }),
      anchor("center"),
      {
        speed: 200,
        facing: 1, // 1 right, -1 left
        attacking: false,
        attackFacing: 1,
      },
      scale(0.3),
      opacity(1),
      "player",
    ]);

    // Notify that player has spawned and is ready
    wait(0.1, () => {
      window.dispatchEvent(new CustomEvent("game:player-spawned"));
    });

    /* ================= HEALTH BAR UI ================= */

    const HP_BAR_WIDTH = 180;
    const HP_BAR_HEIGHT = 16;
    const HP_BAR_PADDING = 3;
    const HP_BAR_X = 20;
    const HP_BAR_Y = height() - 50; // Bottom of screen

    // HP Bar background
    const hpBarBg = add([
      rect(
        HP_BAR_WIDTH + HP_BAR_PADDING * 2,
        HP_BAR_HEIGHT + HP_BAR_PADDING * 2,
      ),
      pos(HP_BAR_X, HP_BAR_Y),
      color(30, 30, 40),
      outline(2, rgb(60, 60, 80)),
      fixed(),
      z(1000),
    ]);

    // HP Bar fill
    const hpBarFill = add([
      rect(HP_BAR_WIDTH, HP_BAR_HEIGHT),
      pos(HP_BAR_X + HP_BAR_PADDING, HP_BAR_Y + HP_BAR_PADDING),
      color(220, 60, 60),
      fixed(),
      z(1001),
    ]);

    // HP text
    const hpText = add([
      text(`${playerHP}/${PLAYER_MAX_HP}`, { size: 14 }),
      pos(
        HP_BAR_X + HP_BAR_WIDTH / 2 + HP_BAR_PADDING,
        HP_BAR_Y + HP_BAR_PADDING + HP_BAR_HEIGHT / 2,
      ),
      anchor("center"),
      color(255, 255, 255),
      fixed(),
      z(1002),
    ]);

    // Heart icon
    add([
      text("❤", { size: 20 }),
      pos(
        HP_BAR_X + HP_BAR_WIDTH + 30,
        HP_BAR_Y + HP_BAR_PADDING + HP_BAR_HEIGHT / 2,
      ),
      anchor("center"),
      color(255, 100, 100),
      fixed(),
      z(1002),
    ]);

    function updateHPBar() {
      const ratio = playerHP / PLAYER_MAX_HP;
      hpBarFill.width = HP_BAR_WIDTH * ratio;
      hpText.text = `${playerHP}/${PLAYER_MAX_HP}`;

      // Change color based on HP
      if (ratio > 0.6) {
        hpBarFill.color = rgb(80, 200, 80); // Green
      } else if (ratio > 0.3) {
        hpBarFill.color = rgb(220, 180, 60); // Yellow
      } else {
        hpBarFill.color = rgb(220, 60, 60); // Red
      }
    }

    updateHPBar();

    // Handle goblin attack hitting player
    // Damage is now dynamic based on difficulty (from attack hitbox)
    onCollide("goblin-attack", "player", (attack, _player) => {
      if (isGameOver) return;
      if (playerInvincible) return;

      attack.hitSomething = true;
      soundManager.play('hit-me');

      // Get damage from the attack hitbox (set when goblin attacks)
      const goblinDamage = attack.damage ?? GOBLIN_CONFIG.damage;

      playerHP -= goblinDamage;
      if (playerHP < 0) playerHP = 0;
      updateHPBar();

      if (playerHP <= 0) {
        // Player dies
        triggerGameOver();
        return;
      }

      // Invincibility frames
      playerInvincible = true;

      // Flash effect
      let flashCount = 0;
      const flashInterval = loop(0.1, () => {
        player.opacity = player.opacity === 1 ? 0.3 : 1;
        flashCount++;
        if (flashCount >= 10) {
          flashInterval.cancel();
          player.opacity = 1;
          playerInvincible = false;
        }
      });
    });

    const playTarget = loadPlayTarget();
    const playState = loadPlayState();
    const chests = loadPlayChests();
    
    // Check if key is hidden in a chest
    const keyHiddenInChest = chests.some(c => c.hasKey);

    const worldMatch =
      !playTarget?.worldId ||
      !resolvedMap.worldId ||
      playTarget.worldId === resolvedMap.worldId;
      
    // Spawn Chests
    if (worldMatch && chests.length > 0 && !playTarget?.found) {
      chests.forEach(chest => {
        // Validation: check terrain
        const tileId = getTileIdAt(vec2(chest.x * tileSize, chest.y * tileSize));
        if (
          tileId !== null &&
          isTileDefined(tileId) &&
          isWalkableTile(tileId)
        ) {
           const chestObj = add([
             sprite("chest"),
             pos(chest.x * tileSize + tileSize / 2, chest.y * tileSize + tileSize / 2),
             anchor("center"),
             area({ shape: new Rect(vec2(0), 28, 24) }),
             body({ isStatic: true }),
             scale(0.8),
             "chest",
             "obstacle",
             {
               id: chest.id,
               hasKey: chest.hasKey,
               health: 2,
             }
           ]);
           
           // HP Bar for chest (optional, or just hit effect)
        }
      });
      
      // Chest collision logic
      onCollide("attack", "chest", (attack, chest) => {
        attack.hitSomething = true;
        soundManager.play('hit-chest');
        chest.health -= 1;
        // Hit effect
        const textPos = chest.pos.sub(0, 20);
        add([
          text("Hit!", { size: 10 }),
          pos(textPos),
          anchor("center"),
          color(255, 255, 255),
          lifespan(0.3),
          move(vec2(0, -100), 50),
        ]);
        
        if (chest.health <= 0) {
          destroy(chest);
          
          // If chest had key, spawn key now
          if (chest.hasKey && playTarget) {
             spawnKey(playTarget, playState?.playId);
          }
        } else {
           // Flash effect or shake
           chest.color = rgb(255, 100, 100);
           wait(0.1, () => {
             if (chest.exists()) chest.color = rgb(255, 255, 255);
           });
        }
      });
    }

    // Helper to spawn key
    function spawnKey(target: {x: number, y: number}, pId?: string) {
       const keyPos = vec2(
        target.x * tileSize + tileSize / 2,
        target.y * tileSize + tileSize / 2,
      );
      const keyObj = add([
        sprite("key", { anim: "spin" }),
        pos(keyPos),
        area({ shape: new Rect(vec2(0), tileSize * 0.8, tileSize * 0.8) }),
        anchor("center"),
        scale(1.5),
        "key",
      ]);
      
      let keyFound = false;
      player.onCollide("key", () => {
        if (keyFound) return;
        keyFound = true;
        keyObj.destroy();
        markKeyFound(target, pId);
      });
    }

    if (
      playTarget &&
      worldMatch &&
      !playTarget.found &&
      !keyHiddenInChest && // Only spawn initially if NOT in a chest
      Number.isFinite(playTarget.x) &&
      Number.isFinite(playTarget.y) &&
      isWalkableTile(resolvedMap.grid[playTarget.y]?.[playTarget.x] ?? 0)
    ) {
       spawnKey(playTarget, playState?.playId);
    }

    onUpdate(() => {
      if (isGameOver) return;
      camPos(player.pos);
      camScale(2); // Zoom camera 2x để nhìn rõ hơn
    });

    /* ================= INPUT STATE ================= */

    let moveDir = vec2(0, 0);
    let isFalling = false;

    function triggerGameOver() {
      if (isGameOver) return;
      isGameOver = true;
      console.log("Triggering Game Over");
      window.dispatchEvent(new CustomEvent("game:player-dead"));
      stopEnemyMaintainer();
    }

    function handleFallDeath() {
      if (isFalling) return;
      isFalling = true;
      triggerGameOver();
    }

    onKeyDown("a", () => {
      if (isGameOver) return;
      if (player.attacking) return;
      moveDir.x = -1;
      player.facing = -1;
    });

    onKeyDown("d", () => {
      if (isGameOver) return;
      if (player.attacking) return;
      moveDir.x = 1;
      player.facing = 1;
    });

    onKeyDown("w", () => {
      if (isGameOver) return;
      moveDir.y = -1;
    });
    onKeyDown("s", () => {
      if (isGameOver) return;
      moveDir.y = 1;
    });

    /* ================= MOVE ================= */

    function getTileIdAt(pos: Vec2) {
      const x = Math.floor(pos.x / tileSize);
      const y = Math.floor(pos.y / tileSize);
      if (y < 0 || y >= resolvedMap.grid.length) return null;
      if (x < 0 || x >= (resolvedMap.grid[y]?.length ?? 0)) return null;
      const value = resolvedMap.grid[y]?.[x];
      return typeof value === "number" ? value : null;
    }

    // Player collision half-size (for bounding box checks)
    const PLAYER_HALF_WIDTH = 10;
    const PLAYER_HALF_HEIGHT = 12;

    function canMove(pos: Vec2) {
      // Check all 4 corners + center with padding to prevent edge jittering
      const checkPoints = [
        pos, // center
        vec2(pos.x - PLAYER_HALF_WIDTH, pos.y - PLAYER_HALF_HEIGHT), // top-left
        vec2(pos.x + PLAYER_HALF_WIDTH, pos.y - PLAYER_HALF_HEIGHT), // top-right
        vec2(pos.x - PLAYER_HALF_WIDTH, pos.y + PLAYER_HALF_HEIGHT), // bottom-left
        vec2(pos.x + PLAYER_HALF_WIDTH, pos.y + PLAYER_HALF_HEIGHT), // bottom-right
      ];

      for (const point of checkPoints) {
        const tileId = getTileIdAt(point);
        if (tileId === null) return false; // Out of bounds - block movement
        if (!isTileDefined(tileId)) return false; // Undefined tile - block movement
        if (!isWalkableTile(tileId)) return false; // Not walkable - block movement
      }
      return true;
    }

    // Check if position is on a deadly tile (abyss/void/out of bounds)
    function isPositionDangerous(pos: Vec2) {
      const tileId = getTileIdAt(pos);
      if (tileId === null) return true; // Out of bounds
      if (!isTileDefined(tileId)) return true; // Undefined
      return !isWalkableTile(tileId); // Abyss or barrier
    }

    /* ================= ATTACK ================= */

    function spawnAttackHitbox() {
      const attackFacing = player.attackFacing ?? player.facing;
      const hitbox = add([
        pos(player.pos.x + attackFacing * 12, player.pos.y),
        area({ shape: new Rect(vec2(1), 28, 26) }),
        anchor("center"),
        lifespan(0.1),
        "attack",
        {
          hitSomething: false,
        },
      ]);
      
      // Check if attack will hit anything after a short delay
      wait(0.05, () => {
        if (!hitbox.exists()) return;
        if (!hitbox.hitSomething) {
          // Attack missed - play air sound
          soundManager.play('hit-air');
        }
      });
    }

    function attack() {
      if (isGameOver) return;
      if (player.attacking) return;

      player.attacking = true;
      player.attackFacing = player.facing;

      player.use(sprite("player-attack"));
      player.play("attack");

      wait(0.1, spawnAttackHitbox);

      wait(0.45, () => {
        player.attacking = false;
      });
    }

    onKeyPress("space", attack);

    /* ================= UPDATE LOOP ================= */

    player.onUpdate(() => {
      if (isGameOver) return;
      /* ---- CHECK DEATH ON ABYSS/VOID ---- */
      // If player is standing on dangerous tile (abyss, void, out of bounds) -> die
      if (isPositionDangerous(player.pos)) {
        handleFallDeath();
        return;
      }

      /* ---- MOVE ---- */
      if (!player.attacking && moveDir.len() > 0) {
        const next = player.pos.add(moveDir.unit().scale(player.speed * dt()));
        if (canMove(next)) player.pos = next;
      }

      /* ---- FLIP (1 nơi duy nhất) ---- */
      player.flipX = player.facing === -1;

      /* ---- ANIMATION FSM ---- */
      if (player.attacking) {
        moveDir = vec2(0, 0);
        return;
      }

      if (moveDir.len() > 0) {
        if (player.curAnim() !== "run") {
          player.use(sprite("player-run"));
          player.play("run");
        }
      } else {
        if (player.curAnim() !== "idle") {
          player.use(sprite("player-idle"));
          player.play("idle");
        }
      }

      /* ---- RESET INPUT ---- */
      moveDir = vec2(0, 0);
    });

    // Cleanup khi scene kết thúc
    onSceneLeave(() => {
      stopEnemyMaintainer();
    });
  });

  if (mapData) {
    go("game", { mapData });
  } else {
    go("game");
  }
}

function loadPlayState(): { playId?: string } | null {
  const raw = localStorage.getItem(PLAY_STATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(error);
    return null;
  }
}

function loadPlayTarget(): {
  x: number;
  y: number;
  found?: boolean;
  worldId?: string;
} | null {
  const raw = localStorage.getItem(PLAY_TARGET_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(error);
    return null;
  }

}

function loadPlayChests(): {
  x: number;
  y: number;
  hasKey: boolean;
  id: string;
}[] {
  const raw = localStorage.getItem(PLAY_CHESTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(error);
    return [];
  }
}

function markKeyFound(target: { x: number; y: number }, playId?: string) {
  localStorage.setItem(
    PLAY_TARGET_KEY,
    JSON.stringify({ ...target, found: true }),
  );
  window.dispatchEvent(
    new CustomEvent("game:key-found", { detail: { playId } }),
  );
}
