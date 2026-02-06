import Phaser from "phaser";
import {
  GameClient,
  PlayerState,
  BossState,
  AOEZone,
  GameEvent,
  Vector2,
  MatchResult,
} from "../network";

const MAP_WIDTH = 2000;
const MAP_HEIGHT = 2000;
const PLAYER_SIZE = 32;
const BOSS_SIZE = 64;

interface PlayerSprite {
  sprite: Phaser.GameObjects.Rectangle;
  hpBar: Phaser.GameObjects.Rectangle;
  hpBarBg: Phaser.GameObjects.Rectangle;
  nameText: Phaser.GameObjects.Text;
}

export class BossFightScene extends Phaser.Scene {
  private gameClient: GameClient | null = null;
  private walletAddress: string = "";
  private serverUrl: string = "ws://localhost:3001/ws";

  // Graphics
  private playerSprites: Map<string, PlayerSprite> = new Map();
  private bossSprite: Phaser.GameObjects.Rectangle | null = null;
  private bossHpBar: Phaser.GameObjects.Rectangle | null = null;
  private bossHpBarBg: Phaser.GameObjects.Rectangle | null = null;
  private bossHpText: Phaser.GameObjects.Text | null = null;
  private aoeGraphics: Phaser.GameObjects.Graphics | null = null;
  private castBarBg: Phaser.GameObjects.Rectangle | null = null;
  private castBar: Phaser.GameObjects.Rectangle | null = null;

  // UI
  private statusText: Phaser.GameObjects.Text | null = null;
  private latencyText: Phaser.GameObjects.Text | null = null;
  private roomText: Phaser.GameObjects.Text | null = null;
  private playerCountText: Phaser.GameObjects.Text | null = null;
  private eventLog: Phaser.GameObjects.Text | null = null;
  private eventLogMessages: string[] = [];

  // Input
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private attackKey: Phaser.Input.Keyboard.Key | null = null;

  // Camera
  private cameraTarget: Phaser.GameObjects.Rectangle | null = null;

  constructor() {
    super({ key: "BossFightScene" });
  }

  init(data: { walletAddress?: string; serverUrl?: string }) {
    this.walletAddress = data.walletAddress || `test_player_${Date.now()}`;
    if (data.serverUrl) {
      this.serverUrl = data.serverUrl;
    }
  }

  create() {
    // Setup world bounds
    this.physics.world.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Draw background grid
    this.drawBackground();

    // Setup graphics for AOE
    this.aoeGraphics = this.add.graphics();

    // Setup UI
    this.createUI();

    // Setup input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.attackKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );

    // Create camera target (invisible)
    this.cameraTarget = this.add.rectangle(
      MAP_WIDTH / 2,
      MAP_HEIGHT / 2,
      1,
      1,
      0x000000,
      0,
    );
    this.cameras.main.startFollow(this.cameraTarget, true, 0.1, 0.1);
    this.cameras.main.setZoom(1);

    // Initialize game client
    this.initGameClient();

    // Add instructions
    this.addInstructions();
  }

  private drawBackground() {
    const gridSize = 100;
    const graphics = this.add.graphics();

    // Background color
    graphics.fillStyle(0x1a2a3a, 1);
    graphics.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Grid lines
    graphics.lineStyle(1, 0x2a3a4a, 0.5);

    for (let x = 0; x <= MAP_WIDTH; x += gridSize) {
      graphics.lineBetween(x, 0, x, MAP_HEIGHT);
    }
    for (let y = 0; y <= MAP_HEIGHT; y += gridSize) {
      graphics.lineBetween(0, y, MAP_WIDTH, y);
    }

    // Boss area (center)
    graphics.lineStyle(3, 0xff6600, 0.5);
    graphics.strokeCircle(MAP_WIDTH / 2, MAP_HEIGHT / 2, 300);

    // Spawn areas (corners)
    graphics.lineStyle(2, 0x00ff00, 0.3);
    graphics.strokeRect(50, 50, 200, 200);
    graphics.strokeRect(MAP_WIDTH - 250, 50, 200, 200);
    graphics.strokeRect(50, MAP_HEIGHT - 250, 200, 200);
    graphics.strokeRect(MAP_WIDTH - 250, MAP_HEIGHT - 250, 200, 200);
  }

