import Phaser from "phaser";
import {
  TILE_DEFS,
  DECO_DEFS,
  getTileDef,
  getDecoDef,
  isWalkableTile,
  isDecoBlocking,
  isTileDefined,
  isDecoDefined,
  DEFAULT_GROUND_TILE_ID,
} from "./tiles";
import {
  initEnemyMaintainer,
  stopEnemyMaintainer,
  EnemyConfig,
  DifficultyInfo,
} from "./enemyMaintainer";
import { soundManager } from "./soundManager";

type GameMapData = {
  tileSize: number;
  grid: number[][];
  decoGrid?: number[][];
  worldId?: string;
  characterHealth?: number;
  difficulty?: number; // 1-9 from WorldMap
  PLOTCount?: number; // Number of PLOTs
};

type ChestData = { x: number; y: number; hasKey: boolean; id: string };

type PlayTarget = {
  x: number;
  y: number;
  found?: boolean;
  worldId?: string;
};

type PlayState = { playId?: string } | null;

const TILE_FALLBACK = 32;
const PLOT_SIZE = 5;
const PLAY_STATE_KEY = "PLAY_STATE";
const PLAY_TARGET_KEY = "PLAY_TARGET";
const PLAY_CHESTS_KEY = "PLAY_CHESTS";

let started = false;
let game: Phaser.Game | null = null;

/**
 * When map data cannot be decoded from chain (common symptom: entire grid = 0),
 * the player spawns into void, dies instantly, and the screen only shows the
 * death modal. Detect that situation and fall back to a solid ground layer so
 * the run can start normally.
 */
function sanitizeMapData(map?: GameMapData | null): GameMapData | null {
  if (!map?.grid?.length) return map ?? null;

  let definedCount = 0;
  for (let y = 0; y < map.grid.length; y++) {
    for (let x = 0; x < (map.grid[y]?.length ?? 0); x++) {
      if (isTileDefined(map.grid[y]?.[x] ?? -1)) definedCount += 1;
    }
  }

  if (definedCount > 0) return map; // Already has valid tiles

  const safeGrid = map.grid.map((row) =>
    row.map((id) => (isTileDefined(id ?? -1) ? id : DEFAULT_GROUND_TILE_ID)),
  );
  const safeDecoGrid = map.decoGrid
    ? map.decoGrid.map((row) =>
        row.map((id) => (isDecoDefined(id ?? 0) ? id : 0)),
      )
    : undefined;

  return { ...map, grid: safeGrid, decoGrid: safeDecoGrid };
}

function buildLocalFallback(): GameMapData {
  const width = 20;
  const height = 15;
  const grid = Array(height)
    .fill(0)
    .map(() => Array(width).fill(DEFAULT_GROUND_TILE_ID));
  const decoGrid = Array(height)
    .fill(0)
    .map(() => Array(width).fill(0));
  return {
    tileSize: TILE_FALLBACK,
    width,
    height,
    grid,
    decoGrid,
    worldId: "offline-fallback",
    characterHealth: 100,
    difficulty: 1,
    PLOTCount: 0,
  };
}

function ensureMap(map?: GameMapData | null): GameMapData | null {
  const sanitized = sanitizeMapData(map);
  if (sanitized?.grid?.length) return sanitized;
  // Last resort: local fallback
  return sanitizeMapData(buildLocalFallback());
}

export function resetGame() {
  if (game) {
    game.destroy(true);
    game = null;
  }
  started = false;
  stopEnemyMaintainer();
}

