import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MatchResult, PlayerContribution } from "../types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "../../data");
const MATCHES_FILE = path.join(DATA_DIR, "matches.json");
const CONTRIBUTIONS_FILE = path.join(DATA_DIR, "contributions.json");
const REWARDS_FILE = path.join(DATA_DIR, "rewards.json");
const CLAIMS_FILE = path.join(DATA_DIR, "claims.json");

// ============================================
// Types
// ============================================

export interface MatchRecord {
  matchId: string;
  roomId: string;
  bossId: string;
  startedAt: number;
  endedAt: number;
  duration: number;
  status: "completed" | "failed";
  isVictory: boolean;
  playerCount: number;
  summaryHash?: string;
  walrusBlobId?: string;
  createdAt: number;
}

export interface ContributionRecord {
  id: string;
  matchId: string;
  playerId: string;
  walletAddress: string;
  damage: number;
  healing: number;
  deaths: number;
  assists: number;
  score: number;
  createdAt: number;
}

export interface RewardRecord {
  id: string;
  matchId: string;
  playerId: string;
  walletAddress: string;
  rewardAmount: number;
  rewardType: string;
  nonce: string;
  expiry: number;
  signature?: string;
  payload?: string;
  createdAt: number;
}

export interface ClaimRecord {
  id: string;
  matchId: string;
  playerId: string;
  walletAddress: string;
  rewardId: string;
  status: "pending" | "claimed" | "failed" | "expired";
  txDigest?: string;
  claimedAt?: number;
  createdAt: number;
  updatedAt: number;
}

// ============================================
// Database Class (JSON-based for MVP)
// ============================================

export class Database {
  private matches: Map<string, MatchRecord> = new Map();
  private contributions: Map<string, ContributionRecord> = new Map();
  private rewards: Map<string, RewardRecord> = new Map();
  private claims: Map<string, ClaimRecord> = new Map();
  private initialized = false;

