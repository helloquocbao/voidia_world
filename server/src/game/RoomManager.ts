import { GameRoom } from "./GameRoom.js";
import {
  MatchResult,
  PlayerStateDelta,
  BossStateDelta,
  AOEZone,
  GameEvent,
} from "../types/index.js";
import { CONFIG } from "../config.js";
import { ContributionTracker } from "../services/ContributionTracker.js";
import { walrusService } from "../services/WalrusService.js";
import { RewardRecord } from "../db/database.js";

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();

  private onSnapshot:
    | ((
        roomId: string,
        players: PlayerStateDelta[],
        boss: BossStateDelta,
        aoeZones: AOEZone[],
        tick: number,
      ) => void)
    | null = null;
  private onEvent: ((roomId: string, event: GameEvent) => void) | null = null;
  private onMatchEnd: ((result: MatchResult) => void) | null = null;

  public setOnSnapshot(handler: typeof this.onSnapshot): void {
    this.onSnapshot = handler;
  }

  public setOnEvent(handler: typeof this.onEvent): void {
    this.onEvent = handler;
  }

  public setOnMatchEnd(handler: typeof this.onMatchEnd): void {
    this.onMatchEnd = handler;
  }

  public createRoom(roomId?: string): GameRoom {
    const room = new GameRoom(roomId);

    // Wire up event handlers
    room.setOnSnapshot((rid, players, boss, aoeZones, tick) => {
      if (this.onSnapshot) {
        this.onSnapshot(rid, players, boss, aoeZones, tick);
      }
    });

    room.setOnEvent((rid, event) => {
      if (this.onEvent) {
        this.onEvent(rid, event);
      }
    });

    room.setOnMatchEnd(async (result) => {
      // Get player wallets before processing
      const playerWallets = room.getPlayerWallets();

      // Process match result and create rewards
      try {
        const rewards = await ContributionTracker.processMatchResult(
          result,
          playerWallets,
        );
        console.log(
          `[RoomManager] Match ${result.matchId} processed, ${rewards.length} rewards created`,
        );

        // Upload match summary to Walrus (async, don't block)
        walrusService
          .uploadMatchSummary(result.matchId)
          .then((uploadResult) => {
            if (uploadResult) {
              console.log(
                `[RoomManager] Match ${result.matchId} summary uploaded to Walrus: ${uploadResult.blobId}`,
              );
            }
          })
          .catch((error) => {
            console.error(
              `[RoomManager] Failed to upload match ${result.matchId} to Walrus:`,
              error,
            );
          });

        // Notify players about their rewards
        for (const reward of rewards) {
          if (this.onEvent) {
            this.onEvent(result.roomId, {
              name: "reward_ready",
              matchId: result.matchId,
              playerId: reward.playerId,
            });
          }
        }
      } catch (error) {
        console.error(
          `[RoomManager] Failed to process match ${result.matchId}:`,
          error,
        );
      }

      if (this.onMatchEnd) {
        this.onMatchEnd(result);
      }

      // Clean up room after match ends
      setTimeout(() => {
        this.destroyRoom(result.roomId);
      }, 30000); // Keep room alive 30 seconds for final sync
    });

    this.rooms.set(room.roomId, room);
    console.log(`[RoomManager] Created room: ${room.roomId}`);

    return room;
  }

  public getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  public findOrCreateRoom(): GameRoom {
    // Find a room that's waiting and has space
    for (const [, room] of this.rooms) {
      if (
        room.status === "waiting" &&
        room.getPlayerCount() < CONFIG.MAX_PLAYERS_PER_ROOM
      ) {
        return room;
      }
    }

    // No available room, create new one
    return this.createRoom();
  }

  public destroyRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.destroy();
      this.rooms.delete(roomId);
      console.log(`[RoomManager] Destroyed room: ${roomId}`);
    }
  }

  public getRoomCount(): number {
    return this.rooms.size;
  }

  public getAllRooms(): GameRoom[] {
    return Array.from(this.rooms.values());
  }

  public getStats(): { roomCount: number; totalPlayers: number } {
    let totalPlayers = 0;
    for (const [, room] of this.rooms) {
      totalPlayers += room.getPlayerCount();
    }
    return { roomCount: this.rooms.size, totalPlayers };
  }
}
