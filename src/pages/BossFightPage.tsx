import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useCurrentAccount } from "@mysten/dapp-kit";
import Phaser from "phaser";
import { BossFightScene } from "../game/BossFightScene";
import { WalletHeader } from "../components";
import "./BossFightPage.css";

const SERVER_URL = "ws://localhost:3001/ws";

export default function BossFightPage() {
  const account = useCurrentAccount();
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameInstanceRef = useRef<Phaser.Game | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [serverStatus, setServerStatus] = useState<
    "checking" | "online" | "offline"
  >("checking");

  // Check server status
  useEffect(() => {
    const checkServer = async () => {
      try {
        const res = await fetch("http://localhost:3001/health");
        if (res.ok) {
          setServerStatus("online");
        } else {
          setServerStatus("offline");
        }
      } catch {
        setServerStatus("offline");
      }
    };

    checkServer();
    const interval = setInterval(checkServer, 5000);
    return () => clearInterval(interval);
  }, []);

  // Initialize Phaser game
  useEffect(() => {
    if (!gameContainerRef.current || serverStatus !== "online") return;

    // Create canvas
    const canvas = document.createElement("canvas");
    canvas.id = "boss-fight-canvas";
    gameContainerRef.current.appendChild(canvas);

    // Get container size
    const rect = gameContainerRef.current.getBoundingClientRect();

    // Create Phaser game
    const game = new Phaser.Game({
      type: Phaser.WEBGL,
      width: rect.width,
      height: rect.height,
      parent: gameContainerRef.current,
      canvas,
      backgroundColor: "#1a2a3a",
      physics: {
        default: "arcade",
        arcade: { gravity: { x: 0, y: 0 }, debug: false },
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [BossFightScene],
    });

    // Start the scene with wallet address
    game.scene.start("BossFightScene", {
      walletAddress: account?.address || `guest_${Date.now()}`,
      serverUrl: SERVER_URL,
    });

    gameInstanceRef.current = game;

    return () => {
      game.destroy(true);
      gameInstanceRef.current = null;
    };
  }, [account?.address, serverStatus]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (gameInstanceRef.current && gameContainerRef.current) {
        const rect = gameContainerRef.current.getBoundingClientRect();
        gameInstanceRef.current.scale.resize(rect.width, rect.height);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="boss-fight-page">
      <WalletHeader />

      <div className="boss-fight-header">
        <Link to="/" className="back-button">
          ← Back
        </Link>
        <h1>🐉 Boss Fight Arena</h1>
        <div className="server-status">
          <span className={`status-indicator ${serverStatus}`}></span>
          Server: {serverStatus === "checking" ? "Checking..." : serverStatus}
        </div>
      </div>

      {serverStatus === "offline" && (
        <div className="server-offline-notice">
          <h2>⚠️ Game Server Offline</h2>
          <p>The game server is not running. Please start it first:</p>
          <code>cd server && pnpm dev</code>
          <p>The server should run on http://localhost:3001</p>
        </div>
      )}

      {serverStatus === "online" && (
        <div className="game-container" ref={gameContainerRef}>
          {/* Phaser game will be mounted here */}
        </div>
      )}

      <div className="boss-fight-info">
        <div className="info-card">
          <h3>How to Play</h3>
          <ul>
            <li>🎮 Arrow Keys - Move your character</li>
            <li>⚔️ Space - Attack the boss</li>
            <li>🔴 Avoid red AOE zones!</li>
            <li>💀 Work together to defeat the boss</li>
          </ul>
        </div>
        <div className="info-card">
          <h3>Rewards</h3>
          <ul>
            <li>Deal damage to earn contribution points</li>
            <li>More damage = bigger reward share</li>
            <li>Rewards will be claimable on-chain</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