  private createUI() {
    const style = {
      fontSize: "16px",
      color: "#ffffff",
      backgroundColor: "#00000088",
      padding: { x: 8, y: 4 },
    };

    // Status
    this.statusText = this.add
      .text(16, 16, "Connecting...", style)
      .setScrollFactor(0)
      .setDepth(100);

    // Latency
    this.latencyText = this.add
      .text(16, 48, "Latency: --", style)
      .setScrollFactor(0)
      .setDepth(100);

    // Room info
    this.roomText = this.add
      .text(16, 80, "Room: --", style)
      .setScrollFactor(0)
      .setDepth(100);

    // Player count
    this.playerCountText = this.add
      .text(16, 112, "Players: 0", style)
      .setScrollFactor(0)
      .setDepth(100);

    // Event log (bottom left)
    this.eventLog = this.add
      .text(16, this.cameras.main.height - 150, "", {
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#00000088",
        padding: { x: 8, y: 4 },
        wordWrap: { width: 300 },
      })
      .setScrollFactor(0)
      .setDepth(100);

    // Boss cast bar (top center)
    const barWidth = 200;
    const barHeight = 20;
    const barX = this.cameras.main.width / 2 - barWidth / 2;

    this.castBarBg = this.add
      .rectangle(barX + barWidth / 2, 60, barWidth, barHeight, 0x333333)
      .setScrollFactor(0)
      .setDepth(100)
      .setVisible(false);

    this.castBar = this.add
      .rectangle(barX + barWidth / 2, 60, 0, barHeight - 4, 0xff6600)
      .setScrollFactor(0)
      .setDepth(101)
      .setVisible(false);
  }

