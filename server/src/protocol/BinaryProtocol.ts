/**
 * Delta Compression + Binary Protocol
 * 
 * Optimized serialization for game state updates.
 * Uses compact binary format and delta compression to minimize bandwidth.
 * 
 * Target: ~50-100 bytes per player update (vs ~500 bytes with JSON)
 */

import { encode, decode } from 'msgpack-lite';
import {
  Vector2,
  PlayerState,
  PlayerStateDelta,
  BossStateDelta,
  BossPhase,
  AOEZone,
} from '../types/index.js';

// ============================================
// Message Types (1 byte header)
// ============================================

export const MESSAGE_TYPE = {
  // Client -> Server
  INPUT: 0x01,
  JOIN: 0x02,
  LEAVE: 0x03,
  PING: 0x04,
  
  // Server -> Client
  SNAPSHOT: 0x10,
  FULL_STATE: 0x11,
  EVENT: 0x12,
  PONG: 0x13,
  ERROR: 0x14,
  JOINED: 0x15,
} as const;

// ============================================
// Binary Helpers
// ============================================

/**
 * Write a float as 2 bytes (fixed point: -32768 to 32767 with 0.5 precision)
 */
function writeFloat16(value: number): [number, number] {
  const scaled = Math.round(value * 2);
  const clamped = Math.max(-32768, Math.min(32767, scaled));
  return [(clamped >> 8) & 0xFF, clamped & 0xFF];
}

/**
 * Read a float from 2 bytes
 */
function readFloat16(high: number, low: number): number {
  const value = (high << 8) | low;
  // Sign extend if negative
  const signed = value > 32767 ? value - 65536 : value;
  return signed / 2;
}

/**
 * Write position as 4 bytes (x: 2 bytes, y: 2 bytes)
 */
function writePosition(pos: Vector2): number[] {
  return [...writeFloat16(pos.x), ...writeFloat16(pos.y)];
}

/**
 * Read position from 4 bytes
 */
function readPosition(data: Uint8Array, offset: number): Vector2 {
  return {
    x: readFloat16(data[offset], data[offset + 1]),
    y: readFloat16(data[offset + 2], data[offset + 3]),
  };
}

/**
 * Write velocity as 4 bytes
 */
function writeVelocity(vel: Vector2): number[] {
  return [...writeFloat16(vel.x), ...writeFloat16(vel.y)];
}

/**
 * Read velocity from 4 bytes
 */
function readVelocity(data: Uint8Array, offset: number): Vector2 {
  return {
    x: readFloat16(data[offset], data[offset + 1]),
    y: readFloat16(data[offset + 2], data[offset + 3]),
  };
}

/**
 * Write HP as 3 bytes (max 16M HP)
 */
function writeHP(hp: number): number[] {
  return [
    (hp >> 16) & 0xFF,
    (hp >> 8) & 0xFF,
    hp & 0xFF,
  ];
}

/**
 * Read HP from 3 bytes
 */
