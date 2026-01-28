import { Routes, Route } from "react-router-dom";
import GamePage from "./pages/GamePage";
import EditorGame from "./pages/EditorGame";
import LandingPage from "./pages/LandingPage";
import Marketplace from "./pages/Marketplace";
import PresalePage from "./pages/PresalePage";
import UpgradePage from "./pages/UpgradePage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/editor" element={<EditorGame />} />
      <Route path="/game" element={<GamePage />} />
      <Route path="/marketplace" element={<Marketplace />} />
      <Route path="/presale" element={<PresalePage />} />
      <Route path="/upgrade" element={<UpgradePage />} />
    </Routes>
  );
}
