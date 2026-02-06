import { v4 as uuidv4 } from "uuid";
import { CONFIG } from "../config.js";
import {
  BossState,
  BossPhase,
  BossSkillCast,
  AOEZone,
  Vector2,
  GameEvent,
} from "../types/index.js";
import { Player } from "./Player.js";

export class Boss {
  public state: BossState;

  private skill1LastUsed: number = 0;
  private skill2LastUsed: number = 0;
  private pendingEvents: GameEvent[] = [];
  private activeAOEZones: AOEZone[] = [];

  constructor() {
    this.state = {
      id: "boss_" + uuidv4(),
      position: { ...CONFIG.BOSS_POSITION },
      velocity: { x: 0, y: 0 },
      hp: CONFIG.BOSS_MAX_HP,
      maxHp: CONFIG.BOSS_MAX_HP,
      phase: "idle",
      targetId: null,
      enrageTimer: CONFIG.BOSS_ENRAGE_TIME,
      currentSkill: null,
    };
  }

  public reset(): void {
    this.state.hp = CONFIG.BOSS_MAX_HP;
    this.state.position = { ...CONFIG.BOSS_POSITION };
    this.state.velocity = { x: 0, y: 0 };
    this.state.phase = "idle";
    this.state.targetId = null;
    this.state.enrageTimer = CONFIG.BOSS_ENRAGE_TIME;
    this.state.currentSkill = null;
    this.skill1LastUsed = 0;
    this.skill2LastUsed = 0;
    this.activeAOEZones = [];
    this.pendingEvents = [];
  }

  public startCombat(): void {
    if (this.state.phase === "idle") {
      this.state.phase = "combat";
      this.pendingEvents.push({ name: "boss_phase_changed", phase: "combat" });
    }
  }

  public update(
    deltaTime: number,
    players: Map<string, Player>,
    currentTime: number,
  ): void {
    if (this.state.phase === "dead" || this.state.phase === "idle") {
      return;
    }

    // Update enrage timer
    this.state.enrageTimer -= deltaTime * 1000;
    if (this.state.enrageTimer <= 0 && this.state.phase !== "enraged") {
      this.state.phase = "enraged";
      this.pendingEvents.push({ name: "boss_phase_changed", phase: "enraged" });
    }

    // Get alive players
    const alivePlayers = Array.from(players.values()).filter(
      (p) => !p.state.isDead,
    );
    if (alivePlayers.length === 0) {
      this.state.targetId = null;
      this.state.velocity = { x: 0, y: 0 };
      return;
    }

    // Find closest player as target
    let closestPlayer: Player | null = null;
    let closestDistance = Infinity;

    for (const player of alivePlayers) {
      const dist = this.getDistance(player.state.position);
      if (dist < closestDistance) {
        closestDistance = dist;
        closestPlayer = player;
      }
    }

    if (closestPlayer) {
      this.state.targetId = closestPlayer.state.id;
    }

    // Handle current skill cast
    if (this.state.currentSkill) {
      if (currentTime >= this.state.currentSkill.castEndAt) {
        // Skill cast completed - execute skill
        this.executeSkill(this.state.currentSkill, currentTime);
        this.state.currentSkill = null;
      }
      return; // Don't move while casting
    }

    // Try to use skills
    if (this.tryUseSkill(currentTime, alivePlayers)) {
      return;
    }

    // Move towards target
    if (closestPlayer && closestDistance > 100) {
      const dir = this.getDirectionTo(closestPlayer.state.position);
      const speed =
        this.state.phase === "enraged"
          ? CONFIG.BOSS_SPEED * 1.5
          : CONFIG.BOSS_SPEED;

      this.state.velocity = {
        x: dir.x * speed,
        y: dir.y * speed,
      };

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
    } else {
      this.state.velocity = { x: 0, y: 0 };
    }
  }

  private tryUseSkill(currentTime: number, players: Player[]): boolean {
    const enrageMultiplier = this.state.phase === "enraged" ? 0.5 : 1;

    // Try Skill 1: Ground Slam (used when players are close)
    const skill1Cooldown = CONFIG.BOSS_SKILL_1.cooldown * enrageMultiplier;
    if (currentTime - this.skill1LastUsed >= skill1Cooldown) {
      const closePlayers = players.filter(
        (p) => this.getDistance(p.state.position) < 200,
      );
      if (closePlayers.length >= 1) {
        this.startSkillCast("ground_slam", this.state.position, currentTime);
        this.skill1LastUsed = currentTime;
        return true;
      }
    }

    // Try Skill 2: Fire Circle (used periodically)
    const skill2Cooldown = CONFIG.BOSS_SKILL_2.cooldown * enrageMultiplier;
    if (currentTime - this.skill2LastUsed >= skill2Cooldown) {
      // Target a random player position
      const randomPlayer = players[Math.floor(Math.random() * players.length)];
      if (randomPlayer) {
        this.startSkillCast(
          "fire_circle",
          { ...randomPlayer.state.position },
          currentTime,
        );
        this.skill2LastUsed = currentTime;
        return true;
      }
    }

    return false;
  }