export function startGame(mapData?: GameMapData) {
  let canvas = document.getElementById("game") as HTMLCanvasElement | null;
  if (!canvas) {
    // If React failed to render the canvas, create one inside .game-frame as a fallback
    const host =
      (document.querySelector(".game-frame") as HTMLElement | null) ??
      document.body;
    canvas = document.createElement("canvas");
    canvas.id = "game";
    canvas.style.display = "block";
    host.appendChild(canvas);
    console.warn(
      "[Voidia] canvas #game was missing; created fallback canvas inside .game-frame",
    );
  }

  // Always rebuild the Phaser game to keep config in sync with React mounts
  if (game) {
    game.destroy(true);
    game = null;
    stopEnemyMaintainer();
  }

  const resolvedMap = ensureMap(mapData ?? loadMap());
  if (!resolvedMap) {
    console.warn("No map data available, unable to start game");
    return;
  }

  // Expose for quick browser debug
  (window as any).__VOIDIA_MAP__ = resolvedMap;
  console.info("[Voidia] map data", {
    worldId: resolvedMap.worldId,
    size: `${resolvedMap.width}x${resolvedMap.height}`,
    tileSize: resolvedMap.tileSize,
    gridRows: resolvedMap.grid?.length ?? 0,
    gridCols: resolvedMap.grid?.[0]?.length ?? 0,
    decoRows: resolvedMap.decoGrid?.length ?? 0,
    PLOTCount: resolvedMap.PLOTCount ?? 0,
    difficulty: resolvedMap.difficulty ?? 1,
  });

  const scene = new WorldScene(resolvedMap);

  // In custom canvas environments (Electron/iframe), Phaser.AUTO can throw;
  // choose an explicit render type based on WebGL availability.
  const renderType = (() => {
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    return gl ? Phaser.WEBGL : Phaser.CANVAS;
  })();

  // Phaser >=3.87 requires explicit type when using a custom canvas/environment.
  // Use WEBGL (preferred) and let Phaser fall back to Canvas internally if unavailable.
  const hostRect = canvas.parentElement?.getBoundingClientRect();
  const viewWidth = Math.max(
    320,
    Math.floor(hostRect?.width ?? window.innerWidth),
  );
  const viewHeight = Math.max(
    240,
    Math.floor(hostRect?.height ?? window.innerHeight),
  );

  try {
    game = new Phaser.Game({
      type: renderType,
      width: viewWidth,
      height: viewHeight,
      canvas,
      backgroundColor: "#1a2a3a",
      physics: {
        default: "arcade",
        arcade: { gravity: { y: 0 }, debug: true },
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [scene],
    });
  } catch (err) {
    console.error("Phaser init failed, retrying with Canvas:", err);
    // Fallback to Canvas explicitly
    game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: viewWidth,
      height: viewHeight,
      canvas,
      backgroundColor: "#1a2a3a",
      physics: {
        default: "arcade",
        arcade: { gravity: { y: 0 }, debug: false },
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [scene],
    });
  }

  started = true;
}

function loadMap(): GameMapData | null {
  const raw = localStorage.getItem("CUSTOM_MAP");
  if (!raw) return null;
  try {
    return sanitizeMapData(JSON.parse(raw));
  } catch (error) {
    console.error(error);
    return null;
  }
}

function loadPlayState(): PlayState {
  const raw = localStorage.getItem(PLAY_STATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(error);
    return null;
  }
}

function loadPlayTarget(): PlayTarget | null {
  const raw = localStorage.getItem(PLAY_TARGET_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(error);
    return null;
  }
}

function loadPlayChests(): ChestData[] {
  const raw = localStorage.getItem(PLAY_CHESTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(error);
    return [];
  }
}

function markKeyFound(target: PlayTarget, playId?: string) {
  localStorage.setItem(
    PLAY_TARGET_KEY,
    JSON.stringify({ ...target, found: true }),
  );
  window.dispatchEvent(
    new CustomEvent("game:key-found", { detail: { playId } }),
  );
}

function findSpawn(grid: number[][], size: number) {
  const walkable: { x: number; y: number }[] = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < (grid[y]?.length ?? 0); x++) {
      if (isWalkableTile(grid[y]?.[x] ?? 0)) walkable.push({ x, y });
    }
  }
  if (walkable.length === 0) return new Phaser.Math.Vector2(size, size);
  const choice = Phaser.Utils.Array.GetRandom(walkable);
  return new Phaser.Math.Vector2(
    choice.x * size + size / 2,
    choice.y * size + size / 2,
  );
}