  private addInstructions() {
    const instructions = [
      "Controls:",
      "  Arrow Keys - Move",
      "  Space - Attack",
      "",
      "Kill the Boss!",
    ].join("\n");

    this.add
      .text(this.cameras.main.width - 16, 16, instructions, {
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#00000088",
        padding: { x: 8, y: 4 },
        align: "right",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);
  }

  private initGameClient() {
    this.gameClient = new GameClient({
      serverUrl: this.serverUrl,
      walletAddress: this.walletAddress,

      onConnect: () => {
        this.statusText?.setText("Connected! Joining room...");
        this.gameClient?.joinRoom();
      },

      onDisconnect: () => {
        this.statusText?.setText("Disconnected");
        this.logEvent("Disconnected from server");
      },

      onRoomJoined: (roomId, playerId, state) => {
        this.statusText?.setText(
          `Room: ${roomId.slice(0, 8)}... | Status: ${state.status}`,
        );
        this.roomText?.setText(`Room: ${roomId.slice(0, 8)}...`);
        this.logEvent(`Joined room as ${playerId.slice(0, 8)}...`);

        // Initialize boss sprite
        this.createBossSprite(state.boss);

        // Initialize player sprites
        for (const player of state.players) {
          this.createPlayerSprite(player);
        }

        // Center camera on boss
        this.cameraTarget?.setPosition(
          state.boss.position.x,
          state.boss.position.y,
        );
      },

      onPlayerJoined: (player) => {
        this.createPlayerSprite(player);
        this.logEvent(`Player joined: ${player.id.slice(0, 8)}...`);
      },

      onPlayerLeft: (playerId) => {
        this.removePlayerSprite(playerId);
        this.logEvent(`Player left: ${playerId.slice(0, 8)}...`);
      },

      onSnapshot: (players, boss, aoeZones) => {
        this.updatePlayerCount(players.size);
      },

      onEvent: (event) => {
        this.handleGameEvent(event);
      },

      onMatchEnded: (result) => {
        this.handleMatchEnded(result);
      },

      onError: (code, message) => {
        this.logEvent(`Error: ${message}`);
      },
    });

    this.gameClient.connect();
  }

  private createPlayerSprite(player: PlayerState): PlayerSprite {
    const isLocal = player.id === this.gameClient?.playerId;
    const color = isLocal ? 0x00ff00 : 0x3399ff;

    const sprite = this.add
      .rectangle(
        player.position.x,
        player.position.y,
        PLAYER_SIZE,
        PLAYER_SIZE,
        color,
      )
      .setDepth(10);

    // HP bar background
    const hpBarBg = this.add
      .rectangle(
        player.position.x,
        player.position.y - PLAYER_SIZE / 2 - 10,
        PLAYER_SIZE + 8,
        6,
        0x333333,
      )
      .setDepth(11);

    // HP bar
    const hpBar = this.add
      .rectangle(
        player.position.x,
        player.position.y - PLAYER_SIZE / 2 - 10,
        PLAYER_SIZE + 8,
        4,
        isLocal ? 0x00ff00 : 0x3399ff,
      )
      .setDepth(12);

    // Name
    const nameText = this.add
      .text(
        player.position.x,
        player.position.y - PLAYER_SIZE / 2 - 20,
        isLocal ? "YOU" : player.id.slice(0, 6),
        {
          fontSize: "12px",
          color: isLocal ? "#00ff00" : "#3399ff",
          align: "center",
        },
      )
      .setOrigin(0.5)
      .setDepth(13);

    const playerSprite: PlayerSprite = { sprite, hpBar, hpBarBg, nameText };
    this.playerSprites.set(player.id, playerSprite);

    return playerSprite;
  }

  private removePlayerSprite(playerId: string) {
    const sprites = this.playerSprites.get(playerId);
    if (sprites) {
      sprites.sprite.destroy();
      sprites.hpBar.destroy();
      sprites.hpBarBg.destroy();
      sprites.nameText.destroy();
      this.playerSprites.delete(playerId);
    }
  }

  private createBossSprite(boss: BossState) {
    // Boss body
    this.bossSprite = this.add
      .rectangle(
        boss.position.x,
        boss.position.y,
        BOSS_SIZE,
        BOSS_SIZE,
        0xff3333,
      )
      .setDepth(5);

    // Boss HP bar (at top of screen)
    const barWidth = 400;
    const barX = this.cameras.main.width / 2;

    this.bossHpBarBg = this.add
      .rectangle(barX, 30, barWidth, 24, 0x333333)
      .setScrollFactor(0)
      .setDepth(100);

    this.bossHpBar = this.add
      .rectangle(barX, 30, barWidth - 4, 20, 0xff3333)
      .setScrollFactor(0)
      .setDepth(101);

    this.bossHpText = this.add
      .text(barX, 30, `BOSS: ${boss.hp}/${boss.maxHp}`, {
        fontSize: "14px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(102);
  }

  private handleGameEvent(event: GameEvent) {
    switch (event.name) {
      case "match_started":
        this.logEvent("⚔️ MATCH STARTED!");
        this.statusText?.setText("FIGHT!");
        break;

      case "boss_cast_started":
        this.logEvent(`Boss casting: ${event.skillId}`);
        this.showCastBar(true);
        break;

      case "boss_phase_changed":
        this.logEvent(`Boss phase: ${event.phase}`);
        if (event.phase === "enraged") {
          this.bossSprite?.setFillStyle(0xff0000);
          this.logEvent("🔥 BOSS ENRAGED!");
        }
        break;

      case "player_hit":
        if (event.playerId === this.gameClient?.playerId) {
          this.logEvent(`💥 You took ${event.damage} damage!`);
          this.cameras.main.shake(100, 0.01);
        }
        break;

      case "player_died":
        if (event.playerId === this.gameClient?.playerId) {
          this.logEvent("💀 You died! Respawning...");
        }
        break;

      case "aoe_spawned":
        this.logEvent(`AOE: ${event.zone.skillId}`);
        break;

      case "boss_dead":
        this.logEvent("🎉 BOSS DEFEATED!");
        break;
    }
  }

  private handleMatchEnded(result: MatchResult) {
    const isVictory = result.isVictory;
    const message = isVictory ? "🎉 VICTORY!" : "💀 DEFEATED";

    // Emit custom event for React to handle
    const myContrib = result.contributions.find(
      (c) => c.playerId === this.gameClient?.playerId,
    );

    window.dispatchEvent(
      new CustomEvent("boss-fight-match-end", {
        detail: {
          result,
          myDamage: myContrib?.damage || 0,
          myScore: myContrib?.damage || 0, // Using damage as score for now
        },
      }),
    );

    // Show result
    const overlay = this.add
      .rectangle(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2,
        this.cameras.main.width,
        this.cameras.main.height,
        0x000000,
        0.7,
      )
      .setScrollFactor(0)
      .setDepth(200);

    const resultText = this.add
      .text(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2 - 50,
        message,
        {
          fontSize: "48px",
          color: isVictory ? "#00ff00" : "#ff0000",
          fontStyle: "bold",
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(201);

    // Show contributions
    if (myContrib) {
      this.add
        .text(
          this.cameras.main.width / 2,
          this.cameras.main.height / 2 + 20,
          `Your Damage: ${myContrib.damage} | Deaths: ${myContrib.deaths}`,
          { fontSize: "24px", color: "#ffffff" },
        )
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(201);
    }

    // Duration
    this.add
      .text(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2 + 60,
        `Duration: ${(result.duration / 1000).toFixed(1)}s`,
        { fontSize: "18px", color: "#aaaaaa" },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(201);

    // Reward hint
    this.add
      .text(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2 + 100,
        "🎁 Rewards ready! Check the claim button.",
        { fontSize: "16px", color: "#00ff88" },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(201);
  }

  private showCastBar(show: boolean) {
    this.castBarBg?.setVisible(show);
    this.castBar?.setVisible(show);
  }

  private logEvent(message: string) {
    this.eventLogMessages.push(message);
    if (this.eventLogMessages.length > 6) {
      this.eventLogMessages.shift();
    }
    this.eventLog?.setText(this.eventLogMessages.join("\n"));
  }

  private updatePlayerCount(count: number) {
    this.playerCountText?.setText(`Players: ${count}`);
  }

  update(time: number, delta: number) {
    if (!this.gameClient || !this.gameClient.isInRoom()) return;

    // Process input
    this.processInput();

    // Get interpolated state
    const { players, boss } = this.gameClient.getInterpolatedState();

    // Update player sprites
    this.updatePlayerSprites(players);

    // Update boss sprite
    if (boss) {
      this.updateBossSprite(boss);
    }

    // Update AOE zones
    this.updateAOEZones();

    // Update UI
    this.updateUI();

    // Update camera to follow local player
    const localPlayer = this.gameClient.getLocalPlayer();
    if (localPlayer) {
      this.cameraTarget?.setPosition(
        localPlayer.position.x,
        localPlayer.position.y,
      );
    }
  }

  private processInput() {
    if (!this.cursors) return;

    let moveDir: Vector2 = { x: 0, y: 0 };

    if (this.cursors.left.isDown) moveDir.x -= 1;
    if (this.cursors.right.isDown) moveDir.x += 1;
    if (this.cursors.up.isDown) moveDir.y -= 1;
    if (this.cursors.down.isDown) moveDir.y += 1;

    const attack = this.attackKey?.isDown || false;

    this.gameClient?.sendInput(moveDir, attack);
  }

  private updatePlayerSprites(players: Map<string, PlayerState>) {
    for (const [id, player] of players) {
      let sprites = this.playerSprites.get(id);

      if (!sprites) {
        sprites = this.createPlayerSprite(player);
      }

      // Update position
      sprites.sprite.setPosition(player.position.x, player.position.y);
      sprites.hpBarBg.setPosition(
        player.position.x,
        player.position.y - PLAYER_SIZE / 2 - 10,
      );
      sprites.hpBar.setPosition(
        player.position.x,
        player.position.y - PLAYER_SIZE / 2 - 10,
      );
      sprites.nameText.setPosition(
        player.position.x,
        player.position.y - PLAYER_SIZE / 2 - 20,
      );

      // Update HP bar width
      const hpPercent = player.hp / player.maxHp;
      sprites.hpBar.setScale(hpPercent, 1);

      // Update visibility based on death
      const alpha = player.isDead ? 0.3 : 1;
      sprites.sprite.setAlpha(alpha);
      sprites.hpBar.setAlpha(alpha);
      sprites.hpBarBg.setAlpha(alpha);
      sprites.nameText.setAlpha(alpha);

      // Flash on attack
      if (player.isAttacking) {
        sprites.sprite.setFillStyle(0xffffff);
      } else {
        const isLocal = id === this.gameClient?.playerId;
        sprites.sprite.setFillStyle(isLocal ? 0x00ff00 : 0x3399ff);
      }
    }

    // Remove sprites for players no longer in the map
    for (const [id] of this.playerSprites) {
      if (!players.has(id)) {
        this.removePlayerSprite(id);
      }
    }
  }

  private updateBossSprite(boss: BossState) {
    if (!this.bossSprite) return;

    // Update position
    this.bossSprite.setPosition(boss.position.x, boss.position.y);

    // Update HP bar
    if (this.bossHpBar && this.bossHpText) {
      const hpPercent = boss.hp / boss.maxHp;
      this.bossHpBar.setScale(hpPercent, 1);
      this.bossHpText.setText(`BOSS: ${boss.hp}/${boss.maxHp}`);

      // Color based on HP
      if (hpPercent < 0.3) {
        this.bossHpBar.setFillStyle(0xff0000);
      } else if (hpPercent < 0.6) {
        this.bossHpBar.setFillStyle(0xff6600);
      } else {
        this.bossHpBar.setFillStyle(0xff3333);
      }
    }

    // Update cast bar
    if (boss.currentSkill) {
      this.showCastBar(true);
      const now = Date.now();
      const progress =
        (now - boss.currentSkill.castStartAt) /
        (boss.currentSkill.castEndAt - boss.currentSkill.castStartAt);
      const barWidth = 196;
      this.castBar?.setSize(Math.min(barWidth * progress, barWidth), 16);
    } else {
      this.showCastBar(false);
    }

    // Death state
    if (boss.phase === "dead") {
      this.bossSprite.setFillStyle(0x333333);
      this.bossSprite.setAlpha(0.5);
    }
  }

  private updateAOEZones() {
    if (!this.aoeGraphics) return;

    this.aoeGraphics.clear();

    const zones = this.gameClient?.aoeZones || [];
    const now = Date.now();

    for (const zone of zones) {
      const progress = (now - zone.startAt) / (zone.endAt - zone.startAt);
      const alpha = Math.max(0.2, 0.6 - progress * 0.4);

      if (zone.shape === "circle") {
        // Draw circle AOE
        this.aoeGraphics.fillStyle(0xff0000, alpha);
        this.aoeGraphics.fillCircle(
          zone.position.x,
          zone.position.y,
          zone.radius || 100,
        );
        this.aoeGraphics.lineStyle(2, 0xff0000, alpha + 0.2);
        this.aoeGraphics.strokeCircle(
          zone.position.x,
          zone.position.y,
          zone.radius || 100,
        );
      } else if (zone.shape === "ring") {
        // Draw ring AOE
        this.aoeGraphics.lineStyle(
          zone.outerRadius! - zone.innerRadius!,
          0xff6600,
          alpha,
        );
        this.aoeGraphics.strokeCircle(
          zone.position.x,
          zone.position.y,
          (zone.innerRadius! + zone.outerRadius!) / 2,
        );
      }
    }
  }

  private updateUI() {
    // Update latency
    const latency = this.gameClient?.getLatency() || 0;
    this.latencyText?.setText(`Latency: ${latency.toFixed(0)}ms`);

    // Update status
    if (this.gameClient?.roomStatus) {
      this.statusText?.setText(`Status: ${this.gameClient.roomStatus}`);
    }
  }

  shutdown() {
    this.gameClient?.disconnect();
    this.playerSprites.clear();
  }
}
