/**
 * Boss Fight API Service
 * Wrapper for all REST API endpoints related to boss fight gameplay
 */

const API_BASE_URL =
  import.meta.env.VITE_BOSS_API_URL || "http://localhost:3001";

// ==================== Types ====================

export interface PendingReward {
  id: string;
  matchId: string;
  amount: number;
  type: "tokens" | "power_stone";
  expiry: number;
  createdAt: number;
}

export interface SignedClaimPayload {
  rewardId: string;
  matchId: string;
  walletAddress: string;
  rewardType: "tokens" | "power_stone";
  amount: number;
  expiry: number;
  signature: string;
}

export interface ClaimResult {
  id: string;
  status: "pending" | "claimed" | "expired";
  txDigest: string | null;
  claimedAt: number | null;
}

export interface MatchSummary {
  matchId: string;
  roomId: string;
  isVictory: boolean;
  playerCount: number;
  duration: number;
  startedAt: number;
  walrusBlobId: string | null;
}

export interface MatchDetails {
  matchId: string;
  roomId: string;
  bossId: string;
  isVictory: boolean;
  playerCount: number;
  duration: number;
  startedAt: number;
  endedAt: number;
  walrusBlobId: string | null;
}

export interface PlayerContribution {
  playerId: string;
  walletAddress: string;
  matchId: string;
  damage: number;
  deaths: number;
  score: number;
  createdAt: number;
}

export interface RewardEntry {
  playerId: string;
  walletAddress: string;
  amount: number;
  type: "tokens" | "power_stone";
}

export interface LeaderboardEntry {
  walletAddress: string;
  totalDamage: number;
  totalScore: number;
  matchCount: number;
  totalDeaths: number;
}

export interface PlayerStats {
  walletAddress: string;
  matchCount: number;
  totalDamage: number;
  totalScore: number;
  totalDeaths: number;
  avgDamagePerMatch: number;
  claimedRewards: number;
  pendingRewards: number;
}

export interface RecentMatch {
  matchId: string;
  damage: number;
  score: number;
  deaths: number;
  createdAt: number;
}

export interface MatchResult {
  matchId: string;
  roomId: string;
  bossId: string;
  startedAt: number;
  endedAt: number;
  duration: number;
  contributions: Array<{
    playerId: string;
    damage: number;
    healing: number;
    deaths: number;
    assists: number;
  }>;
  isVictory: boolean;
}

export interface ServerInfo {
  serverPublicKey: string;
  stats: {
    totalMatches: number;
    totalRewards: number;
    totalClaims: number;
    totalContributions: number;
  };
}

export interface RoomInfo {
  roomId: string;
  status: string;
  playerCount: number;
  maxPlayers: number;
}

// ==================== API Functions ====================

/**
 * Check server health
 */
export async function checkHealth(): Promise<{
  status: string;
  timestamp: number;
  rooms: number;
  players: number;
  connections: number;
}> {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error("Server health check failed");
  }
  return response.json();
}

/**
 * Get list of available rooms
 */
export async function fetchRooms(): Promise<RoomInfo[]> {
  const response = await fetch(`${API_BASE_URL}/rooms`);
  if (!response.ok) {
    throw new Error("Failed to fetch rooms");
  }
  const data = await response.json();
  return data.rooms;
}

/**
 * Create a new room
 */
