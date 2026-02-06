import { v4 as uuidv4 } from "uuid";
import { PlayerContribution, MatchResult } from "../types/index.js";
import {
  db,
  MatchRecord,
  ContributionRecord,
  RewardRecord,
} from "../db/database.js";

// ============================================
// Reward Calculation Config
// ============================================

const REWARD_CONFIG = {
  // Base reward pool per match (in smallest unit)
  BASE_REWARD_POOL: 1000,

  // Multipliers
  VICTORY_MULTIPLIER: 2.0,
  DEFEAT_MULTIPLIER: 0.3,

  // Score weights
  DAMAGE_WEIGHT: 1.0,
  HEALING_WEIGHT: 1.5,
  ASSIST_WEIGHT: 0.5,
  DEATH_PENALTY: -10,

  // Minimum contribution to receive reward
  MIN_SCORE_FOR_REWARD: 10,

  // Reward expiry (24 hours)
  REWARD_EXPIRY_MS: 24 * 60 * 60 * 1000,
};

// ============================================
// Contribution Tracker
// ============================================

export class ContributionTracker {
  /**
   * Calculate score from contribution
   */
  public static calculateScore(contribution: PlayerContribution): number {
    const score =
      contribution.damage * REWARD_CONFIG.DAMAGE_WEIGHT +
      contribution.healing * REWARD_CONFIG.HEALING_WEIGHT +
      contribution.assists * REWARD_CONFIG.ASSIST_WEIGHT +
      contribution.deaths * REWARD_CONFIG.DEATH_PENALTY;

    return Math.max(0, Math.round(score));
  }

  /**
   * Calculate reward amount based on contribution percentage
   */
  public static calculateReward(
    score: number,
    totalScore: number,
    isVictory: boolean,
  ): number {
    if (totalScore === 0 || score < REWARD_CONFIG.MIN_SCORE_FOR_REWARD) {
      return 0;
    }

    const multiplier = isVictory
      ? REWARD_CONFIG.VICTORY_MULTIPLIER
      : REWARD_CONFIG.DEFEAT_MULTIPLIER;

    const pool = REWARD_CONFIG.BASE_REWARD_POOL * multiplier;
    const share = score / totalScore;

    return Math.round(pool * share);
  }

  /**
   * Process match result and save to database
   * Returns array of reward records
   */
  public static async processMatchResult(
    result: MatchResult,
    playerWallets: Map<string, string>, // playerId -> walletAddress
  ): Promise<RewardRecord[]> {
    const now = Date.now();

    // 1. Create match record
    const matchRecord: MatchRecord = {
      matchId: result.matchId,
      roomId: result.roomId,
      bossId: result.bossId,
      startedAt: result.startedAt,
      endedAt: result.endedAt,
      duration: result.duration,
      status: "completed",
      isVictory: result.isVictory,
      playerCount: result.contributions.length,
      createdAt: now,
    };
    await db.createMatch(matchRecord);

    // 2. Calculate scores for all contributions
    const contributionsWithScore = result.contributions.map((c) => ({
      ...c,
      score: this.calculateScore(c),
      walletAddress: playerWallets.get(c.playerId) || "unknown",
    }));

    const totalScore = contributionsWithScore.reduce(
      (sum, c) => sum + c.score,
      0,
    );

    // 3. Create contribution records
    for (const c of contributionsWithScore) {
      const record: ContributionRecord = {
        id: `contrib_${uuidv4()}`,
        matchId: result.matchId,
        playerId: c.playerId,
        walletAddress: c.walletAddress,
        damage: c.damage,
        healing: c.healing,
        deaths: c.deaths,
        assists: c.assists,
        score: c.score,
        createdAt: now,
      };
      await db.createContribution(record);
    }

    // 4. Create reward records
    const rewards: RewardRecord[] = [];

    for (const c of contributionsWithScore) {
      const rewardAmount = this.calculateReward(
        c.score,
        totalScore,
        result.isVictory,
      );

      if (rewardAmount > 0) {
        const nonce = uuidv4().replace(/-/g, "");
        const expiry = now + REWARD_CONFIG.REWARD_EXPIRY_MS;

        const reward: RewardRecord = {
          id: `reward_${uuidv4()}`,
          matchId: result.matchId,
          playerId: c.playerId,
          walletAddress: c.walletAddress,
          rewardAmount,
          rewardType: "VOIDIA_COIN",
          nonce,
          expiry,
          createdAt: now,
        };

        await db.createReward(reward);
        rewards.push(reward);
      }
    }

    console.log(`[ContributionTracker] Processed match ${result.matchId}`);
    console.log(`  - Victory: ${result.isVictory}`);
    console.log(`  - Players: ${result.contributions.length}`);
    console.log(`  - Total Score: ${totalScore}`);
    console.log(`  - Rewards Created: ${rewards.length}`);

    return rewards;
  }

  /**
   * Generate match summary for Walrus upload
   */
  public static async generateMatchSummary(
    matchId: string,
  ): Promise<object | null> {
    const match = await db.getMatch(matchId);
    if (!match) return null;

    const contributions = await db.getContributionsByMatch(matchId);
    const rewards = await db.getRewardsByMatch(matchId);

    return {
      version: "1.0",
      matchId: match.matchId,
      roomId: match.roomId,
      bossId: match.bossId,
      timestamp: {
        started: match.startedAt,
        ended: match.endedAt,
        duration: match.duration,
      },
      result: {
        isVictory: match.isVictory,
        playerCount: match.playerCount,
      },
      contributions: contributions.map((c) => ({
        playerId: c.playerId,
        walletAddress: c.walletAddress,
        damage: c.damage,
        healing: c.healing,
        deaths: c.deaths,
        assists: c.assists,
        score: c.score,
      })),
      rewards: rewards.map((r) => ({
        playerId: r.playerId,
        walletAddress: r.walletAddress,
        amount: r.rewardAmount,
        type: r.rewardType,
        nonce: r.nonce,
        expiry: r.expiry,
      })),
      metadata: {
        generatedAt: Date.now(),
        serverVersion: "1.0.0",
      },
    };
  }

  /**
   * Get pending rewards for a player
   */
  public static async getPendingRewards(
    walletAddress: string,
  ): Promise<RewardRecord[]> {
    const rewards = await db.getRewardsByPlayer(walletAddress);
    const pendingRewards: RewardRecord[] = [];

    for (const reward of rewards) {
      // Check if not claimed and not expired
      const isClaimed = await db.isRewardClaimed(reward.id);
      const isExpired = reward.expiry < Date.now();

      if (!isClaimed && !isExpired) {
        pendingRewards.push(reward);
      }
    }

    return pendingRewards;
  }
}

export default ContributionTracker;