function readHP(data: Uint8Array, offset: number): number {
  return (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
}

// ============================================
// Delta Flags (bitfield for changed fields)
// ============================================

const PLAYER_DELTA_FLAGS = {
  POSITION: 0x01,
  VELOCITY: 0x02,
  HP: 0x04,
  IS_DEAD: 0x08,
  IS_ATTACKING: 0x10,
  DIRECTION: 0x20,
  ALL: 0x3F,
};

const BOSS_DELTA_FLAGS = {
  POSITION: 0x01,
  HP: 0x02,
  PHASE: 0x04,
  TARGET: 0x08,
  SKILL: 0x10,
  ALL: 0x1F,
};

// ============================================
// Encoding Functions
// ============================================

export interface BinarySnapshot {
  tick: number;
  playerCount: number;
  players: Uint8Array; // Packed player deltas
  boss: Uint8Array;    // Packed boss delta
  aoeCount: number;
  aoes: Uint8Array;    // Packed AOE zones
}

/**
 * Encode a player delta to binary format
 * Format: [flags: 1] [id: 4] [changed fields...]
 * 
 * Min size: 5 bytes, Max size: ~20 bytes
 */
export function encodePlayerDelta(delta: PlayerStateDelta, includeId = true): Uint8Array {
  const parts: number[] = [];
  let flags = 0;

  // Determine changed fields
  if (delta.position) flags |= PLAYER_DELTA_FLAGS.POSITION;
  if (delta.velocity) flags |= PLAYER_DELTA_FLAGS.VELOCITY;
  if (delta.hp !== undefined) flags |= PLAYER_DELTA_FLAGS.HP;
  if (delta.isDead !== undefined) flags |= PLAYER_DELTA_FLAGS.IS_DEAD;
  if (delta.isAttacking !== undefined) flags |= PLAYER_DELTA_FLAGS.IS_ATTACKING;
  if (delta.direction !== undefined) flags |= PLAYER_DELTA_FLAGS.DIRECTION;

  parts.push(flags);

  // Player ID (4 bytes of UUID, truncated for bandwidth)
  if (includeId) {
    const idBytes = Buffer.from(delta.id.replace(/-/g, '').slice(0, 8), 'hex');
    parts.push(...idBytes);
  }

  // Changed fields
  if (delta.position) {
    parts.push(...writePosition(delta.position));
  }
  if (delta.velocity) {
    parts.push(...writeVelocity(delta.velocity));
  }
  if (delta.hp !== undefined) {
    parts.push(...writeHP(delta.hp));
  }
  if (delta.isDead !== undefined) {
    parts.push(delta.isDead ? 1 : 0);
  }
  if (delta.isAttacking !== undefined) {
    parts.push(delta.isAttacking ? 1 : 0);
  }
  if (delta.direction !== undefined) {
    // Direction as 4 bytes (x, y as float16)
    parts.push(...writePosition(delta.direction));
  }

  return new Uint8Array(parts);
}

/**
 * Decode a player delta from binary format
 */
export function decodePlayerDelta(data: Uint8Array, offset: number, includeId = true): {
  delta: PlayerStateDelta;
  bytesRead: number;
} {
  let pos = offset;
  const flags = data[pos++];

  let id = '';
  if (includeId) {
    // Read 4 bytes of ID
    id = Buffer.from(data.slice(pos, pos + 4)).toString('hex');
    pos += 4;
  }

  const delta: PlayerStateDelta = { id };

  if (flags & PLAYER_DELTA_FLAGS.POSITION) {
    delta.position = readPosition(data, pos);
    pos += 4;
  }
  if (flags & PLAYER_DELTA_FLAGS.VELOCITY) {
    delta.velocity = readVelocity(data, pos);
    pos += 4;
  }
  if (flags & PLAYER_DELTA_FLAGS.HP) {
    delta.hp = readHP(data, pos);
    pos += 3;
  }
  if (flags & PLAYER_DELTA_FLAGS.IS_DEAD) {
    delta.isDead = data[pos++] === 1;
  }
  if (flags & PLAYER_DELTA_FLAGS.IS_ATTACKING) {
    delta.isAttacking = data[pos++] === 1;
  }
  if (flags & PLAYER_DELTA_FLAGS.DIRECTION) {
    delta.direction = readPosition(data, pos);
    pos += 4;
  }

  return { delta, bytesRead: pos - offset };
}

// Map BossPhase to number
const PHASE_MAP: Record<BossPhase, number> = {
  idle: 0,
  combat: 1,
  enraged: 2,
  dead: 3,
};

const PHASE_REVERSE: Record<number, BossPhase> = {
  0: 'idle',
  1: 'combat',
  2: 'enraged',
  3: 'dead',
};

/**
 * Encode boss delta to binary format
 */
export function encodeBossDelta(delta: BossStateDelta): Uint8Array {
  const parts: number[] = [];
  let flags = 0;

  if (delta.position) flags |= BOSS_DELTA_FLAGS.POSITION;
  if (delta.hp !== undefined) flags |= BOSS_DELTA_FLAGS.HP;
  if (delta.phase !== undefined) flags |= BOSS_DELTA_FLAGS.PHASE;
  if (delta.targetId !== undefined) flags |= BOSS_DELTA_FLAGS.TARGET;
  if (delta.currentSkill !== undefined) flags |= BOSS_DELTA_FLAGS.SKILL;

  parts.push(flags);

  if (delta.position) {
    parts.push(...writePosition(delta.position));
  }
  if (delta.hp !== undefined) {
    parts.push(...writeHP(delta.hp));
  }
  if (delta.phase !== undefined) {
    parts.push(PHASE_MAP[delta.phase] ?? 0);
  }
  if (delta.targetId !== undefined) {
    // Encode target as 4 bytes or 0 if null
    if (delta.targetId) {
      const idBytes = Buffer.from(delta.targetId.replace(/-/g, '').slice(0, 8), 'hex');
      parts.push(...idBytes);
    } else {
      parts.push(0, 0, 0, 0);
    }
  }
  if (delta.currentSkill !== undefined) {
    if (delta.currentSkill) {
      parts.push(1); // Has cast
      // Encode cast info using msgpack (variable size)
      const castData = encode(delta.currentSkill);
      parts.push((castData.length >> 8) & 0xFF, castData.length & 0xFF);
      parts.push(...castData);
    } else {
      parts.push(0); // No cast
    }
  }

  return new Uint8Array(parts);
}

/**
 * Encode AOE zone to binary format
 */
export function encodeAOEZone(zone: AOEZone): Uint8Array {
  // Format: [shape: 1] [position: 4] [radius: 2] [damage: 2] [startAt: 4] [endAt: 4]
  const parts: number[] = [];
  
  // Shape as 1 byte (0=circle, 1=ring, 2=cone)
  const shapeMap: Record<string, number> = { circle: 0, ring: 1, cone: 2 };
  parts.push(shapeMap[zone.shape] ?? 0);
  
  // Position
  parts.push(...writePosition(zone.position));
  
  // Radius as 2 bytes (max 32767, use radius or outerRadius)
  const radius = zone.radius ?? zone.outerRadius ?? 0;
  parts.push((radius >> 8) & 0xFF, radius & 0xFF);
  
  // Damage as 2 bytes (max 65535)
  parts.push((zone.damage >> 8) & 0xFF, zone.damage & 0xFF);
  
  // StartAt timestamp as 4 bytes (relative to now)
  const relativeStart = Math.max(0, zone.startAt - Date.now());
  parts.push(
    (relativeStart >> 24) & 0xFF,
    (relativeStart >> 16) & 0xFF,
    (relativeStart >> 8) & 0xFF,
    relativeStart & 0xFF
  );
  
  // EndAt as 4 bytes (relative to now)
  const relativeEnd = Math.max(0, zone.endAt - Date.now());
  parts.push(
    (relativeEnd >> 24) & 0xFF,
    (relativeEnd >> 16) & 0xFF,
    (relativeEnd >> 8) & 0xFF,
    relativeEnd & 0xFF
  );

  return new Uint8Array(parts);
}

// ============================================
// Full Message Encoding
// ============================================

export interface SnapshotMessage {
  type: typeof MESSAGE_TYPE.SNAPSHOT;
  tick: number;
  players: PlayerStateDelta[];
  boss: BossStateDelta;
  aoes: AOEZone[];
}

/**
 * Encode full snapshot message to binary
 */
export function encodeSnapshot(msg: SnapshotMessage): Uint8Array {
  const parts: number[] = [];
  
  // Message type
  parts.push(MESSAGE_TYPE.SNAPSHOT);
  
  // Tick as 4 bytes
  parts.push(
    (msg.tick >> 24) & 0xFF,
    (msg.tick >> 16) & 0xFF,
    (msg.tick >> 8) & 0xFF,
    msg.tick & 0xFF
  );
  
  // Player count as 1 byte (max 255)
  parts.push(msg.players.length);
  
  // Encode each player
  for (const player of msg.players) {
    const encoded = encodePlayerDelta(player);
    parts.push(...encoded);
  }
  
  // Boss data
  const bossEncoded = encodeBossDelta(msg.boss);
  parts.push(...bossEncoded);
  
  // AOE count as 1 byte
  parts.push(msg.aoes.length);
  
  // Encode each AOE
  for (const aoe of msg.aoes) {
    const encoded = encodeAOEZone(aoe);
    parts.push(...encoded);
  }

  return new Uint8Array(parts);
}

/**
 * Encode input message from client
 */
export function encodeInput(input: {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  attack: boolean;
  seq: number;
}): Uint8Array {
  // Format: [type: 1] [flags: 1] [seq: 2]
  let flags = 0;
  if (input.up) flags |= 0x01;
  if (input.down) flags |= 0x02;
  if (input.left) flags |= 0x04;
  if (input.right) flags |= 0x08;
  if (input.attack) flags |= 0x10;

  return new Uint8Array([
    MESSAGE_TYPE.INPUT,
    flags,
    (input.seq >> 8) & 0xFF,
    input.seq & 0xFF,
  ]);
}

/**
 * Decode input message from binary
 */
export function decodeInput(data: Uint8Array): {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  attack: boolean;
  seq: number;
} | null {
  if (data[0] !== MESSAGE_TYPE.INPUT || data.length < 4) return null;
  
  const flags = data[1];
  const seq = (data[2] << 8) | data[3];

  return {
    up: (flags & 0x01) !== 0,
    down: (flags & 0x02) !== 0,
    left: (flags & 0x04) !== 0,
    right: (flags & 0x08) !== 0,
    attack: (flags & 0x10) !== 0,
    seq,
  };
}

// ============================================
// Compression Statistics
// ============================================

export function getCompressionStats(
  original: { players: PlayerStateDelta[]; boss: BossStateDelta; aoes: AOEZone[] },
  compressed: Uint8Array
): {
  originalJsonSize: number;
  compressedSize: number;
  compressionRatio: number;
  bytesPerPlayer: number;
} {
  const originalJson = JSON.stringify(original);
  const originalSize = Buffer.byteLength(originalJson, 'utf-8');
  
  return {
    originalJsonSize: originalSize,
    compressedSize: compressed.length,
    compressionRatio: originalSize / compressed.length,
    bytesPerPlayer: original.players.length > 0 
      ? compressed.length / original.players.length 
      : 0,
  };
}

// ============================================
// Hybrid Encoding (msgpack fallback for complex data)
// ============================================

/**
 * Create a hybrid encoder that uses binary for hot paths
 * and msgpack for complex/rare data
 */
export class HybridEncoder {
  private useBinary: boolean;

  constructor(useBinary = true) {
    this.useBinary = useBinary;
  }

  /**
   * Encode snapshot - uses binary when possible
   */
  encodeSnapshot(msg: SnapshotMessage): Uint8Array {
    if (this.useBinary) {
      return encodeSnapshot(msg);
    }
    // Fallback to msgpack
    return encode({ t: MESSAGE_TYPE.SNAPSHOT, ...msg });
  }

  /**
   * Encode generic message using msgpack
   */
  encodeMessage(type: number, data: unknown): Uint8Array {
    return encode({ t: type, d: data });
  }

  /**
   * Decode any message
   */
  decodeMessage(data: Uint8Array): { type: number; data: unknown } | null {
    if (data.length === 0) return null;

    const type = data[0];

    // Binary protocol messages
    if (type === MESSAGE_TYPE.INPUT) {
      return { type, data: decodeInput(data) };
    }

    // Msgpack fallback
    try {
      const decoded = decode(data) as { t: number; d?: unknown; [key: string]: unknown };
      return { type: decoded.t, data: decoded.d || decoded };
    } catch {
      return null;
    }
  }
}

export const encoder = new HybridEncoder();
