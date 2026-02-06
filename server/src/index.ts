import express from "express";
import cors from "cors";
import { createServer } from "http";
import dotenv from "dotenv";

import { CONFIG } from "./config.js";
import { RoomManager } from "./game/RoomManager.js";
import { GameWebSocketServer } from "./websocket/GameWebSocketServer.js";
import { db } from "./db/database.js";
import { signatureService } from "./services/SignatureService.js";
import { walrusService } from "./services/WalrusService.js";

// Load environment variables
dotenv.config();

// Initialize database
await db.init();

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = createServer(app);

// Initialize game systems
const roomManager = new RoomManager();
const wsServer = new GameWebSocketServer(server, roomManager);

// Health check endpoint
app.get("/health", (req, res) => {
  const roomStats = roomManager.getStats();
  const wsStats = wsServer.getStats();

  res.json({
    status: "ok",
    timestamp: Date.now(),
    rooms: roomStats.roomCount,
    players: roomStats.totalPlayers,
    connections: wsStats.connectedClients,
  });
});

// Get available rooms
app.get("/rooms", (req, res) => {
  const rooms = roomManager.getAllRooms().map((room) => ({
    roomId: room.roomId,
    status: room.status,
    playerCount: room.getPlayerCount(),
    maxPlayers: CONFIG.MAX_PLAYERS_PER_ROOM,
  }));

  res.json({ rooms });
});

// Create a new room (for testing)
app.post("/rooms", (req, res) => {
  const room = roomManager.createRoom();
  res.json({
    roomId: room.roomId,
    status: room.status,
  });
});

// ==================== Rewards API ====================

// Get pending rewards for a player
app.get("/rewards/:walletAddress", async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const { rewards, signedPayloads } =
      await signatureService.getPendingClaimsForPlayer(walletAddress);

    res.json({
      success: true,
      rewards: rewards.map((r) => ({
        id: r.id,
        matchId: r.matchId,
        amount: r.rewardAmount,
        type: r.rewardType,
        expiry: r.expiry,
        createdAt: r.createdAt,
      })),
      signedPayloads,
    });
  } catch (error) {
    console.error("Error fetching rewards:", error);
    res.status(500).json({ success: false, error: "Failed to fetch rewards" });
  }
});

// Get signed claim payload for a specific reward
app.get("/rewards/:walletAddress/:rewardId/sign", async (req, res) => {
  try {
    const { rewardId } = req.params;
    const signedPayload = await signatureService.createSignedClaim(rewardId);

    if (!signedPayload) {
      return res
        .status(404)
        .json({ success: false, error: "Reward not found or already claimed" });
    }

    res.json({
      success: true,
      signedPayload,
      serverPublicKey: signatureService.getPublicKey(),
    });
  } catch (error) {
    console.error("Error signing claim:", error);
    res.status(500).json({ success: false, error: "Failed to sign claim" });
  }
});

// Submit claim confirmation (after on-chain claim)
app.post("/claims/:rewardId", async (req, res) => {
  try {
    const { rewardId } = req.params;
    const { txDigest } = req.body;

    const claim = await signatureService.processClaim(rewardId, txDigest);

    if (!claim) {
      return res
        .status(404)
        .json({ success: false, error: "Failed to process claim" });
    }

    res.json({
      success: true,
      claim: {
        id: claim.id,
        status: claim.status,
        txDigest: claim.txDigest,
        claimedAt: claim.claimedAt,
      },
    });
  } catch (error) {
    console.error("Error processing claim:", error);
    res.status(500).json({ success: false, error: "Failed to process claim" });
  }
});

// ==================== Match History API ====================

// Get recent matches
app.get("/matches", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const matches = await db.getRecentMatches(limit);

    res.json({
      success: true,
      matches: matches.map((m) => ({
        matchId: m.matchId,
        roomId: m.roomId,
        isVictory: m.isVictory,
        playerCount: m.playerCount,
        duration: m.duration,
        startedAt: m.startedAt,
        walrusBlobId: m.walrusBlobId,
      })),
    });
  } catch (error) {
    console.error("Error fetching matches:", error);
    res.status(500).json({ success: false, error: "Failed to fetch matches" });
  }
});

// Get match details
app.get("/matches/:matchId", async (req, res) => {
  try {
    const { matchId } = req.params;
    const match = await db.getMatch(matchId);

    if (!match) {
      return res.status(404).json({ success: false, error: "Match not found" });
    }

    const contributions = await db.getContributionsByMatch(matchId);
    const rewards = await db.getRewardsByMatch(matchId);

    res.json({
      success: true,
      match,
      contributions,
      rewards: rewards.map((r) => ({
        playerId: r.playerId,
        walletAddress: r.walletAddress,
        amount: r.rewardAmount,
        type: r.rewardType,
      })),
      walrusUrl: match.walrusBlobId
        ? walrusService.getBlobUrl(match.walrusBlobId)
        : null,
    });
  } catch (error) {
    console.error("Error fetching match:", error);
    res.status(500).json({ success: false, error: "Failed to fetch match" });
  }
});

// ==================== Leaderboard API ====================

app.get("/leaderboard", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const leaderboard = await db.getLeaderboard(limit);

    res.json({
      success: true,
      leaderboard,
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch leaderboard" });
  }
});

// ==================== Player Stats API ====================

app.get("/players/:walletAddress/stats", async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const contributions = await db.getContributionsByPlayer(walletAddress, 100);
    const claims = await db.getClaimsByPlayer(walletAddress);

    const totalDamage = contributions.reduce((sum, c) => sum + c.damage, 0);
    const totalScore = contributions.reduce((sum, c) => sum + c.score, 0);
    const totalDeaths = contributions.reduce((sum, c) => sum + c.deaths, 0);
    const matchCount = contributions.length;
    const claimedCount = claims.filter((c) => c.status === "claimed").length;

    res.json({
      success: true,
      stats: {
        walletAddress,
        matchCount,
        totalDamage,
        totalScore,
        totalDeaths,
        avgDamagePerMatch:
          matchCount > 0 ? Math.round(totalDamage / matchCount) : 0,
        claimedRewards: claimedCount,
        pendingRewards: claims.filter((c) => c.status === "pending").length,
      },
      recentMatches: contributions.slice(0, 10).map((c) => ({
        matchId: c.matchId,
        damage: c.damage,
        score: c.score,
        deaths: c.deaths,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching player stats:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch player stats" });
  }
});

// ==================== Server Info API ====================

app.get("/server/info", async (req, res) => {
  try {
    const dbStats = await db.getStats();

    res.json({
      success: true,
      serverPublicKey: signatureService.getPublicKey(),
      stats: dbStats,
    });
  } catch (error) {
    console.error("Error fetching server info:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch server info" });
  }
});

// Error handling
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  },
);

// Start server
const PORT = CONFIG.PORT;
server.listen(PORT, () => {
  console.log("=".repeat(50));
  console.log(`🎮 Voidia Game Server started`);
  console.log(`   HTTP: http://localhost:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`   Tick Rate: ${CONFIG.TICK_RATE} Hz`);
  console.log(`   Max Players/Room: ${CONFIG.MAX_PLAYERS_PER_ROOM}`);
  console.log("=".repeat(50));
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down...");
  wsServer.close();
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down...");
  wsServer.close();
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