class WorldScene extends Phaser.Scene {
  private mapData?: GameMapData | null;
  private tileSize = TILE_FALLBACK;
  private mapWidth = 0;
  private mapHeight = 0;
  private blockers!: Phaser.Physics.Arcade.StaticGroup;
  private hazards = new Set<string>();
  private player?: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<
    "w" | "a" | "s" | "d" | "space",
    Phaser.Input.Keyboard.Key
  >;
  private attacks!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private chests!: Phaser.Physics.Arcade.StaticGroup;
  private keyObj?: Phaser.GameObjects.Sprite;
  private maintainer?: ReturnType<typeof initEnemyMaintainer>;
  private playerMaxHp = 100;
  private playerHp = 100;
  private hpText?: Phaser.GameObjects.Text;
  private infoText?: Phaser.GameObjects.Text;
  private worldBounds = new Phaser.Geom.Rectangle();

  constructor(initial?: GameMapData) {
    super("World");
    this.mapData = sanitizeMapData(initial);
  }

  init(data?: { mapData?: GameMapData }) {
    this.mapData = sanitizeMapData(data?.mapData ?? this.mapData ?? loadMap());
  }

  preload() {
    // Player sheets
    this.load.spritesheet("player-idle", "/sprites/player/Idle.png", {
      frameWidth: 192,
      frameHeight: 192,
    });
    this.load.spritesheet("player-run", "/sprites/player/Run.png", {
      frameWidth: 192,
      frameHeight: 192,
    });
    this.load.spritesheet("player-attack", "/sprites/player/Attack.png", {
      frameWidth: 192,
      frameHeight: 192,
    });

    // Enemies
    this.load.spritesheet("goblin", "/sprites/goblin/Goblin.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet("yod", "/sprites/goblin/Yod.png", {
      frameWidth: 64,
      frameHeight: 64,
    });

    // Tiles & decorations
    TILE_DEFS.forEach((tile) => {
      this.load.image(tile.name, tile.image);
    });
    DECO_DEFS.forEach((deco) => {
      this.load.image(deco.name, deco.image);
    });

    this.load.image("chest", "/sprites/rewards/chest_1.png");
    this.load.spritesheet("key", "/sprites/rewards/key_animation.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
  }

