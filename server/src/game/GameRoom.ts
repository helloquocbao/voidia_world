import { v4 as uuidv4 } from "uuid";
import { CONFIG } from "../config.js";
import {
  RoomState,
  RoomStatus,
  RoomStateSerialized,
  PlayerState,
  PlayerStateDelta,
  BossStateDelta,
  GameEvent,
  MatchResult,
  PlayerContribution,
  AOEZone,
} from "../types/index.js";
import { Player } from "./Player.js";
import { Boss } from "./Boss.js";
import { AOIGrid, createAOIGrid, Entity } from "./AOIGrid.js";

export class GameRoom {
  public roomId: string;
  public status: RoomStatus;
  private tick: number = 0;
  private players: Map<string, Player> = new Map();
  private boss: Boss;

  private tickInterval: NodeJS.Timeout | null = null;
  private snapshotInterval: NodeJS.Timeout | null = null;
  private lastTickTime: number = 0;

  private eventQueue: GameEvent[] = [];
  private lastPlayerStates: Map<string, PlayerState> = new Map();
  private lastBossState: string = "";

  // Area of Interest Grid for scalability
  private aoiGrid: AOIGrid;
  private useAOI: boolean = false; // Enable when player count is high

  private onSnapshot:
    | ((
        roomId: string,
        players: PlayerStateDelta[],
        boss: BossStateDelta,
        aoeZones: AOEZone[],
        tick: number,
        targetPlayers?: string[], // Optional: specific players to send to
      ) => void)
    | null = null;
  private onEvent: ((roomId: string, event: GameEvent, targetPlayers?: string[]) => void) | null = null;
  private onMatchEnd: ((result: MatchResult) => void) | null = null;

  private startedAt: number | null = null;
  private endedAt: number | null = null;
  private matchId: string;

  constructor(roomId?: string) {
    this.roomId = roomId || "room_" + uuidv4();
    this.matchId = "match_" + uuidv4();
    this.status = "waiting";
    this.boss = new Boss();
    
    // Initialize AOI Grid with 256px cells and 2-cell view distance
    this.aoiGrid = createAOIGrid({
      cellSize: 256,
      viewDistance: 2, // 5x5 grid = 1280px view radius
      maxEntitiesPerCell: 30,
    });
  }

  // Event handlers setup
  public setOnSnapshot(handler: typeof this.onSnapshot): void {
    this.onSnapshot = handler;
  }

  public setOnEvent(handler: typeof this.onEvent): void {
    this.onEvent = handler;
  }

  public setOnMatchEnd(handler: typeof this.onMatchEnd): void {
    this.onMatchEnd = handler;
  }

  // Player management
  public addPlayer(walletAddress: string): Player | null {
    if (this.players.size >= CONFIG.MAX_PLAYERS_PER_ROOM) {
      return null;
    }

    // Check if player already in room
    for (const [, player] of this.players) {
      if (player.walletAddress === walletAddress) {
        return player; // Already in room
      }
    }

    const player = new Player(walletAddress);
    this.players.set(player.state.id, player);

    // Add to AOI grid
    this.aoiGrid.addEntity({
      id: player.state.id,
      x: player.state.position.x,
      y: player.state.position.y,
      type: 'player',
    });
    this.aoiGrid.setObserver(player.state.id, player.state.position.x, player.state.position.y);

    console.log(
      `[Room ${this.roomId}] Player ${player.state.id} joined (${this.players.size}/${CONFIG.MAX_PLAYERS_PER_ROOM})`,
    );

    // Enable AOI when player count is high (> 20 players)
    if (this.players.size > 20 && !this.useAOI) {
      this.useAOI = true;
      console.log(`[Room ${this.roomId}] AOI Grid enabled (${this.players.size} players)`);
    }

    // Auto-start when minimum players reached
    if (
      this.status === "waiting" &&
      this.players.size >= CONFIG.MIN_PLAYERS_TO_START
    ) {
      this.startMatch();
    }

    return player;
  }