export async function createRoom(): Promise<{
  roomId: string;
  status: string;
}> {
  const response = await fetch(`${API_BASE_URL}/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error("Failed to create room");
  }
  return response.json();
}

// ==================== Rewards API ====================

/**
 * Fetch pending rewards for a wallet address
 */
export async function fetchPendingRewards(walletAddress: string): Promise<{
  rewards: PendingReward[];
  signedPayloads: SignedClaimPayload[];
}> {
  const response = await fetch(`${API_BASE_URL}/rewards/${walletAddress}`);
  if (!response.ok) {
    throw new Error("Failed to fetch pending rewards");
  }
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || "Failed to fetch rewards");
  }
  return {
    rewards: data.rewards,
    signedPayloads: data.signedPayloads,
  };
}

/**
 * Get signed claim payload for a specific reward
 */
export async function signRewardClaim(
  walletAddress: string,
  rewardId: string,
): Promise<{
  signedPayload: SignedClaimPayload;
  serverPublicKey: string;
}> {
  const response = await fetch(
    `${API_BASE_URL}/rewards/${walletAddress}/${rewardId}/sign`,
  );
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to sign reward claim");
  }
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || "Failed to sign claim");
  }
  return {
    signedPayload: data.signedPayload,
    serverPublicKey: data.serverPublicKey,
  };
}

/**
 * Confirm claim after on-chain transaction
 */
export async function confirmClaim(
  rewardId: string,
  txDigest: string,
): Promise<ClaimResult> {
  const response = await fetch(`${API_BASE_URL}/claims/${rewardId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txDigest }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to confirm claim");
  }
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || "Failed to process claim");
  }
  return data.claim;
}

// ==================== Matches API ====================

/**
 * Fetch recent matches
 */
export async function fetchMatches(limit = 20): Promise<MatchSummary[]> {
  const response = await fetch(`${API_BASE_URL}/matches?limit=${limit}`);
  if (!response.ok) {
    throw new Error("Failed to fetch matches");
  }
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || "Failed to fetch matches");
  }
  return data.matches;
}

/**
 * Fetch match details by ID
 */
export async function fetchMatchDetails(matchId: string): Promise<{
  match: MatchDetails;
  contributions: PlayerContribution[];
  rewards: RewardEntry[];
  walrusUrl: string | null;
}> {
  const response = await fetch(`${API_BASE_URL}/matches/${matchId}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to fetch match details");
  }
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || "Failed to fetch match");
  }
  return {
    match: data.match,
    contributions: data.contributions,
    rewards: data.rewards,
    walrusUrl: data.walrusUrl,
  };
}

// ==================== Leaderboard API ====================

/**
 * Fetch leaderboard
 */
export async function fetchLeaderboard(
  limit = 100,
): Promise<LeaderboardEntry[]> {
  const response = await fetch(`${API_BASE_URL}/leaderboard?limit=${limit}`);
  if (!response.ok) {
    throw new Error("Failed to fetch leaderboard");
  }
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || "Failed to fetch leaderboard");
  }
  return data.leaderboard;
}

// ==================== Player Stats API ====================

/**
 * Fetch player stats
 */
export async function fetchPlayerStats(walletAddress: string): Promise<{
  stats: PlayerStats;
  recentMatches: RecentMatch[];
}> {
  const response = await fetch(
    `${API_BASE_URL}/players/${walletAddress}/stats`,
  );
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to fetch player stats");
  }
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || "Failed to fetch stats");
  }
  return {
    stats: data.stats,
    recentMatches: data.recentMatches,
  };
}

// ==================== Server Info API ====================

/**
 * Fetch server info including public key
 */
export async function fetchServerInfo(): Promise<ServerInfo> {
  const response = await fetch(`${API_BASE_URL}/server/info`);
  if (!response.ok) {
    throw new Error("Failed to fetch server info");
  }
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || "Failed to fetch server info");
  }
  return {
    serverPublicKey: data.serverPublicKey,
    stats: data.stats,
  };
}

// ==================== Export All ====================

export const bossApi = {
  // Health & Rooms
  checkHealth,
  fetchRooms,
  createRoom,

  // Rewards
  fetchPendingRewards,
  signRewardClaim,
  confirmClaim,

  // Matches
  fetchMatches,
  fetchMatchDetails,

  // Leaderboard
  fetchLeaderboard,

  // Player
  fetchPlayerStats,

  // Server
  fetchServerInfo,
};

export default bossApi;
