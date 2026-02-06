import { useState, useEffect } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import {
  bossApi,
  PendingReward,
  SignedClaimPayload,
} from "../services/bossApi";
import "./RewardsModal.css";

interface RewardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClaim?: (
    rewardId: string,
    signedPayload: SignedClaimPayload,
  ) => Promise<void>;
}

export function RewardsModal({ isOpen, onClose, onClaim }: RewardsModalProps) {
  const account = useCurrentAccount();
  const [rewards, setRewards] = useState<PendingReward[]>([]);
  const [signedPayloads, setSignedPayloads] = useState<
    Map<string, SignedClaimPayload>
  >(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  // Fetch rewards when modal opens
  useEffect(() => {
    if (isOpen && account?.address) {
      fetchRewards();
    }
  }, [isOpen, account?.address]);

  const fetchRewards = async () => {
    if (!account?.address) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await bossApi.fetchPendingRewards(account.address);
      setRewards(data.rewards);

      // Create a map of signed payloads for quick lookup
      const payloadMap = new Map<string, SignedClaimPayload>();
      for (const payload of data.signedPayloads) {
        payloadMap.set(payload.rewardId, payload);
      }
      setSignedPayloads(payloadMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch rewards");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClaim = async (reward: PendingReward) => {
    if (!onClaim || claimingId) return;

    const signedPayload = signedPayloads.get(reward.id);
    if (!signedPayload) {
      setError("No signed payload found for this reward");
      return;
    }

    setClaimingId(reward.id);
    setError(null);

    try {
      await onClaim(reward.id, signedPayload);
      // Remove claimed reward from list
      setRewards((prev) => prev.filter((r) => r.id !== reward.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim reward");
    } finally {
      setClaimingId(null);
    }
  };

  const formatAmount = (amount: number, type: string) => {
    if (type === "tokens") {
      // Assume 9 decimals for SUI tokens
      return (amount / 1_000_000_000).toFixed(2);
    }
    return amount.toString();
  };

  const formatExpiry = (expiry: number) => {
    const now = Date.now();
    const remaining = expiry - now;

    if (remaining <= 0) return "Expired";

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes}m`;
  };

  const isExpired = (expiry: number) => expiry <= Date.now();

  if (!isOpen) return null;

  const totalTokens = rewards
    .filter((r) => r.type === "tokens" && !isExpired(r.expiry))
    .reduce((sum, r) => sum + r.amount, 0);

  const totalStones = rewards
    .filter((r) => r.type === "power_stone" && !isExpired(r.expiry))
    .reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="rewards-modal-overlay" onClick={onClose}>
      <div className="rewards-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rewards-modal__header">
          <h2>🎁 Pending Rewards</h2>
          <button className="rewards-modal__close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="rewards-modal__summary">
          <div className="rewards-summary-item">
            <span className="rewards-summary-label">Total Tokens</span>
            <span className="rewards-summary-value">
              {formatAmount(totalTokens, "tokens")} VOIDIA
            </span>
          </div>
          <div className="rewards-summary-item">
            <span className="rewards-summary-label">Power Stones</span>
            <span className="rewards-summary-value">{totalStones} 💎</span>
          </div>
        </div>

        {error && <div className="rewards-modal__error">{error}</div>}

        <div className="rewards-modal__content">
          {isLoading ? (
            <div className="rewards-modal__loading">
              <div className="spinner"></div>
              <span>Loading rewards...</span>
            </div>
          ) : rewards.length === 0 ? (
            <div className="rewards-modal__empty">
              <span className="rewards-empty-icon">📭</span>
              <p>No pending rewards</p>
              <p className="rewards-empty-hint">
                Play boss fights to earn rewards!
              </p>
            </div>
          ) : (
            <ul className="rewards-list">
              {rewards.map((reward) => {
                const expired = isExpired(reward.expiry);
                const isClaiming = claimingId === reward.id;

                return (
                  <li
                    key={reward.id}
                    className={`reward-item ${expired ? "reward-item--expired" : ""}`}
                  >
                    <div className="reward-item__icon">
                      {reward.type === "tokens" ? "🪙" : "💎"}
                    </div>
                    <div className="reward-item__info">
                      <div className="reward-item__type">
                        {reward.type === "tokens"
                          ? "VOIDIA Tokens"
                          : "Power Stone"}
                      </div>
                      <div className="reward-item__amount">
                        {formatAmount(reward.amount, reward.type)}
                        {reward.type === "tokens" ? " VOIDIA" : " stones"}
                      </div>
                      <div className="reward-item__match">
                        Match: {reward.matchId.slice(0, 8)}...
                      </div>
                    </div>
                    <div className="reward-item__expiry">
                      <span className={expired ? "expired" : ""}>
                        {formatExpiry(reward.expiry)}
                      </span>
                    </div>
                    <button
                      className={`reward-item__claim ${isClaiming ? "claiming" : ""}`}
                      onClick={() => handleClaim(reward)}
                      disabled={expired || isClaiming || !onClaim}
                    >
                      {isClaiming ? (
                        <>
                          <span className="spinner-small"></span>
                          Claiming...
                        </>
                      ) : expired ? (
                        "Expired"
                      ) : (
                        "Claim"
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rewards-modal__footer">
          <button
            className="rewards-modal__refresh"
            onClick={fetchRewards}
            disabled={isLoading}
          >
            🔄 Refresh
          </button>
          {rewards.length > 0 && onClaim && (
            <button
              className="rewards-modal__claim-all"
              disabled={
                isLoading ||
                !!claimingId ||
                rewards.every((r) => isExpired(r.expiry))
              }
            >
              Claim All ({rewards.filter((r) => !isExpired(r.expiry)).length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