  public removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (player) {
      this.players.delete(playerId);
      this.lastPlayerStates.delete(playerId);
      this.aoiGrid.removeEntity(playerId);
      console.log(`[Room ${this.roomId}] Player ${playerId} left`);
    }
  }

  public getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  public getPlayerCount(): number {
    return this.players.size;
  }

  public getState(): RoomStateSerialized {
    return {
      roomId: this.roomId,
      status: this.status,
      tick: this.tick,
      players: Array.from(this.players.values()).map((p) => p.state),
      boss: this.boss.state,
      aoeZones: this.boss.getActiveAOEZones(),
    };
  }

  /**
   * Get mapping of playerId -> walletAddress for all players in room
   */
  public getPlayerWallets(): Map<string, string> {
    const wallets = new Map<string, string>();
    for (const [playerId, player] of this.players) {
      wallets.set(playerId, player.walletAddress);
    }
    return wallets;
  }

  /**
   * Get AOI Grid statistics for debugging/monitoring
   */
  public getAOIStats(): {
    enabled: boolean;
    stats: ReturnType<AOIGrid['getStats']>;
  } {
    return {
      enabled: this.useAOI,
      stats: this.aoiGrid.getStats(),
    };
  }

  // Match lifecycle
  public startMatch(): void {
    if (this.status !== "waiting") return;

    this.status = "starting";
    console.log(`[Room ${this.roomId}] Match starting in 3 seconds...`);

    // Countdown
    setTimeout(() => {
      this.status = "in_progress";
      this.startedAt = Date.now();
      this.boss.startCombat();
      this.startTickLoop();
      this.startSnapshotLoop();

      this.emitEvent({ name: "match_started" });
      console.log(`[Room ${this.roomId}] Match started!`);
    }, 3000);
  }

  private startTickLoop(): void {
    const tickMs = 1000 / CONFIG.TICK_RATE;
    this.lastTickTime = performance.now();

    this.tickInterval = setInterval(() => {
      this.gameTick();
    }, tickMs);
  }

  private startSnapshotLoop(): void {
    const snapshotMs = 1000 / CONFIG.SNAPSHOT_RATE;

    this.snapshotInterval = setInterval(() => {
      this.sendSnapshot();
    }, snapshotMs);
  }

  private gameTick(): void {
    if (this.status !== "in_progress") return;

    const now = performance.now();
    const deltaTime = (now - this.lastTickTime) / 1000; // Convert to seconds
    this.lastTickTime = now;
    this.tick++;

    const currentTime = Date.now();

    // Process player inputs and movement
    for (const [id, player] of this.players) {
      const oldPos = { ...player.state.position };
      player.processInputs(deltaTime);
      player.checkRespawn(currentTime);
      
      // Update AOI grid if position changed
      if (oldPos.x !== player.state.position.x || oldPos.y !== player.state.position.y) {
        this.aoiGrid.updateEntityPosition(id, player.state.position.x, player.state.position.y);
        this.aoiGrid.updateObserverPosition(id, player.state.position.x, player.state.position.y);
      }
    }

    // Process player attacks on boss
    this.processPlayerAttacks(currentTime);

    // Update boss AI
    this.boss.update(deltaTime, this.players, currentTime);

    // Update AOE zones
    this.boss.updateAOEZones(currentTime);

    // Check AOE damage on players
    this.processAOEDamage(currentTime);

    // Flush boss events
    const bossEvents = this.boss.flushEvents();
    for (const event of bossEvents) {
      this.emitEvent(event);
    }

    // Check if boss is dead
    if (this.boss.isDead()) {
      this.endMatch(true);
    }

    // Check if all players are dead (wipe)
    const alivePlayers = Array.from(this.players.values()).filter(
      (p) => !p.state.isDead,
    );
    if (alivePlayers.length === 0 && this.players.size > 0) {
      // Give a small grace period before calling wipe
      // This is simplified - in production, you'd have proper respawn mechanics
    }
  }

  private processPlayerAttacks(currentTime: number): void {
    for (const [, player] of this.players) {
      if (player.state.isAttacking && player.canAttack(currentTime)) {
        // Check if boss is in range
        const distance = player.getDistance(this.boss.state.position);

        if (distance <= CONFIG.PLAYER_ATTACK_RANGE + 50) {
          // 50 is approximate boss radius
          player.performAttack(currentTime);

          const damage = CONFIG.PLAYER_ATTACK_DAMAGE;
          const killed = this.boss.takeDamage(damage, player.state.id);
          player.addDamageContribution(damage);

          if (killed) {
            // Boss death event will be emitted by boss.flushEvents()
          }
        }
      }
    }
  }

  private processAOEDamage(currentTime: number): void {
    for (const [, player] of this.players) {
      if (player.state.isDead) continue;

      const aoeHit = this.boss.checkAOEDamage(player, currentTime);
      if (aoeHit && aoeHit.hit) {
        const died = player.takeDamage(aoeHit.damage);

        this.emitEvent({
          name: "player_hit",
          playerId: player.state.id,
          damage: aoeHit.damage,
          source: aoeHit.zoneId,
        });

        if (died) {
          this.emitEvent({ name: "player_died", playerId: player.state.id });
        }
      }
    }
  }

  private sendSnapshot(): void {
    if (this.status !== "in_progress" || !this.onSnapshot) return;

    if (this.useAOI) {
      // AOI-optimized snapshot: send targeted updates per observer
      this.sendAOISnapshots();
    } else {
      // Standard broadcast: send all players to everyone
      this.sendBroadcastSnapshot();
    }
  }

  /**
   * Send targeted snapshots using AOI grid (for 20+ players)
   */
  private sendAOISnapshots(): void {
    const bossDelta = this.computeBossDelta();
    const aoeZones = this.boss.getActiveAOEZones();

    for (const [observerId, observer] of this.players) {
      // Get entities visible to this observer
      const visibleEntities = this.aoiGrid.getEntitiesInView(observerId);
      const visiblePlayerIds = new Set(visibleEntities
        .filter(e => e.type === 'player')
        .map(e => e.id));
      
      // Always include self
      visiblePlayerIds.add(observerId);

      // Compute deltas only for visible players
      const playerDeltas: PlayerStateDelta[] = [];
      for (const playerId of visiblePlayerIds) {
        const player = this.players.get(playerId);
        if (player) {
          const delta = this.computePlayerDelta(playerId, player.state);
          if (delta) {
            playerDeltas.push(delta);
          }
        }
      }

      // Send personalized snapshot
      this.onSnapshot!(
        this.roomId,
        playerDeltas,
        bossDelta,
        aoeZones,
        this.tick,
        [observerId], // Target only this player
      );
    }

    // Update last states for all players
    for (const [id, player] of this.players) {
      this.lastPlayerStates.set(id, { ...player.state });
    }
  }

  /**
   * Send broadcast snapshot to all players (for small rooms)
   */
  private sendBroadcastSnapshot(): void {
    const playerDeltas: PlayerStateDelta[] = [];

    for (const [id, player] of this.players) {
      const delta = this.computePlayerDelta(id, player.state);
      if (delta) {
        playerDeltas.push(delta);
      }
      this.lastPlayerStates.set(id, { ...player.state });
    }

    const bossDelta = this.computeBossDelta();

    this.onSnapshot!(
      this.roomId,
      playerDeltas,
      bossDelta,
      this.boss.getActiveAOEZones(),
      this.tick,
    );
  }

  private computePlayerDelta(
    playerId: string,
    current: PlayerState,
  ): PlayerStateDelta | null {
    const last = this.lastPlayerStates.get(playerId);

    if (!last) {
      // New player, send full state
      return {
        id: playerId,
        position: current.position,
        velocity: current.velocity,
        hp: current.hp,
        direction: current.direction,
        isAttacking: current.isAttacking,
        isDead: current.isDead,
      };
    }

    const delta: PlayerStateDelta = { id: playerId };
    let hasChanges = false;

    if (
      last.position.x !== current.position.x ||
      last.position.y !== current.position.y
    ) {
      delta.position = current.position;
      hasChanges = true;
    }
    if (
      last.velocity.x !== current.velocity.x ||
      last.velocity.y !== current.velocity.y
    ) {
      delta.velocity = current.velocity;
      hasChanges = true;
    }
    if (last.hp !== current.hp) {
      delta.hp = current.hp;
      hasChanges = true;
    }
    if (
      last.direction.x !== current.direction.x ||
      last.direction.y !== current.direction.y
    ) {
      delta.direction = current.direction;
      hasChanges = true;
    }
    if (last.isAttacking !== current.isAttacking) {
      delta.isAttacking = current.isAttacking;
      hasChanges = true;
    }
    if (last.isDead !== current.isDead) {
      delta.isDead = current.isDead;
      hasChanges = true;
    }

    return hasChanges ? delta : null;
  }

  private computeBossDelta(): BossStateDelta {
    const current = this.boss.state;
    const currentStr = JSON.stringify({
      position: current.position,
      hp: current.hp,
      phase: current.phase,
      targetId: current.targetId,
      enrageTimer: Math.floor(current.enrageTimer / 1000), // Round to seconds
      currentSkill: current.currentSkill,
    });

    // For simplicity, always send boss state (it's just one entity)
    // In production, you'd implement proper delta for boss too
    this.lastBossState = currentStr;

    return {
      position: current.position,
      hp: current.hp,
      phase: current.phase,
      targetId: current.targetId,
      enrageTimer: current.enrageTimer,
      currentSkill: current.currentSkill,
    };
  }

  private emitEvent(event: GameEvent): void {
    if (this.onEvent) {
      this.onEvent(this.roomId, event);
    }
  }

  private endMatch(victory: boolean): void {
    if (this.status === "finished") return;

    this.status = "finished";
    this.endedAt = Date.now();

    // Stop loops
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }

    // Compute contributions
    const contributions: PlayerContribution[] = Array.from(
      this.players.values(),
    ).map((p) => ({
      ...p.contribution,
    }));

    const result: MatchResult = {
      matchId: this.matchId,
      roomId: this.roomId,
      bossId: this.boss.state.id,
      startedAt: this.startedAt!,
      endedAt: this.endedAt,
      duration: this.endedAt - this.startedAt!,
      contributions,
      isVictory: victory,
    };

    console.log(`[Room ${this.roomId}] Match ended - Victory: ${victory}`);
    console.log("Contributions:", contributions);

    // Emit boss_dead with contributions
    this.emitEvent({ name: "boss_dead", contributions });

    // Emit match ended
    this.emitEvent({ name: "match_ended", result });

    if (this.onMatchEnd) {
      this.onMatchEnd(result);
    }
  }

  public destroy(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
    }
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
    }
    this.players.clear();
  }
}
