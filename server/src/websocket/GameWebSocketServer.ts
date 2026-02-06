import { WebSocketServer, WebSocket } from "ws";
import * as msgpack from "msgpack-lite";
import { Server } from "http";
import {
  ClientMessage,
  ServerMessage,
  PlayerInput,
  PlayerStateDelta,
  BossStateDelta,
  AOEZone,
  GameEvent,
  MatchResult,
} from "../types/index.js";
import { RoomManager } from "../game/RoomManager.js";
import { Player } from "../game/Player.js";

interface ClientSession {
  ws: WebSocket;
  playerId: string | null;
  roomId: string | null;
  walletAddress: string | null;
  isAlive: boolean;
}

export class GameWebSocketServer {
  private wss: WebSocketServer;
  private roomManager: RoomManager;
  private clients: Map<WebSocket, ClientSession> = new Map();
  private playerToClient: Map<string, WebSocket> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(server: Server, roomManager: RoomManager) {
    this.roomManager = roomManager;

    this.wss = new WebSocketServer({ server, path: "/ws" });

    this.setupRoomManagerHandlers();
    this.setupWebSocketHandlers();
    this.startPingLoop();

    console.log("[WebSocket] Server initialized on /ws");
  }

  private setupRoomManagerHandlers(): void {
    this.roomManager.setOnSnapshot((roomId, players, boss, aoeZones, tick) => {
      this.broadcastToRoom(roomId, {
        type: "snapshot",
        tick,
        players,
        boss,
        aoeZones,
      });
    });

    this.roomManager.setOnEvent((roomId, event) => {
      this.broadcastToRoom(roomId, {
        type: "event",
        event,
      });
    });

    this.roomManager.setOnMatchEnd((result) => {
      console.log(
        `[WebSocket] Match ended: ${result.matchId}, Victory: ${result.isVictory}`,
      );
      // Additional handling like saving to DB, uploading to Walrus would go here
    });
  }

  private setupWebSocketHandlers(): void {
    this.wss.on("connection", (ws: WebSocket) => {
      const session: ClientSession = {
        ws,
        playerId: null,
        roomId: null,
        walletAddress: null,
        isAlive: true,
      };

      this.clients.set(ws, session);
      console.log(`[WebSocket] Client connected (${this.clients.size} total)`);

      ws.on("message", (data: Buffer) => {
        try {
          const message = this.decodeMessage(data);
          this.handleMessage(ws, session, message);
        } catch (error) {
          console.error("[WebSocket] Failed to parse message:", error);
        }
      });

      ws.on("close", () => {
        this.handleDisconnect(ws, session);
      });

      ws.on("error", (error) => {
        console.error("[WebSocket] Error:", error);
      });

      ws.on("pong", () => {
        session.isAlive = true;
      });
    });
  }

  private startPingLoop(): void {
    this.pingInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        const session = this.clients.get(ws);
        if (!session) return;

        if (!session.isAlive) {
          ws.terminate();
          return;
        }

        session.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }

  private decodeMessage(data: Buffer): ClientMessage {
    // Try msgpack first, fall back to JSON
    try {
      return msgpack.decode(data) as ClientMessage;
    } catch {
      return JSON.parse(data.toString()) as ClientMessage;
    }
  }

  private encodeMessage(message: ServerMessage): Buffer {
    // Use msgpack for binary protocol
    return msgpack.encode(message);
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(this.encodeMessage(message));
    }
  }

  private broadcastToRoom(roomId: string, message: ServerMessage): void {
    const encoded = this.encodeMessage(message);

    for (const [ws, session] of this.clients) {
      if (session.roomId === roomId && ws.readyState === WebSocket.OPEN) {
        ws.send(encoded);
      }
    }
  }

  private handleMessage(
    ws: WebSocket,
    session: ClientSession,
    message: ClientMessage,
  ): void {
    switch (message.type) {
      case "join_room":
        this.handleJoinRoom(ws, session, message.roomId, message.walletAddress);
        break;

      case "leave_room":
        this.handleLeaveRoom(ws, session);
        break;

      case "input":
        this.handleInput(session, message.input);
        break;

      case "ping":
        this.send(ws, {
          type: "pong",
          serverTimestamp: Date.now(),
          clientTimestamp: message.timestamp,
        });
        break;
    }
  }

  private handleJoinRoom(
    ws: WebSocket,
    session: ClientSession,
    requestedRoomId: string | null,
    walletAddress: string,
  ): void {
    if (session.roomId) {
      this.handleLeaveRoom(ws, session);
    }

    let room;
    if (requestedRoomId) {
      room = this.roomManager.getRoom(requestedRoomId);
      if (!room) {
        this.send(ws, {
          type: "error",
          code: "ROOM_NOT_FOUND",
          message: "Room not found",
        });
        return;
      }
    } else {
      room = this.roomManager.findOrCreateRoom();
    }

    const player = room.addPlayer(walletAddress);
    if (!player) {
      this.send(ws, {
        type: "error",
        code: "ROOM_FULL",
        message: "Room is full",
      });
      return;
    }

    session.playerId = player.state.id;
    session.roomId = room.roomId;
    session.walletAddress = walletAddress;
    this.playerToClient.set(player.state.id, ws);

    // Notify player joined
    this.send(ws, {
      type: "room_joined",
      roomId: room.roomId,
      playerId: player.state.id,
      roomState: room.getState(),
    });

    // Broadcast to other players in room
    this.broadcastToRoom(room.roomId, {
      type: "player_joined",
      player: player.state,
    });

    console.log(
      `[WebSocket] Player ${player.state.id} joined room ${room.roomId}`,
    );
  }

  private handleLeaveRoom(ws: WebSocket, session: ClientSession): void {
    if (!session.roomId || !session.playerId) return;

    const room = this.roomManager.getRoom(session.roomId);
    if (room) {
      room.removePlayer(session.playerId);

      // Broadcast player left
      this.broadcastToRoom(session.roomId, {
        type: "player_left",
        playerId: session.playerId,
      });
    }

    this.playerToClient.delete(session.playerId);
    session.playerId = null;
    session.roomId = null;

    this.send(ws, { type: "room_left" });
  }

  private handleInput(session: ClientSession, input: PlayerInput): void {
    if (!session.roomId || !session.playerId) return;

    const room = this.roomManager.getRoom(session.roomId);
    if (!room) return;

    const player = room.getPlayer(session.playerId);
    if (!player) return;

    player.queueInput(input);
  }

  private handleDisconnect(ws: WebSocket, session: ClientSession): void {
    this.handleLeaveRoom(ws, session);
    this.clients.delete(ws);
    console.log(
      `[WebSocket] Client disconnected (${this.clients.size} remaining)`,
    );
  }

  public close(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    this.wss.close();
  }

  public getStats(): { connectedClients: number } {
    return { connectedClients: this.clients.size };
  }
}
