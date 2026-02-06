import * as msgpack from "msgpack-lite";
import {
  Vector2,
  PlayerState,
  BossState,
  AOEZone,
  RoomStatus,
  RoomStateSerialized,
  PlayerStateDelta,
  BossStateDelta,
  PlayerInput,
  ClientMessage,
  ServerMessage,
  GameEvent,
  MatchResult,
  PlayerContribution,
} from "./types";

// Interpolation buffer settings
const INTERPOLATION_DELAY = 100; // ms
const MAX_BUFFER_SIZE = 20;

interface InterpolationState {
  timestamp: number;
  players: Map<string, PlayerState>;
  boss: BossState;
}

export interface GameClientConfig {
  serverUrl: string;
  walletAddress: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onRoomJoined?: (
    roomId: string,
    playerId: string,
    state: RoomStateSerialized,
  ) => void;
  onRoomLeft?: () => void;
  onPlayerJoined?: (player: PlayerState) => void;
  onPlayerLeft?: (playerId: string) => void;
  onSnapshot?: (
    players: Map<string, PlayerState>,
    boss: BossState,
    aoeZones: AOEZone[],
  ) => void;
  onEvent?: (event: GameEvent) => void;
  onMatchEnded?: (result: MatchResult) => void;
  onError?: (code: string, message: string) => void;
}

export class GameClient {
  private ws: WebSocket | null = null;
  private config: GameClientConfig;

  // Connection state
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  // Room state
  public roomId: string | null = null;
  public playerId: string | null = null;
  public roomStatus: RoomStatus = "waiting";

  // Game state
  public players: Map<string, PlayerState> = new Map();
  public boss: BossState | null = null;
  public aoeZones: AOEZone[] = [];

  // Interpolation buffer
  private stateBuffer: InterpolationState[] = [];
  private lastRenderTime = 0;

  // Input
  private inputSeq = 0;
  private pendingInputs: PlayerInput[] = [];

  // Timing
  private serverTimeOffset = 0;
  private latency = 0;
  private pingInterval: number | null = null;

  constructor(config: GameClientConfig) {
    this.config = config;
  }

  // ==================== Connection ====================

  public connect(): void {
    if (this.ws) {
      this.ws.close();
    }

    console.log(`[GameClient] Connecting to ${this.config.serverUrl}...`);

    this.ws = new WebSocket(this.config.serverUrl);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      console.log("[GameClient] Connected");
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.startPing();
      this.config.onConnect?.();
    };

    this.ws.onclose = () => {
      console.log("[GameClient] Disconnected");
      this.isConnected = false;
      this.stopPing();
      this.config.onDisconnect?.();
      this.tryReconnect();
    };

    this.ws.onerror = (error) => {
      console.error("[GameClient] Error:", error);
    };

