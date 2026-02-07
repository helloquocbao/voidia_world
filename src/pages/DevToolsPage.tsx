import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { WalletHeader } from "../components";
import {
  PACKAGE_ID,
  TREASURY_CAP_ID,
  POWER_STONE_TREASURY_CAP_ID,
} from "../chain/config";
import "./DevToolsPage.css";

export default function DevToolsPage() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } =
    useSignAndExecuteTransaction();

  const [tokenAmount, setTokenAmount] = useState(100);
  const [stoneAmount, setStoneAmount] = useState(100);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleMintToken() {
    if (!account?.address || !PACKAGE_ID || !TREASURY_CAP_ID) {
      showToast("Missing wallet or config", "error");
      return;
    }

    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::voidia_coin::mint_token`,
        arguments: [tx.object(TREASURY_CAP_ID), tx.pure.u64(tokenAmount)],
      });

      await signAndExecute(
        { transaction: tx },
        {
          onSuccess: () => {
            showToast(`Minted ${tokenAmount} VOIDIA tokens!`, "success");
          },
          onError: (err) => {
            showToast(`Error: ${err.message}`, "error");
          },
        },
      );
    } catch (err) {
      showToast(`Error: ${(err as Error).message}`, "error");
    }
  }

  async function handleMintStone() {
    if (!account?.address || !PACKAGE_ID || !POWER_STONE_TREASURY_CAP_ID) {
      showToast("Missing wallet or config", "error");
      return;
    }

    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::power_stone::mint_stone`,
        arguments: [
          tx.object(POWER_STONE_TREASURY_CAP_ID),
          tx.pure.u64(stoneAmount),
        ],
      });

      await signAndExecute(
        { transaction: tx },
        {
          onSuccess: () => {
            showToast(`Minted ${stoneAmount} Power Stones!`, "success");
          },
          onError: (err) => {
            showToast(`Error: ${err.message}`, "error");
          },
        },
      );
    } catch (err) {
      showToast(`Error: ${(err as Error).message}`, "error");
    }
  }

  const isConfigured =
    PACKAGE_ID && TREASURY_CAP_ID && POWER_STONE_TREASURY_CAP_ID;

  return (
    <div className="dev-tools-page">
      <WalletHeader />

      <div className="dev-tools-container">
        <Link to="/" className="back-link">
          ← Back to Home
        </Link>

        <h1 className="dev-tools-title">🛠️ Dev Tools</h1>
        <p className="dev-tools-subtitle">
          Admin tools for minting tokens (testnet only)
        </p>

        {!account?.address ? (
          <div className="warning-box">
            ⚠️ Please connect your wallet to use dev tools
          </div>
        ) : !isConfigured ? (
          <div className="warning-box">
            ⚠️ Missing configuration. Check .env file for:
            <ul>
              <li>VITE_PACKAGE_ID: {PACKAGE_ID || "❌ Missing"}</li>
              <li>VITE_TREASURY_CAP: {TREASURY_CAP_ID || "❌ Missing"}</li>
              <li>
                VITE_POWER_STONE_TREASURY_CAP:{" "}
                {POWER_STONE_TREASURY_CAP_ID || "❌ Missing"}
              </li>
            </ul>
          </div>
        ) : (
          <div className="mint-sections">
            {/* Mint VOIDIA Token */}
            <div className="mint-card">
              <div className="mint-card-header">
                <span className="mint-icon">🪙</span>
                <h2>VOIDIA Token</h2>
              </div>
              <p className="mint-desc">
                Mint VOIDIA tokens to your wallet for testing
              </p>

              <div className="mint-input-group">
                <label>Amount to mint:</label>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={tokenAmount}
                  onChange={(e) =>
                    setTokenAmount(Math.max(1, Number(e.target.value)))
                  }
                />
              </div>

              <button
                className="mint-btn mint-btn-token"
                onClick={handleMintToken}
                disabled={isPending}
              >
                {isPending ? "Minting..." : `Mint ${tokenAmount} VOIDIA`}
              </button>
            </div>

            {/* Mint Power Stone */}
            <div className="mint-card">
              <div className="mint-card-header">
                <span className="mint-icon">💎</span>
                <h2>Power Stone</h2>
              </div>
              <p className="mint-desc">
                Mint Power Stones to your wallet for testing upgrades
              </p>

              <div className="mint-input-group">
                <label>Amount to mint:</label>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={stoneAmount}
                  onChange={(e) =>
                    setStoneAmount(Math.max(1, Number(e.target.value)))
                  }
                />
              </div>

              <button
                className="mint-btn mint-btn-stone"
                onClick={handleMintStone}
                disabled={isPending}
              >
                {isPending ? "Minting..." : `Mint ${stoneAmount} Stones`}
              </button>
            </div>
          </div>
        )}

        {/* Config Info */}
        <div className="config-info">
          <h3>📋 Contract Config</h3>
          <div className="config-list">
            <div className="config-item">
              <span className="config-label">Package ID:</span>
              <code className="config-value">{PACKAGE_ID || "N/A"}</code>
            </div>
            <div className="config-item">
              <span className="config-label">Treasury Cap (VOIDIA):</span>
              <code className="config-value">{TREASURY_CAP_ID || "N/A"}</code>
            </div>
            <div className="config-item">
              <span className="config-label">Treasury Cap (Stone):</span>
              <code className="config-value">
                {POWER_STONE_TREASURY_CAP_ID || "N/A"}
              </code>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.message}</div>
      )}
    </div>
  );
}