  constructor() {
    this.ensureDataDir();
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  public async init(): Promise<void> {
    if (this.initialized) return;

    // Load existing data
    this.matches = this.loadFile(MATCHES_FILE);
    this.contributions = this.loadFile(CONTRIBUTIONS_FILE);
    this.rewards = this.loadFile(REWARDS_FILE);
    this.claims = this.loadFile(CLAIMS_FILE);

    this.initialized = true;
    console.log("[Database] Initialized with JSON storage");
    console.log(`  - Matches: ${this.matches.size}`);
    console.log(`  - Contributions: ${this.contributions.size}`);
    console.log(`  - Rewards: ${this.rewards.size}`);
    console.log(`  - Claims: ${this.claims.size}`);
  }

  private loadFile<T>(filePath: string): Map<string, T> {
    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        return new Map(Object.entries(data));
      }
    } catch (error) {
      console.error(`[Database] Failed to load ${filePath}:`, error);
    }
    return new Map();
  }

  private saveFile<T>(filePath: string, data: Map<string, T>): void {
    try {
      const obj = Object.fromEntries(data);
      fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
    } catch (error) {
      console.error(`[Database] Failed to save ${filePath}:`, error);
    }
  }

  // ==================== Matches ====================

  public async createMatch(match: MatchRecord): Promise<MatchRecord> {
    this.matches.set(match.matchId, match);
    this.saveFile(MATCHES_FILE, this.matches);
    return match;
  }

  public async getMatch(matchId: string): Promise<MatchRecord | null> {
    return this.matches.get(matchId) || null;
  }

  public async updateMatch(
    matchId: string,
    updates: Partial<MatchRecord>,
  ): Promise<MatchRecord | null> {
    const match = this.matches.get(matchId);
    if (!match) return null;

    const updated = { ...match, ...updates };
    this.matches.set(matchId, updated);
    this.saveFile(MATCHES_FILE, this.matches);
    return updated;
  }

  public async getRecentMatches(limit: number = 20): Promise<MatchRecord[]> {
    return Array.from(this.matches.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  // ==================== Contributions ====================

  public async createContribution(
    contribution: ContributionRecord,
  ): Promise<ContributionRecord> {
    this.contributions.set(contribution.id, contribution);
    this.saveFile(CONTRIBUTIONS_FILE, this.contributions);
    return contribution;
  }

  public async getContributionsByMatch(
    matchId: string,
  ): Promise<ContributionRecord[]> {
    return Array.from(this.contributions.values())
      .filter((c) => c.matchId === matchId)
      .sort((a, b) => b.score - a.score);
  }

  public async getContributionsByPlayer(
    walletAddress: string,
    limit: number = 50,
  ): Promise<ContributionRecord[]> {
    return Array.from(this.contributions.values())
      .filter((c) => c.walletAddress === walletAddress)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  public async getLeaderboard(
    limit: number = 100,
  ): Promise<
    {
      walletAddress: string;
      totalDamage: number;
      totalScore: number;
      matchCount: number;
    }[]
  > {
    const byPlayer = new Map<
      string,
      { totalDamage: number; totalScore: number; matchCount: number }
    >();

    for (const c of this.contributions.values()) {
      const existing = byPlayer.get(c.walletAddress) || {
        totalDamage: 0,
        totalScore: 0,
        matchCount: 0,
      };
      byPlayer.set(c.walletAddress, {
        totalDamage: existing.totalDamage + c.damage,
        totalScore: existing.totalScore + c.score,
        matchCount: existing.matchCount + 1,
      });
    }

    return Array.from(byPlayer.entries())
      .map(([walletAddress, stats]) => ({ walletAddress, ...stats }))
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, limit);
  }

  // ==================== Rewards ====================

  public async createReward(reward: RewardRecord): Promise<RewardRecord> {
    this.rewards.set(reward.id, reward);
    this.saveFile(REWARDS_FILE, this.rewards);
    return reward;
  }

  public async getReward(rewardId: string): Promise<RewardRecord | null> {
    return this.rewards.get(rewardId) || null;
  }

  public async getRewardsByMatch(matchId: string): Promise<RewardRecord[]> {
    return Array.from(this.rewards.values()).filter(
      (r) => r.matchId === matchId,
    );
  }

  public async getRewardsByPlayer(
    walletAddress: string,
  ): Promise<RewardRecord[]> {
    return Array.from(this.rewards.values())
      .filter((r) => r.walletAddress === walletAddress)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  public async updateReward(
    rewardId: string,
    updates: Partial<RewardRecord>,
  ): Promise<RewardRecord | null> {
    const reward = this.rewards.get(rewardId);
    if (!reward) return null;

    const updated = { ...reward, ...updates };
    this.rewards.set(rewardId, updated);
    this.saveFile(REWARDS_FILE, this.rewards);
    return updated;
  }

  // ==================== Claims ====================

  public async createClaim(claim: ClaimRecord): Promise<ClaimRecord> {
    this.claims.set(claim.id, claim);
    this.saveFile(CLAIMS_FILE, this.claims);
    return claim;
  }

  public async getClaim(claimId: string): Promise<ClaimRecord | null> {
    return this.claims.get(claimId) || null;
  }

  public async getClaimByReward(rewardId: string): Promise<ClaimRecord | null> {
    for (const claim of this.claims.values()) {
      if (claim.rewardId === rewardId) return claim;
    }
    return null;
  }

  public async getClaimsByPlayer(
    walletAddress: string,
  ): Promise<ClaimRecord[]> {
    return Array.from(this.claims.values())
      .filter((c) => c.walletAddress === walletAddress)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  public async updateClaim(
    claimId: string,
    updates: Partial<ClaimRecord>,
  ): Promise<ClaimRecord | null> {
    const claim = this.claims.get(claimId);
    if (!claim) return null;

    const updated = { ...claim, ...updates, updatedAt: Date.now() };
    this.claims.set(claimId, updated);
    this.saveFile(CLAIMS_FILE, this.claims);
    return updated;
  }

  public async isRewardClaimed(rewardId: string): Promise<boolean> {
    const claim = await this.getClaimByReward(rewardId);
    return claim?.status === "claimed";
  }

  // ==================== Stats ====================

  public async getStats(): Promise<{
    totalMatches: number;
    totalPlayers: number;
    totalRewards: number;
    totalClaims: number;
  }> {
    const uniquePlayers = new Set(
      Array.from(this.contributions.values()).map((c) => c.walletAddress),
    );

    return {
      totalMatches: this.matches.size,
      totalPlayers: uniquePlayers.size,
      totalRewards: this.rewards.size,
      totalClaims: Array.from(this.claims.values()).filter(
        (c) => c.status === "claimed",
      ).length,
    };
  }
}

// Singleton instance
export const db = new Database();
