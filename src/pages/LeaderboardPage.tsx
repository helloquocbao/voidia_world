import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { WalletHeader } from "../components";
import { bossApi, LeaderboardEntry } from "../services/bossApi";
import "./LeaderboardPage.css";

export default function LeaderboardPage() {
  const account = useCurrentAccount();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    fetchLeaderboard();
  }, [limit]);

  const fetchLeaderboard = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await bossApi.fetchLeaderboard(limit);
      setLeaderboard(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch leaderboard",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const formatAddress = (address: string) => {
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const getRankEmoji = (rank: number) => {
    switch (rank) {
      case 1:
        return "🥇";
      case 2:
        return "🥈";
      case 3:
        return "🥉";
      default:
        return `#${rank}`;
    }
  };

  const isCurrentUser = (address: string) => {
    return account?.address?.toLowerCase() === address.toLowerCase();
  };

  return (
    <div className="leaderboard-page">
      <WalletHeader />

      <div className="leaderboard-header">
        <Link to="/" className="back-button">
          ← Back
        </Link>
        <h1>🏆 Leaderboard</h1>
        <div className="leaderboard-controls">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="limit-select"
          >
            <option value={25}>Top 25</option>
            <option value={50}>Top 50</option>
            <option value={100}>Top 100</option>
          </select>
          <button
            onClick={fetchLeaderboard}
            className="refresh-btn"
            disabled={isLoading}
          >
            🔄
          </button>
        </div>
      </div>

      <div className="leaderboard-content">
        {isLoading ? (
          <div className="leaderboard-loading">
            <div className="spinner"></div>
            <span>Loading leaderboard...</span>
          </div>
        ) : error ? (
          <div className="leaderboard-error">
            <span>❌ {error}</span>
            <button onClick={fetchLeaderboard}>Retry</button>
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="leaderboard-empty">
            <span className="empty-icon">📊</span>
            <p>No players yet</p>
            <p className="empty-hint">Be the first to play a boss fight!</p>
            <Link to="/boss-fight" className="play-btn">
              Play Now
            </Link>
          </div>
        ) : (
          <>
            {/* Top 3 Podium */}
            <div className="leaderboard-podium">
              {leaderboard.slice(0, 3).map((entry, index) => {
                const positions = [1, 0, 2]; // Order: 2nd, 1st, 3rd
                const rank = positions[index] + 1;
                const player = leaderboard[positions[index]];
                if (!player) return null;

                return (
                  <div
                    key={player.walletAddress}
                    className={`podium-item podium-rank-${rank} ${isCurrentUser(player.walletAddress) ? "podium-current" : ""}`}
                  >
                    <div className="podium-rank">{getRankEmoji(rank)}</div>
                    <div className="podium-avatar">
                      {player.walletAddress.slice(2, 4).toUpperCase()}
                    </div>
                    <div className="podium-address">
                      {formatAddress(player.walletAddress)}
                    </div>
                    <div className="podium-score">
                      {formatNumber(player.totalScore)} pts
                    </div>
                    <div className="podium-stats">
                      <span>⚔️ {formatNumber(player.totalDamage)}</span>
                      <span>🎮 {player.matchCount}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Full Table */}
            <div className="leaderboard-table-container">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>Score</th>
                    <th>Damage</th>
                    <th>Matches</th>
                    <th>Deaths</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, index) => (
                    <tr
                      key={entry.walletAddress}
                      className={
                        isCurrentUser(entry.walletAddress) ? "current-user" : ""
                      }
                    >
                      <td className="rank-cell">
                        <span className={`rank rank-${index + 1}`}>
                          {getRankEmoji(index + 1)}
                        </span>
                      </td>
                      <td className="player-cell">
                        <div className="player-avatar">
                          {entry.walletAddress.slice(2, 4).toUpperCase()}
                        </div>
                        <span className="player-address">
                          {formatAddress(entry.walletAddress)}
                          {isCurrentUser(entry.walletAddress) && (
                            <span className="you-badge">YOU</span>
                          )}
                        </span>
                      </td>
                      <td className="score-cell">
                        {formatNumber(entry.totalScore)}
                      </td>
                      <td className="damage-cell">
                        {formatNumber(entry.totalDamage)}
                      </td>
                      <td className="matches-cell">{entry.matchCount}</td>
                      <td className="deaths-cell">{entry.totalDeaths}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