  create() {
    if (!this.mapData?.grid) {
      this.add
        .text(200, 200, "NO MAP FOUND", { color: "#fff", fontSize: "20px" })
        .setOrigin(0.5);
      return;
    }

    this.tileSize = this.mapData.tileSize || TILE_FALLBACK;
    this.mapWidth = this.mapData.grid[0]?.length ?? 0;
    this.mapHeight = this.mapData.grid.length;
    this.worldBounds.setTo(
      0,
      0,
      this.mapWidth * this.tileSize,
      this.mapHeight * this.tileSize,
    );

    this.blockers = this.physics.add.staticGroup();
    this.chests = this.physics.add.staticGroup();
    this.attacks = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.hazards.clear();

    // Solid background so player always sees something even if textures fail
    this.add
      .rectangle(
        this.worldBounds.width / 2,
        this.worldBounds.height / 2,
        this.worldBounds.width,
        this.worldBounds.height,
        0x0f1f33,
        1,
      )
      .setDepth(-5);

    this.drawTiles();
    this.createAnimations();

    // Spawn player near map center if walkable, otherwise pick a random floor
    const centerX = Math.floor(this.mapWidth / 2);
    const centerY = Math.floor(this.mapHeight / 2);
    const centerWalkable = isWalkableTile(
      this.mapData.grid?.[centerY]?.[centerX] ?? 0,
    );
    const spawn = centerWalkable
      ? new Phaser.Math.Vector2(
          centerX * this.tileSize + this.tileSize / 2,
          centerY * this.tileSize + this.tileSize / 2,
        )
      : findSpawn(this.mapData.grid, this.tileSize);
    this.playerMaxHp = this.mapData.characterHealth ?? 100;
    this.playerHp = this.playerMaxHp;
    this.player = this.physics.add
      .sprite(spawn.x, spawn.y, "player-idle", 0)
      .setDepth(5)
      .setCollideWorldBounds(true);

    // Player sprite scale (~40-45px tall)
    this.player.setScale(0.3);
    // Player hitbox size (width x height)
    this.player.setSize(this.tileSize * 2, this.tileSize * 2);
    // Offset hitbox down to cover torso/feet
    this.player.setOffset(this.tileSize * 2, this.tileSize * 2);
    this.player.play("player-idle");
    this.player.setData("facing", 1);

    this.cameras.main.setBounds(
      this.worldBounds.x,
      this.worldBounds.y,
      this.worldBounds.width,
      this.worldBounds.height,
    );
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    // Auto-zoom: show ~9 tiles across; clamp 1.3–2.2 (better for small sprite)
    const longestSide = Math.max(this.mapWidth, this.mapHeight);
    const autoZoom = Math.min(2.2, Math.max(1.3, 9 / longestSide));
    this.cameras.main.setZoom(autoZoom);
    console.log("[Voidia] camera zoom set to", autoZoom, "for map", {
      width: this.mapWidth,
      height: this.mapHeight,
    });

    this.physics.world.setBounds(
      this.worldBounds.x,
      this.worldBounds.y,
      this.worldBounds.width,
      this.worldBounds.height,
    );

    this.physics.add.collider(this.player, this.blockers);
    this.physics.add.collider(this.enemies, this.blockers);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = {
      w: this.input.keyboard.addKey("W"),
      a: this.input.keyboard.addKey("A"),
      s: this.input.keyboard.addKey("S"),
      d: this.input.keyboard.addKey("D"),
      space: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
    };

    this.createHUD();
    this.spawnChestsAndKey();
    this.spawnInitialEnemies();
    window.dispatchEvent(
      new CustomEvent("game:map-ready", {
        detail: { width: this.mapWidth, height: this.mapHeight },
      }),
    );

    const baseDifficulty = this.mapData.difficulty ?? 1;
    const PLOTCount =
      this.mapData.PLOTCount ??
      Math.max(
        1,
        Math.ceil((this.mapWidth * this.mapHeight) / (PLOT_SIZE * PLOT_SIZE)),
      );

    this.maintainer = initEnemyMaintainer({
      rpcUrl: "https://fullnode.testnet.sui.io:443",
      baseDifficulty,
      PLOTCount,
      onSpawnEnemy: (cfg) => this.spawnMaintainerEnemy(cfg),
      onDifficultyUpdate: (info) => this.handleDifficultyUpdate(info),
    });
    this.maintainer.start(10000);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      stopEnemyMaintainer();
    });
  }

  update(time: number, delta: number) {
    if (!this.player || !this.keys) return;

    const speed = 180;
    let vx = 0;
    let vy = 0;

    if (this.keys.a.isDown || this.cursors?.left?.isDown) vx -= 1;
    if (this.keys.d.isDown || this.cursors?.right?.isDown) vx += 1;
    if (this.keys.w.isDown || this.cursors?.up?.isDown) vy -= 1;
    if (this.keys.s.isDown || this.cursors?.down?.isDown) vy += 1;

    const dir = new Phaser.Math.Vector2(vx, vy);
    if (dir.lengthSq() > 0) {
      dir.normalize().scale(speed);
      this.player.setVelocity(dir.x, dir.y);
      if (dir.x !== 0) this.player.setData("facing", Math.sign(dir.x));
      this.player.setFlipX(this.player.getData("facing") < 0);
      this.player.play("player-run", true);
    } else {
      this.player.setVelocity(0, 0);
      this.player.play("player-idle", true);
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.space)) {
      this.performAttack();
    }

    this.updateEnemies(time, delta);
    this.maintainer?.updateEnemyCount(this.enemies.countActive(true));

    // Hazard check: abyss or out-of-bounds
    if (this.isPositionDangerous(this.player.x, this.player.y)) {
      this.handlePlayerDeath();
    }
  }

  private hpLabel() {
    return `HP ${this.playerHp}/${this.playerMaxHp}`;
  }

  private createHUD() {
    this.hpText = this.add
      .text(16, 16, this.hpLabel(), {
        color: "#fff",
        fontSize: "14px",
        fontFamily: "Arial, sans-serif",
      })
      .setScrollFactor(0)
      .setDepth(20);

    this.infoText = this.add
      .text(16, 36, "", {
        color: "#9ad0ff",
        fontSize: "12px",
        fontFamily: "Arial, sans-serif",
      })
      .setScrollFactor(0)
      .setDepth(20);
  }

  private createAnimations() {
    this.anims.create({
      key: "player-idle",
      frames: this.anims.generateFrameNumbers("player-idle", {
        start: 0,
        end: 7,
      }),
      frameRate: 15,
      repeat: -1,
    });
    this.anims.create({
      key: "player-run",
      frames: this.anims.generateFrameNumbers("player-run", {
        start: 0,
        end: 5,
      }),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: "player-attack",
      frames: this.anims.generateFrameNumbers("player-attack", {
        start: 0,
        end: 3,
      }),
      frameRate: 12,
    });

    this.anims.create({
      key: "goblin-idle",
      frames: this.anims.generateFrameNumbers("goblin", { start: 0, end: 6 }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: "goblin-run",
      frames: this.anims.generateFrameNumbers("goblin", { start: 7, end: 12 }),
      frameRate: 10,
      repeat: -1,
    });

    this.anims.create({
      key: "yod-idle",
      frames: this.anims.generateFrameNumbers("yod", { start: 0, end: 5 }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: "yod-run",
      frames: this.anims.generateFrameNumbers("yod", { start: 7, end: 12 }),
      frameRate: 10,
      repeat: -1,
    });

    this.anims.create({
      key: "key-spin",
      frames: this.anims.generateFrameNumbers("key", { start: 0, end: 23 }),
      frameRate: 12,
      repeat: -1,
    });
  }

  private drawTiles() {
    if (!this.mapData?.grid) {
      console.warn("[Voidia] drawTiles skipped: no grid");
      return;
    }

    let drawnTiles = 0;
    let drawnDecos = 0;
    let missingTileTextures = 0;
    let missingDecoTextures = 0;

    const rowCount = this.mapData.grid.length;
    const colCount = this.mapData.grid?.[0]?.length ?? 0;
    console.log("[Voidia] drawTiles begin", {
      rows: rowCount,
      cols: colCount,
      decoRows: this.mapData.decoGrid?.length ?? 0,
    });

    for (let y = 0; y < this.mapData.grid.length; y++) {
      for (let x = 0; x < (this.mapData.grid[y]?.length ?? 0); x++) {
        const tileId = this.mapData.grid[y]?.[x] ?? 0;
        const tileDef = getTileDef(tileId);
        if (!tileDef) continue;
        const texExists = this.textures.exists(tileDef.name);
        if (texExists) {
          this.add
            .image(
              x * this.tileSize + this.tileSize / 2,
              y * this.tileSize + this.tileSize / 2,
              tileDef.name,
            )
            .setDisplaySize(this.tileSize, this.tileSize)
            .setDepth(0);
        } else {
          missingTileTextures += 1;
          const color =
            tileDef.kind === "barrier"
              ? 0x666b7a
              : tileDef.kind === "abyss"
                ? 0x0b0b10
                : 0x2a8f6a;
          this.add
            .rectangle(
              x * this.tileSize + this.tileSize / 2,
              y * this.tileSize + this.tileSize / 2,
              this.tileSize,
              this.tileSize,
              color,
              1,
            )
            .setDepth(0);
        }

        if (tileDef.kind === "barrier") {
          const blocker = this.add
            .rectangle(
              x * this.tileSize + this.tileSize / 2,
              y * this.tileSize + this.tileSize / 2,
              this.tileSize,
              this.tileSize,
              0x000000,
              0,
            )
            .setOrigin(0.5);
          this.physics.add.existing(blocker, true);
          this.blockers.add(blocker);
        }
        if (tileDef.kind === "abyss") {
          this.hazards.add(`${x},${y}`);
        }
        drawnTiles += 1;
      }
    }

    if (this.mapData.decoGrid) {
      for (let y = 0; y < this.mapData.decoGrid.length; y++) {
        for (let x = 0; x < (this.mapData.decoGrid[y]?.length ?? 0); x++) {
          const decoId = this.mapData.decoGrid[y]?.[x] ?? 0;
          if (!decoId) continue;
          const decoDef = getDecoDef(decoId);
          if (!decoDef) continue;
          const texExists = this.textures.exists(decoDef.name);
          if (texExists) {
            this.add
              .image(
                x * this.tileSize + this.tileSize / 2,
                y * this.tileSize + this.tileSize / 2,
                decoDef.name,
              )
              .setDisplaySize(this.tileSize, this.tileSize)
              .setDepth(1);
          } else {
            missingDecoTextures += 1;
            this.add
              .rectangle(
                x * this.tileSize + this.tileSize / 2,
                y * this.tileSize + this.tileSize / 2,
                this.tileSize * 0.6,
                this.tileSize * 0.6,
                0xe0c76f,
                0.8,
              )
              .setDepth(1);
          }

          if (isDecoBlocking(decoId)) {
            const blocker = this.add
              .rectangle(
                x * this.tileSize + this.tileSize / 2,
                y * this.tileSize + this.tileSize / 2,
                this.tileSize,
                this.tileSize,
                0x000000,
                0,
              )
              .setOrigin(0.5);
            this.physics.add.existing(blocker, true);
            this.blockers.add(blocker);
          }
          drawnDecos += 1;
        }
      }
    }

    console.log(
      `[Voidia] drew ${drawnTiles} tiles and ${drawnDecos} decorations (map ${this.mapWidth}x${this.mapHeight})`,
    );
    if (missingTileTextures || missingDecoTextures) {
      console.warn(
        `[Voidia] missing textures -> tiles: ${missingTileTextures}, decorations: ${missingDecoTextures}`,
      );
    }
  }

  private isPositionDangerous(x: number, y: number) {
    const tileX = Math.floor(x / this.tileSize);
    const tileY = Math.floor(y / this.tileSize);
    if (
      tileX < 0 ||
      tileY < 0 ||
      tileX >= this.mapWidth ||
      tileY >= this.mapHeight
    ) {
      return true;
    }
    if (this.hazards.has(`${tileX},${tileY}`)) return true;
    const tileId = this.mapData?.grid[tileY]?.[tileX] ?? 0;
    if (!isTileDefined(tileId)) return true;
    return false;
  }

  private performAttack() {
    if (!this.player) return;
    this.player.play("player-attack", true);
    const facing = this.player.getData("facing") as number;
    const size = this.tileSize * 0.6; // Attack hitbox width/height baseline
    const offsetX = facing >= 0 ? size * 0.5 : -size * 0.5; // Push hitbox in front of player

    const hitbox = this.add.rectangle(
      this.player.x + offsetX,
      this.player.y,
      size, // hitbox width
      this.tileSize * 0.4, // hitbox height
      0xffffff,
      0,
    );
    this.physics.add.existing(hitbox, false);
    const body = hitbox.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);
    body.setSize(size, this.tileSize * 0.4); // Match physics body to visual hitbox
    body.enable = true;

    this.attacks.add(hitbox);

    this.physics.add.overlap(hitbox, this.enemies, (hb, enemyObj) => {
      const enemy =
        enemyObj as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
      if (!enemy.active) return;
      soundManager.play("hit-enemy");
      const hp = (enemy.getData("hp") as number) ?? 1;
      const next = hp - 1;
      enemy.setData("hp", next);
      if (next <= 0) {
        enemy.destroy();
      } else {
        const knock = facing >= 0 ? 1 : -1;
        enemy.body.velocity.x += 80 * knock;
      }
    });

    this.physics.add.overlap(hitbox, this.chests, (hb, chestObj) => {
      const chest =
        chestObj as Phaser.Types.Physics.Arcade.SpriteWithStaticBody;
      const hp = (chest.getData("hp") as number) ?? 2;
      const next = hp - 1;
      soundManager.play("hit-chest");
      chest.setData("hp", next);
      if (next <= 0) {
        const target = loadPlayTarget();
        const playState = loadPlayState();
        const hasKey = chest.getData("hasKey");
        chest.destroy();
        if (hasKey && target) {
          this.spawnKey(target, playState?.playId);
        }
      }
    });

    this.time.delayedCall(160, () => hitbox.destroy());
  }

  private spawnInitialEnemies() {
    if (!this.mapData?.grid) return;
    const baseDifficulty = this.mapData.difficulty ?? 1;
    const width = this.mapWidth;
    const height = this.mapHeight;
    const PLOTCount =
      this.mapData.PLOTCount ??
      Math.max(1, Math.ceil((width * height) / (PLOT_SIZE * PLOT_SIZE)));
    const enemiesPerPLOT = 0.3 + (baseDifficulty - 1) * 0.15;
    const initialCount = Math.max(1, Math.floor(PLOTCount * enemiesPerPLOT));

    for (let i = 0; i < initialCount; i++) {
      this.spawnEnemy({
        baseHp: 3 + baseDifficulty,
        baseDamage: 5 + baseDifficulty,
        baseSpeed: 60 + baseDifficulty * 6,
      });
    }
  }

  private spawnMaintainerEnemy(cfg: EnemyConfig) {
    this.spawnEnemy(cfg);
  }

  private spawnEnemy(cfg: EnemyConfig) {
    if (!this.mapData?.grid || !this.player) return;
    const candidates: { x: number; y: number }[] = [];
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        if (!isWalkableTile(this.mapData.grid[y]?.[x] ?? 0)) continue;
        const wx = x * this.tileSize + this.tileSize / 2;
        const wy = y * this.tileSize + this.tileSize / 2;
        const dist = Phaser.Math.Distance.Between(
          wx,
          wy,
          this.player.x,
          this.player.y,
        );
        if (dist > this.tileSize * 4) candidates.push({ x, y });
      }
    }
    if (candidates.length === 0) return;
    const spawn = Phaser.Utils.Array.GetRandom(candidates);
    const kind = Math.random() < 0.3 ? "yod" : "goblin";
    const enemy = this.enemies
      .create(
        spawn.x * this.tileSize + this.tileSize / 2,
        spawn.y * this.tileSize + this.tileSize / 2,
        kind,
        0,
      )
      .setDepth(3) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    enemy.setScale(0.65); // smaller monsters for tiny maps
    enemy.setDataEnabled();
    enemy.setData("hp", Math.max(1, Math.round(cfg.baseHp)));
    enemy.setData("damage", Math.max(1, Math.round(cfg.baseDamage)));
    enemy.setData("speed", Math.max(40, cfg.baseSpeed));
    enemy.setData("lastAttack", 0);
    enemy.setData("cooldown", 900);
    enemy.setSize(this.tileSize * 0.5, this.tileSize * 0.55); // Hitbox size (w,h)
    enemy.setOffset(this.tileSize * 0.25, this.tileSize * 0.35); // Hitbox offset to align with body
    enemy.play(kind === "yod" ? "yod-idle" : "goblin-idle");
    this.physics.add.collider(enemy, this.blockers);
  }

  private updateEnemies(time: number, delta: number) {
    if (!this.player) return;
    this.enemies.children.iterate((child) => {
      const enemy = child as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
      if (!enemy.active) return;
      const speed = enemy.getData("speed") as number;
      const damage = (enemy.getData("damage") as number) ?? 1;
      const cooldown = (enemy.getData("cooldown") as number) ?? 900;
      const last = (enemy.getData("lastAttack") as number) ?? 0;

      const dir = new Phaser.Math.Vector2(
        this.player!.x - enemy.x,
        this.player!.y - enemy.y,
      );
      const dist = dir.length();
      if (dist > 12) {
        dir.normalize();
        enemy.setVelocity(dir.x * speed, dir.y * speed);
        enemy.setFlipX(dir.x < 0);
        if (enemy.texture.key === "yod") enemy.play("yod-run", true);
        else enemy.play("goblin-run", true);
      } else {
        enemy.setVelocity(0, 0);
      }

      if (dist < this.tileSize * 0.8 && time - last > cooldown) {
        enemy.setData("lastAttack", time);
        this.damagePlayer(damage);
      }

      if (this.isPositionDangerous(enemy.x, enemy.y)) {
        enemy.destroy();
      }
    });
  }

  private damagePlayer(amount: number) {
    this.playerHp = Math.max(0, this.playerHp - amount);
    soundManager.play("hit-me");
    this.hpText?.setText(this.hpLabel());
    if (this.playerHp <= 0) {
      this.handlePlayerDeath();
    }
  }

  private handlePlayerDeath() {
    if (!this.player) return;
    if (!this.player.active) return;
    this.player.setTint(0xff3b30);
    this.player.setVelocity(0, 0);
    this.player.disableBody(true, true);
    window.dispatchEvent(new CustomEvent("game:player-dead"));
    stopEnemyMaintainer();
  }

  private spawnChestsAndKey() {
    if (!this.mapData?.grid) return;
    const playTarget = loadPlayTarget();
    const playState = loadPlayState();
    const chests = loadPlayChests();
    const keyHiddenInChest = chests.some((c) => c.hasKey);
    const worldMatch =
      !playTarget?.worldId ||
      !this.mapData.worldId ||
      playTarget.worldId === this.mapData.worldId;

    if (worldMatch && chests.length > 0 && !playTarget?.found) {
      chests.forEach((chest) => {
        if (!this.isWalkableCell(chest.x, chest.y)) return;
        const chestSprite = this.chests
          .create(
            chest.x * this.tileSize + this.tileSize / 2,
            chest.y * this.tileSize + this.tileSize / 2,
            "chest",
          )
          .setDepth(2);
        chestSprite.setDataEnabled();
        chestSprite.setData("hp", 2);
        chestSprite.setData("hasKey", chest.hasKey);
        chestSprite.refreshBody();
      });
    }

    if (
      playTarget &&
      worldMatch &&
      !playTarget.found &&
      !keyHiddenInChest &&
      Number.isFinite(playTarget.x) &&
      Number.isFinite(playTarget.y) &&
      this.isWalkableCell(playTarget.x, playTarget.y)
    ) {
      this.spawnKey(playTarget, playState?.playId);
    }
  }

  private spawnKey(target: PlayTarget, playId?: string) {
    if (this.keyObj) this.keyObj.destroy();
    this.keyObj = this.physics.add
      .sprite(
        target.x * this.tileSize + this.tileSize / 2,
        target.y * this.tileSize + this.tileSize / 2,
        "key",
      )
      .setDepth(4);
    this.keyObj.play("key-spin");
    this.keyObj.body?.setSize(this.tileSize * 0.6, this.tileSize * 0.6);
    this.physics.add.overlap(this.player!, this.keyObj, () => {
      markKeyFound(target, playId);
      this.keyObj?.destroy();
    });
  }

  private handleDifficultyUpdate(info: DifficultyInfo) {
    const alive = this.enemies.countActive(true);
    window.dispatchEvent(
      new CustomEvent("game:difficulty-update", {
        detail: { ...info, currentEnemyCount: alive },
      }),
    );
    this.infoText?.setText(
      `Difficulty ${info.baseDifficulty} ? ${info.effectiveDifficulty.toFixed(2)} | Target ${info.targetEnemyCount}`,
    );
  }

  private isWalkableCell(x: number, y: number) {
    if (!this.mapData?.grid) return false;
    if (y < 0 || y >= this.mapData.grid.length) return false;
    if (x < 0 || x >= (this.mapData.grid[y]?.length ?? 0)) return false;
    const tileId = this.mapData.grid[y]?.[x] ?? 0;
    return isWalkableTile(tileId);
  }
}

export type { GameMapData };