  private startSkillCast(
    skillId: string,
    targetPosition: Vector2,
    currentTime: number,
  ): void {
    const skillConfig =
      skillId === "ground_slam" ? CONFIG.BOSS_SKILL_1 : CONFIG.BOSS_SKILL_2;

    this.state.currentSkill = {
      skillId,
      castStartAt: currentTime,
      castEndAt: currentTime + skillConfig.castTime,
      targetPosition,
    };

    this.pendingEvents.push({
      name: "boss_cast_started",
      skillId,
      targetPosition,
      castEndAt: this.state.currentSkill.castEndAt,
    });
  }

  private executeSkill(skill: BossSkillCast, currentTime: number): void {
    let zone: AOEZone;

    if (skill.skillId === "ground_slam") {
      zone = {
        id: "aoe_" + uuidv4(),
        skillId: skill.skillId,
        shape: "circle",
        position: skill.targetPosition,
        radius: CONFIG.BOSS_SKILL_1.radius,
        damage: CONFIG.BOSS_SKILL_1.damage,
        startAt: currentTime,
        endAt: currentTime + 500, // Quick damage check
      };
    } else {
      // Fire circle - ring shape
      zone = {
        id: "aoe_" + uuidv4(),
        skillId: skill.skillId,
        shape: "ring",
        position: skill.targetPosition,
        innerRadius: CONFIG.BOSS_SKILL_2.innerRadius,
        outerRadius: CONFIG.BOSS_SKILL_2.outerRadius,
        damage: CONFIG.BOSS_SKILL_2.damage,
        startAt: currentTime,
        endAt: currentTime + CONFIG.BOSS_SKILL_2.duration,
      };
    }

    this.activeAOEZones.push(zone);
    this.pendingEvents.push({ name: "aoe_spawned", zone });
  }

  public updateAOEZones(currentTime: number): AOEZone[] {
    // Remove expired zones
    const expiredZones = this.activeAOEZones.filter(
      (z) => currentTime >= z.endAt,
    );
    for (const zone of expiredZones) {
      this.pendingEvents.push({ name: "aoe_expired", zoneId: zone.id });
    }

    this.activeAOEZones = this.activeAOEZones.filter(
      (z) => currentTime < z.endAt,
    );

    return this.activeAOEZones;
  }

  public getActiveAOEZones(): AOEZone[] {
    return this.activeAOEZones;
  }

  public checkAOEDamage(
    player: Player,
    currentTime: number,
  ): { hit: boolean; damage: number; zoneId: string } | null {
    for (const zone of this.activeAOEZones) {
      // Only deal damage once per zone tick (use a simple time-based check)
      const timeSinceStart = currentTime - zone.startAt;
      const tickIndex = Math.floor(timeSinceStart / 1000); // Damage every second

      if (tickIndex >= 0 && this.isInAOE(player.state.position, zone)) {
        return { hit: true, damage: zone.damage, zoneId: zone.id };
      }
    }
    return null;
  }

  private isInAOE(position: Vector2, zone: AOEZone): boolean {
    const dist = Math.sqrt(
      (position.x - zone.position.x) ** 2 + (position.y - zone.position.y) ** 2,
    );

    if (zone.shape === "circle") {
      return dist <= (zone.radius || 0);
    } else if (zone.shape === "ring") {
      return dist >= (zone.innerRadius || 0) && dist <= (zone.outerRadius || 0);
    }

    return false;
  }

  public takeDamage(damage: number, attackerId: string): boolean {
    if (this.state.phase === "dead") return false;

    this.state.hp = Math.max(0, this.state.hp - damage);

    if (this.state.hp <= 0) {
      this.die();
      return true;
    }

    return false;
  }

  private die(): void {
    this.state.phase = "dead";
    this.state.velocity = { x: 0, y: 0 };
    this.state.currentSkill = null;
    this.activeAOEZones = [];
    this.pendingEvents.push({ name: "boss_phase_changed", phase: "dead" });
  }

  public isDead(): boolean {
    return this.state.phase === "dead";
  }

  public flushEvents(): GameEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  private getDistance(target: Vector2): number {
    const dx = this.state.position.x - target.x;
    const dy = this.state.position.y - target.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private getDirectionTo(target: Vector2): Vector2 {
    const dx = target.x - this.state.position.x;
    const dy = target.y - this.state.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return { x: 0, y: 0 };

    return { x: dx / dist, y: dy / dist };
  }
}
