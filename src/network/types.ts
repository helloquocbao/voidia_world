// Types for client-side game networking
// Mirrors server types but adapted for client

export interface Vector2 {
  x: number;
  y: number;
}

export interface PlayerState {
  id: string;
  position: Vector2;
  velocity: Vector2;
  hp: number;
  maxHp: number;
  direction: Vector2;
  isAttacking: boolean;
  isDead: boolean;
}

export type BossPhase = "idle" | "combat" | "enraged" | "dead";

export interface BossState {
  id: string;
  position: Vector2;
  velocity: Vector2;
  hp: number;
  maxHp: number;
  phase: BossPhase;
  targetId: string | null;
  enrageTimer: number;
  currentSkill: BossSkillCast | null;
}

export interface BossSkillCast {
  skillId: string;
  castStartAt: number;
  castEndAt: number;
  targetPosition: Vector2;
}

export interface AOEZone {
  id: string;
  skillId: string;
  shape: "circle" | "ring" | "cone";
  position: Vector2;
  radius?: number;
  innerRadius?: number;
  outerRadius?: number;
  startAt: number;
  endAt: number;
  damage: number;
}

export type RoomStatus = "waiting" | "starting" | "in_progress" | "finished";

export interface RoomStateSerialized {
  roomId: string;
  status: RoomStatus;
  tick: number;
  players: PlayerState[];
  boss: BossState;
  aoeZones: AOEZone[];
}

export interface PlayerStateDelta {
  id: string;
  position?: Vector2;
  velocity?: Vector2;
  hp?: number;
  direction?: Vector2;
  isAttacking?: boolean;
  isDead?: boolean;
}

export interface BossStateDelta {
  position?: Vector2;
  hp?: number;
  phase?: BossPhase;
  targetId?: string | null;
  enrageTimer?: number;
  currentSkill?: BossSkillCast | null;
}

export interface PlayerContribution {
  playerId: string;
  damage: number;
  healing: number;
  deaths: number;
  assists: number;
}

export interface MatchResult {
  matchId: string;
  roomId: string;
  bossId: string;
  startedAt: number;
  endedAt: number;
  duration: number;
  contributions: PlayerContribution[];
  isVictory: boolean;
}

// Game Events
export type GameEvent =
  | {
      name: "boss_cast_started";
      skillId: string;
      targetPosition: Vector2;
      castEndAt: number;
    }
  | { name: "boss_cast_cancelled" }
  | { name: "boss_phase_changed"; phase: BossPhase }
  | { name: "boss_dead"; contributions: PlayerContribution[] }
  | { name: "player_hit"; playerId: string; damage: number; source: string }
  | { name: "player_died"; playerId: string }
  | { name: "player_respawned"; playerId: string }
  | { name: "aoe_spawned"; zone: AOEZone }
  | { name: "aoe_expired"; zoneId: string }
  | { name: "match_started" }
  | { name: "match_ended"; result: MatchResult }
  | { name: "reward_ready"; matchId: string; playerId: string };

// Client → Server messages
export type ClientMessage =
  | { type: "join_room"; roomId: string; walletAddress: string }
  | { type: "leave_room" }
  | { type: "input"; input: PlayerInput }
  | { type: "ping"; timestamp: number };

// Server → Client messages
export type ServerMessage =
  | {
      type: "room_joined";
      roomId: string;
      playerId: string;
      roomState: RoomStateSerialized;
    }
  | { type: "room_left" }
  | { type: "player_joined"; player: PlayerState }
  | { type: "player_left"; playerId: string }
  | {
      type: "snapshot";
      tick: number;
      players: PlayerStateDelta[];
      boss: BossStateDelta;
      aoeZones: AOEZone[];
    }
  | { type: "event"; event: GameEvent }
  | { type: "pong"; serverTimestamp: number; clientTimestamp: number }
  | { type: "error"; code: string; message: string };

export interface PlayerInput {
  seq: number;
  moveDir: Vector2;
  attack: boolean;
  timestamp: number;
}