    this.ws.onmessage = (event) => {
      try {
        const data =
          event.data instanceof ArrayBuffer
            ? new Uint8Array(event.data)
            : event.data;
        const message = this.decodeMessage(data);
        this.handleMessage(message);
      } catch (error) {
        console.error("[GameClient] Failed to decode message:", error);
      }
    };
  }

  public disconnect(): void {
    this.maxReconnectAttempts = 0; // Prevent reconnection
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.stopPing();
  }

  private tryReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log("[GameClient] Max reconnect attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    console.log(
      `[GameClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startPing(): void {
    this.pingInterval = window.setInterval(() => {
      this.sendPing();
    }, 5000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // ==================== Encoding/Decoding ====================

  private decodeMessage(data: Uint8Array | string): ServerMessage {
    if (typeof data === "string") {
      return JSON.parse(data);
    }
    return msgpack.decode(data);
  }

  private encodeMessage(message: ClientMessage): Uint8Array {
    const buffer = msgpack.encode(message);
    return new Uint8Array(buffer);
  }

  private send(message: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(this.encodeMessage(message));
    }
  }

  // ==================== Room Management ====================

  public joinRoom(roomId?: string): void {
    this.send({
      type: "join_room",
      roomId: roomId || "",
      walletAddress: this.config.walletAddress,
    });
  }

  public leaveRoom(): void {
    this.send({ type: "leave_room" });
    this.resetState();
  }

  private resetState(): void {
    this.roomId = null;
    this.playerId = null;
    this.roomStatus = "waiting";
    this.players.clear();
    this.boss = null;
    this.aoeZones = [];
    this.stateBuffer = [];
    this.pendingInputs = [];
  }

  // ==================== Input ====================

  public sendInput(moveDir: Vector2, attack: boolean): void {
    if (!this.isConnected || !this.playerId) return;

    const input: PlayerInput = {
      seq: ++this.inputSeq,
      moveDir,
      attack,
      timestamp: Date.now(),
    };

    this.pendingInputs.push(input);

    // Keep pending inputs limited
    if (this.pendingInputs.length > 30) {
      this.pendingInputs.shift();
    }

    this.send({ type: "input", input });

    // Client-side prediction: immediately apply input to local player
    this.applyInputLocally(input);
  }

  private applyInputLocally(input: PlayerInput): void {
    const localPlayer = this.players.get(this.playerId!);
    if (!localPlayer || localPlayer.isDead) return;

    // Simple prediction: update velocity based on input
    const speed = 200; // Should match server config
    const magnitude = Math.sqrt(input.moveDir.x ** 2 + input.moveDir.y ** 2);

    if (magnitude > 0) {
      localPlayer.velocity = {
        x: (input.moveDir.x / magnitude) * speed,
        y: (input.moveDir.y / magnitude) * speed,
      };
      localPlayer.direction = {
        x: input.moveDir.x / magnitude,
        y: input.moveDir.y / magnitude,
      };
    } else {
      localPlayer.velocity = { x: 0, y: 0 };
    }

    localPlayer.isAttacking = input.attack;
  }

  private sendPing(): void {
    this.send({ type: "ping", timestamp: Date.now() });
  }

  // ==================== Message Handling ====================

  private handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case "room_joined":
        this.handleRoomJoined(message);
        break;
      case "room_left":
        this.handleRoomLeft();
        break;
      case "player_joined":
        this.handlePlayerJoined(message.player);
        break;
      case "player_left":
        this.handlePlayerLeft(message.playerId);
        break;
      case "snapshot":
        this.handleSnapshot(message);
        break;
      case "event":
        this.handleEvent(message.event);
        break;
      case "pong":
        this.handlePong(message);
        break;
      case "error":
        this.handleError(message);
        break;
    }
  }

  private handleRoomJoined(message: {
    roomId: string;
    playerId: string;
    roomState: RoomStateSerialized;
  }): void {
    this.roomId = message.roomId;
    this.playerId = message.playerId;
    this.roomStatus = message.roomState.status;

    // Initialize state from room
    this.players.clear();
    for (const player of message.roomState.players) {
      this.players.set(player.id, player);
    }
    this.boss = message.roomState.boss;
    this.aoeZones = message.roomState.aoeZones;

    console.log(
      `[GameClient] Joined room ${this.roomId} as player ${this.playerId}`,
    );
    this.config.onRoomJoined?.(this.roomId, this.playerId, message.roomState);
  }

  private handleRoomLeft(): void {
    console.log("[GameClient] Left room");
    this.resetState();
    this.config.onRoomLeft?.();
  }

  private handlePlayerJoined(player: PlayerState): void {
    this.players.set(player.id, player);
    console.log(`[GameClient] Player ${player.id} joined`);
    this.config.onPlayerJoined?.(player);
  }

  private handlePlayerLeft(playerId: string): void {
    this.players.delete(playerId);
    console.log(`[GameClient] Player ${playerId} left`);
    this.config.onPlayerLeft?.(playerId);
  }

  private handleSnapshot(message: {
    tick: number;
    players: PlayerStateDelta[];
    boss: BossStateDelta;
    aoeZones: AOEZone[];
  }): void {
    // Apply deltas to current state
    for (const delta of message.players) {
      const player = this.players.get(delta.id);
      if (player) {
        // Apply delta values
        if (delta.position) player.position = delta.position;
        if (delta.velocity) player.velocity = delta.velocity;
        if (delta.hp !== undefined) player.hp = delta.hp;
        if (delta.direction) player.direction = delta.direction;
        if (delta.isAttacking !== undefined)
          player.isAttacking = delta.isAttacking;
        if (delta.isDead !== undefined) player.isDead = delta.isDead;
      }
    }

    // Apply boss delta
    if (this.boss) {
      const bossDelta = message.boss;
      if (bossDelta.position) this.boss.position = bossDelta.position;
      if (bossDelta.hp !== undefined) this.boss.hp = bossDelta.hp;
      if (bossDelta.phase) this.boss.phase = bossDelta.phase;
      if (bossDelta.targetId !== undefined)
        this.boss.targetId = bossDelta.targetId;
      if (bossDelta.enrageTimer !== undefined)
        this.boss.enrageTimer = bossDelta.enrageTimer;
      if (bossDelta.currentSkill !== undefined)
        this.boss.currentSkill = bossDelta.currentSkill;
    }

    // Update AOE zones
    this.aoeZones = message.aoeZones;

    // Server reconciliation for local player
    this.reconcileLocalPlayer(message.players);

    // Add to interpolation buffer
    this.addToBuffer();

    // Notify callback
    this.config.onSnapshot?.(this.players, this.boss!, this.aoeZones);
  }

  private reconcileLocalPlayer(deltas: PlayerStateDelta[]): void {
    if (!this.playerId) return;

    const localDelta = deltas.find((d) => d.id === this.playerId);
    if (!localDelta || !localDelta.position) return;

    const localPlayer = this.players.get(this.playerId);
    if (!localPlayer) return;

    // Check if server position differs significantly from predicted position
    const dx = localPlayer.position.x - localDelta.position.x;
    const dy = localPlayer.position.y - localDelta.position.y;
    const diff = Math.sqrt(dx * dx + dy * dy);

    // If difference is too large, snap to server position
    if (diff > 50) {
      localPlayer.position = { ...localDelta.position };
      console.log(
        `[GameClient] Reconciled position (diff: ${diff.toFixed(1)})`,
      );
    }
  }

  private addToBuffer(): void {
    const state: InterpolationState = {
      timestamp: Date.now(),
      players: new Map(this.players),
      boss: { ...this.boss! },
    };

    this.stateBuffer.push(state);

    // Keep buffer limited
    while (this.stateBuffer.length > MAX_BUFFER_SIZE) {
      this.stateBuffer.shift();
    }
  }

  private handleEvent(event: GameEvent): void {
    console.log(`[GameClient] Event: ${event.name}`, event);

    if (event.name === "match_ended") {
      this.roomStatus = "finished";
      this.config.onMatchEnded?.(event.result);
    } else if (event.name === "match_started") {
      this.roomStatus = "in_progress";
    } else if (event.name === "boss_phase_changed") {
      if (this.boss) {
        this.boss.phase = event.phase;
      }
    }

    this.config.onEvent?.(event);
  }

  private handlePong(message: {
    serverTimestamp: number;
    clientTimestamp: number;
  }): void {
    const now = Date.now();
    this.latency = (now - message.clientTimestamp) / 2;
    this.serverTimeOffset = message.serverTimestamp - now + this.latency;
  }

  private handleError(message: { code: string; message: string }): void {
    console.error(`[GameClient] Error ${message.code}: ${message.message}`);
    this.config.onError?.(message.code, message.message);
  }

  // ==================== Interpolation ====================

  /**
   * Get interpolated state for rendering
   * Call this in your game loop with current time
   */
  public getInterpolatedState(renderTime?: number): {
    players: Map<string, PlayerState>;
    boss: BossState | null;
  } {
    if (this.stateBuffer.length < 2) {
      return { players: this.players, boss: this.boss };
    }

    const targetTime = (renderTime || Date.now()) - INTERPOLATION_DELAY;

    // Find surrounding states
    let before: InterpolationState | null = null;
    let after: InterpolationState | null = null;

    for (let i = 0; i < this.stateBuffer.length - 1; i++) {
      if (
        this.stateBuffer[i].timestamp <= targetTime &&
        this.stateBuffer[i + 1].timestamp >= targetTime
      ) {
        before = this.stateBuffer[i];
        after = this.stateBuffer[i + 1];
        break;
      }
    }

    if (!before || !after) {
      // Use latest if no suitable range found
      return { players: this.players, boss: this.boss };
    }

    // Interpolation factor
    const t =
      (targetTime - before.timestamp) / (after.timestamp - before.timestamp);

    // Interpolate players
    const interpolatedPlayers = new Map<string, PlayerState>();
    for (const [id, beforePlayer] of before.players) {
      const afterPlayer = after.players.get(id);
      if (afterPlayer) {
        interpolatedPlayers.set(
          id,
          this.interpolatePlayer(beforePlayer, afterPlayer, t),
        );
      }
    }

    // Interpolate boss
    const interpolatedBoss = this.interpolateBoss(before.boss, after.boss, t);

    return { players: interpolatedPlayers, boss: interpolatedBoss };
  }

  private interpolatePlayer(
    before: PlayerState,
    after: PlayerState,
    t: number,
  ): PlayerState {
    return {
      ...after,
      position: this.lerpVector(before.position, after.position, t),
    };
  }

  private interpolateBoss(
    before: BossState,
    after: BossState,
    t: number,
  ): BossState {
    return {
      ...after,
      position: this.lerpVector(before.position, after.position, t),
    };
  }

  private lerpVector(a: Vector2, b: Vector2, t: number): Vector2 {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    };
  }

  // ==================== Getters ====================

  public getLatency(): number {
    return this.latency;
  }

  public getLocalPlayer(): PlayerState | undefined {
    return this.playerId ? this.players.get(this.playerId) : undefined;
  }

  public isInRoom(): boolean {
    return !!this.roomId;
  }

  public getConnectionState(): boolean {
    return this.isConnected;
  }
}
