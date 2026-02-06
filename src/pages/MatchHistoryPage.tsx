import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { WalletHeader } from "../components";
import {
  bossApi,
  MatchSummary,
  MatchDetails,
  PlayerContribution,
  RewardEntry,
} from "../services/bossApi";
import "./MatchHistoryPage.css";

export default function MatchHistoryPage() {
  const { matchId } = useParams<{ matchId?: string }>();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<MatchDetails | null>(null);
  const [contributions, setContributions] = useState<PlayerContribution[]>([]);
  const [rewards, setRewards] = useState<RewardEntry[]>([]);
  const [walrusUrl, setWalrusUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMatches();
  }, []);

  useEffect(() => {
    if (matchId) {
      fetchMatchDetails(matchId);
    } else {
      setSelectedMatch(null);
    }
  }, [matchId]);

  const fetchMatches = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await bossApi.fetchMatches(50);
      setMatches(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch matches");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMatchDetails = async (id: string) => {
    setIsLoadingDetails(true);
    try {
      const data = await bossApi.fetchMatchDetails(id);
      setSelectedMatch(data.match);
      setContributions(data.contributions);
      setRewards(data.rewards);
      setWalrusUrl(data.walrusUrl);
    } catch (err) {
      console.error("Failed to fetch match details:", err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
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

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  return (
    <div className="match-history-page">
      <WalletHeader />

      <div className="match-history-header">
        <Link to="/" className="back-button">
          ← Back
        </Link>
        <h1>📜 Match History</h1>
        <button
          onClick={fetchMatches}
          className="refresh-btn"
          disabled={isLoading}
        >
          🔄
        </button>
      </div>

      <div className="match-history-content">
        {/* Match List */}
        <div className="match-list-section">
          <h2>Recent Matches</h2>

          {isLoading ? (
            <div className="match-loading">
              <div className="spinner"></div>
              <span>Loading matches...</span>
            </div>
          ) : error ? (
            <div className="match-error">
              <span>❌ {error}</span>
              <button onClick={fetchMatches}>Retry</button>
            </div>
          ) : matches.length === 0 ? (
            <div className="match-empty">
              <span className="empty-icon">🎮</span>
              <p>No matches found</p>
              <Link to="/boss-fight" className="play-btn">
                Play Now
              </Link>
            </div>
          ) : (
            <ul className="match-list">
              {matches.map((match) => (
                <li
                  key={match.matchId}
                  className={`match-item ${selectedMatch?.matchId === match.matchId ? "active" : ""}`}
                >
                  <Link to={`/matches/${match.matchId}`} className="match-link">
                    <div className="match-result">
                      {match.isVictory ? (
                        <span className="victory">🏆 VICTORY</span>
                      ) : (
                        <span className="defeat">💀 DEFEAT</span>
                      )}
                    </div>
                    <div className="match-info">
                      <div className="match-id">
                        #{match.matchId.slice(0, 8)}
                      </div>
                      <div className="match-meta">
                        <span>👥 {match.playerCount}</span>
                        <span>⏱️ {formatDuration(match.duration)}</span>
                      </div>
                    </div>
                    <div className="match-date">
                      {formatDate(match.startedAt)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Match Details */}
        <div className="match-details-section">
          {matchId ? (
            isLoadingDetails ? (
              <div className="details-loading">
                <div className="spinner"></div>
                <span>Loading details...</span>
              </div>
            ) : selectedMatch ? (
              <>
                <div className="details-header">
                  <h2>
                    Match #{selectedMatch.matchId.slice(0, 8)}
                    {selectedMatch.isVictory ? (
                      <span className="victory-badge">🏆 Victory</span>
                    ) : (
                      <span className="defeat-badge">💀 Defeat</span>
                    )}
                  </h2>
                  {walrusUrl && (
                    <a
                      href={walrusUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="walrus-link"
                    >
                      📹 View Replay
                    </a>
                  )}
                </div>

                <div className="details-stats">
                  <div className="stat-card">
                    <div className="stat-label">Duration</div>
                    <div className="stat-value">
                      {formatDuration(selectedMatch.duration)}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Players</div>
                    <div className="stat-value">
                      {selectedMatch.playerCount}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Started</div>
                    <div className="stat-value">
                      {formatDate(selectedMatch.startedAt)}
                    </div>
                  </div>
                </div>

                <div className="contributions-section">
                  <h3>🏅 Player Contributions</h3>
                  <table className="contributions-table">
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Damage</th>
                        <th>Deaths</th>
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contributions
                        .sort((a, b) => b.score - a.score)
                        .map((contrib, index) => (
                          <tr key={contrib.playerId}>
                            <td>
                              <span className="contrib-rank">#{index + 1}</span>
                              <span className="contrib-address">
                                {contrib.walletAddress.slice(0, 6)}...
                                {contrib.walletAddress.slice(-4)}
                              </span>
                            </td>
                            <td className="damage">
                              {formatNumber(contrib.damage)}
                            </td>
                            <td className="deaths">{contrib.deaths}</td>
                            <td className="score">
                              {formatNumber(contrib.score)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {rewards.length > 0 && (
                  <div className="rewards-section">
                    <h3>🎁 Rewards Distributed</h3>
                    <ul className="rewards-list">
                      {rewards.map((reward, index) => (
                        <li key={index} className="reward-item">
                          <span className="reward-player">
                            {reward.walletAddress.slice(0, 6)}...
                            {reward.walletAddress.slice(-4)}
                          </span>
                          <span className="reward-amount">
                            {reward.type === "tokens"
                              ? `${(reward.amount / 1_000_000_000).toFixed(2)} VOIDIA`
                              : `${reward.amount} 💎`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="details-not-found">
                <span>❌ Match not found</span>
              </div>
            )
          ) : (
            <div className="details-placeholder">
              <span className="placeholder-icon">👈</span>
              <p>Select a match to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
