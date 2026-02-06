import { v4 as uuidv4 } from "uuid";
import { CONFIG } from "../config.js";
import {
  PlayerState,
  PlayerInput,
  Vector2,
  PlayerContribution,
} from "../types/index.js";

export class Player {
  public state: PlayerState;
  public walletAddress: string;
  public contribution: PlayerContribution;

  private inputBuffer: PlayerInput[] = [];
  private lastProcessedSeq: number = 0;

  constructor(walletAddress: string, spawnPosition?: Vector2) {
    const id = uuidv4();

    this.walletAddress = walletAddress;

    this.state = {
      id,
      position: spawnPosition || this.getRandomSpawnPosition(),
      velocity: { x: 0, y: 0 },
      hp: CONFIG.PLAYER_MAX_HP,
      maxHp: CONFIG.PLAYER_MAX_HP,
      direction: { x: 0, y: 1 },
      isAttacking: false,
      lastAttackTime: 0,
      isDead: false,
      respawnTime: 0,
    };

    this.contribution = {
      playerId: id,
      damage: 0,
      healing: 0,
      deaths: 0,
      assists: 0,
    };
  }

  private getRandomSpawnPosition(): Vector2 {
    // Spawn players around the edges of the map
    const edge = Math.floor(Math.random() * 4);
    const margin = 100;

    switch (edge) {
      case 0: // Top
        return { x: Math.random() * CONFIG.MAP_WIDTH, y: margin };
      case 1: // Bottom
        return {
          x: Math.random() * CONFIG.MAP_WIDTH,
          y: CONFIG.MAP_HEIGHT - margin,
        };
      case 2: // Left
        return { x: margin, y: Math.random() * CONFIG.MAP_HEIGHT };
      case 3: // Right
        return {
          x: CONFIG.MAP_WIDTH - margin,
          y: Math.random() * CONFIG.MAP_HEIGHT,
        };
      default:
        return { x: margin, y: margin };
    }
  }

  public queueInput(input: PlayerInput): void {
    // Only accept inputs newer than last processed
    if (input.seq > this.lastProcessedSeq) {
      this.inputBuffer.push(input);

      // Keep buffer size limited
      if (this.inputBuffer.length > CONFIG.INPUT_BUFFER_SIZE) {
        this.inputBuffer.shift();
      }
    }
  }

  public processInputs(deltaTime: number): void {
    if (this.state.isDead) {
      this.state.velocity = { x: 0, y: 0 };
      return;
    }

    // Process all queued inputs
    let finalMoveDir: Vector2 = { x: 0, y: 0 };
    let shouldAttack = false;

    for (const input of this.inputBuffer) {
      finalMoveDir = input.moveDir;
      shouldAttack = shouldAttack || input.attack;
      this.lastProcessedSeq = input.seq;
    }

    this.inputBuffer = [];

    // Apply movement
    const magnitude = Math.sqrt(finalMoveDir.x ** 2 + finalMoveDir.y ** 2);
    if (magnitude > 0) {
      // Normalize and apply speed
      const normalizedDir = {
        x: finalMoveDir.x / magnitude,
        y: finalMoveDir.y / magnitude,
      };

      this.state.velocity = {
        x: normalizedDir.x * CONFIG.PLAYER_SPEED,
        y: normalizedDir.y * CONFIG.PLAYER_SPEED,
      };

      this.state.direction = normalizedDir;
    } else {
      this.state.velocity = { x: 0, y: 0 };
    }

    // Update position
    this.state.position.x += this.state.velocity.x * deltaTime;
    this.state.position.y += this.state.velocity.y * deltaTime;

    // Clamp to map bounds
    this.state.position.x = Math.max(
      0,
      Math.min(CONFIG.MAP_WIDTH, this.state.position.x),
    );
    this.state.position.y = Math.max(
      0,
      Math.min(CONFIG.MAP_HEIGHT, this.state.position.y),
    );

    // Handle attack
    this.state.isAttacking = shouldAttack;
  }

  public canAttack(currentTime: number): boolean {
    return (
      !this.state.isDead &&
      currentTime - this.state.lastAttackTime >= CONFIG.PLAYER_ATTACK_COOLDOWN
    );
  }

  public performAttack(currentTime: number): void {
    this.state.lastAttackTime = currentTime;
    this.state.isAttacking = true;
  }

  public takeDamage(damage: number): boolean {
    if (this.state.isDead) return false;

    this.state.hp = Math.max(0, this.state.hp - damage);

    if (this.state.hp <= 0) {
      this.die();
      return true; // Player died
    }

    return false;
  }

  private die(): void {
    this.state.isDead = true;
    this.state.respawnTime = Date.now() + 5000; // 5 second respawn
    this.state.velocity = { x: 0, y: 0 };
    this.contribution.deaths++;
  }

  public checkRespawn(currentTime: number): boolean {
    if (this.state.isDead && currentTime >= this.state.respawnTime) {
      this.respawn();
      return true;
    }
    return false;
  }

  private respawn(): void {
    this.state.isDead = false;
    this.state.hp = CONFIG.PLAYER_MAX_HP;
    this.state.position = this.getRandomSpawnPosition();
    this.state.velocity = { x: 0, y: 0 };
  }

  public addDamageContribution(damage: number): void {
    this.contribution.damage += damage;
  }

  public getDistance(target: Vector2): number {
    const dx = this.state.position.x - target.x;
    const dy = this.state.position.y - target.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
