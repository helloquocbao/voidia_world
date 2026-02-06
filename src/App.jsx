import { Routes, Route } from "react-router-dom";
import GamePage from "./pages/GamePage";
import EditorGame from "./pages/EditorGame";
import LandingPage from "./pages/LandingPage";
import Marketplace from "./pages/Marketplace";
import PresalePage from "./pages/PresalePage";
import UpgradePage from "./pages/UpgradePage";
import PortfolioPage from "./pages/PortfolioPage";
import BossFightPage from "./pages/BossFightPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import MatchHistoryPage from "./pages/MatchHistoryPage";
import PlayerStatsPage from "./pages/PlayerStatsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/editor" element={<EditorGame />} />
      <Route path="/game" element={<GamePage />} />
      <Route path="/boss-fight" element={<BossFightPage />} />
      <Route path="/leaderboard" element={<LeaderboardPage />} />
      <Route path="/matches" element={<MatchHistoryPage />} />
      <Route path="/matches/:matchId" element={<MatchHistoryPage />} />
      <Route path="/profile" element={<PlayerStatsPage />} />
      <Route path="/marketplace" element={<Marketplace />} />
      <Route path="/presale" element={<PresalePage />} />
      <Route path="/upgrade" element={<UpgradePage />} />
      <Route path="/portfolio" element={<PortfolioPage />} />
    </Routes>
  );
}
