import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { WalletHeader, RewardsModal } from "../components";
import { useClaimReward, useRewardBalance } from "../hooks";
import {
  bossApi,
  PlayerStats,
  RecentMatch,
  SignedClaimPayload,
} from "../services/bossApi";
import "./PlayerStatsPage.css";

export default function PlayerStatsPage() {
  const account = useCurrentAccount();
  const { balance, refetch: refetchBalance } = useRewardBalance();
  const { claimWithPayload, isLoading: isClaiming } = useClaimReward();

  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [recentMatches, setRecentMatches] = useState<RecentMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRewardsOpen, setIsRewardsOpen] = useState(false);

  useEffect(() => {
    if (account?.address) {
      fetchStats();
    }
  }, [account?.address]);

  const fetchStats = async () => {
    if (!account?.address) return;

    setIsLoading(true);
    setError(null);
    try {
      const data = await bossApi.fetchPlayerStats(account.address);
      setStats(data.stats);
      setRecentMatches(data.recentMatches);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch stats");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClaim = async (
    rewardId: string,
    signedPayload: SignedClaimPayload,
  ) => {
    const result = await claimWithPayload(rewardId, signedPayload);
    if (result.success) {
      // Refresh stats and balance
      fetchStats();
      refetchBalance();
    } else {
      throw new Error(result.error);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!account?.address) {
    return (
      <div className="player-stats-page">
        <WalletHeader />
        <div className="player-stats-content">
          <div className="connect-prompt">
            <span className="prompt-icon">👛</span>
            <h2>Connect Your Wallet</h2>
            <p>Connect your wallet to view your stats and claim rewards</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="player-stats-page">
      <WalletHeader />

      <div className="player-stats-header">
        <Link to="/" className="back-button">
          ← Back
        </Link>
        <h1>👤 My Profile</h1>
        <button
          onClick={fetchStats}
          className="refresh-btn"
          disabled={isLoading}
        >
          🔄
        </button>
      </div>

      <div className="player-stats-content">
        {isLoading ? (
          <div className="stats-loading">
            <div className="spinner"></div>
            <span>Loading your stats...</span>
          </div>
        ) : error ? (
          <div className="stats-error">
            <span>❌ {error}</span>
            <button onClick={fetchStats}>Retry</button>
          </div>
        ) : stats ? (
          <>
            {/* Profile Header */}
            <div className="profile-header">
              <div className="profile-avatar">
                {account.address.slice(2, 4).toUpperCase()}
              </div>
              <div className="profile-info">
                <div className="profile-address">
                  {account.address.slice(0, 8)}...{account.address.slice(-6)}
                </div>
                <div className="profile-balance">
                  <span className="balance-value">{formatNumber(balance)}</span>
                  <span className="balance-label">VOIDIA</span>
                </div>
              </div>
              <button
                className="claim-rewards-btn"
                onClick={() => setIsRewardsOpen(true)}
              >
                🎁 Claim Rewards
                {stats.pendingRewards > 0 && (
                  <span className="pending-badge">{stats.pendingRewards}</span>
                )}
              </button>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid">
              <div className="stat-card stat-matches">
                <div className="stat-icon">🎮</div>
                <div className="stat-content">
                  <div className="stat-value">{stats.matchCount}</div>
                  <div className="stat-label">Matches Played</div>
                </div>
              </div>

              <div className="stat-card stat-damage">
                <div className="stat-icon">⚔️</div>
                <div className="stat-content">
                  <div className="stat-value">
                    {formatNumber(stats.totalDamage)}
                  </div>
                  <div className="stat-label">Total Damage</div>
                </div>
              </div>

              <div className="stat-card stat-score">
                <div className="stat-icon">🏆</div>
                <div className="stat-content">
                  <div className="stat-value">
                    {formatNumber(stats.totalScore)}
                  </div>
                  <div className="stat-label">Total Score</div>
                </div>
              </div>

              <div className="stat-card stat-deaths">
                <div className="stat-icon">💀</div>
                <div className="stat-content">
                  <div className="stat-value">{stats.totalDeaths}</div>
                  <div className="stat-label">Total Deaths</div>
                </div>
              </div>

              <div className="stat-card stat-avg">
                <div className="stat-icon">📊</div>
                <div className="stat-content">
                  <div className="stat-value">
                    {formatNumber(stats.avgDamagePerMatch)}
                  </div>
                  <div className="stat-label">Avg Damage/Match</div>
                </div>
              </div>

              <div className="stat-card stat-rewards">
                <div className="stat-icon">🎁</div>
                <div className="stat-content">
                  <div className="stat-value">{stats.claimedRewards}</div>
                  <div className="stat-label">Rewards Claimed</div>
                </div>
              </div>
            </div>

            {/* Recent Matches */}
            <div className="recent-matches-section">
              <div className="section-header">
                <h2>📜 Recent Matches</h2>
                <Link to="/matches" className="view-all">
                  View All →
                </Link>
              </div>

              {recentMatches.length === 0 ? (
                <div className="no-matches">
                  <p>No recent matches</p>
                  <Link to="/boss-fight" className="play-btn">
                    Play Now
                  </Link>
                </div>
              ) : (
                <div className="recent-matches-list">
                  {recentMatches.map((match) => (
                    <Link
                      key={match.matchId}
                      to={`/matches/${match.matchId}`}
                      className="recent-match-card"
                    >
                      <div className="match-id">
                        #{match.matchId.slice(0, 8)}
                      </div>
                      <div className="match-stats">
                        <span className="damage">
                          ⚔️ {formatNumber(match.damage)}
                        </span>
                        <span className="score">
                          🏆 {formatNumber(match.score)}
                        </span>
                        <span className="deaths">💀 {match.deaths}</span>
                      </div>
                      <div className="match-date">
                        {formatDate(match.createdAt)}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="quick-actions">
              <Link to="/boss-fight" className="action-btn action-play">
                🎮 Play Boss Fight
              </Link>
              <Link to="/leaderboard" className="action-btn action-leaderboard">
                🏆 Leaderboard
              </Link>
              <Link to="/matches" className="action-btn action-history">
                📜 Match History
              </Link>
            </div>
          </>
        ) : (
          <div className="stats-empty">
            <span className="empty-icon">📊</span>
            <p>No stats available</p>
            <p className="empty-hint">
              Play some boss fights to see your stats!
            </p>
            <Link to="/boss-fight" className="play-btn">
              Play Now
            </Link>
          </div>
        )}
      </div>

      <RewardsModal
        isOpen={isRewardsOpen}
        onClose={() => setIsRewardsOpen(false)}
        onClaim={handleClaim}
      />
    </div>
  );
}
