import { useEffect, useState } from "react";
import "./WorldSelector.css";

export function WorldSelector({ worlds = [], onSelectWorld }) {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = (e) => {
      setScrollY(window.scrollY);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="world-selector-container">
      {/* Sky background with parallax clouds */}
      <div className="sky-background">
        <div className="sky-gradient" />
        <div
          className="cloud"
          style={{ transform: `translateX(${scrollY * 0.1}px)` }}
        />
        <div
          className="cloud cloud--far"
          style={{ transform: `translateX(${scrollY * 0.05}px)` }}
        />
        <div
          className="cloud cloud--far-2"
          style={{ transform: `translateX(${scrollY * -0.05}px)` }}
        />
      </div>

      {/* Floating islands grid */}
      <div className="islands-container">
        {worlds.map((world, index) => (
          <div
            key={world.id}
            className="island-card"
            onClick={() => onSelectWorld(world.id)}
            style={{
              animationDelay: `${index * 0.1}s`,
              transform: `translateY(${scrollY * (0.02 + index * 0.01)}px)`,
            }}
          >
            <div className="island-shadow" />
            <div className="island-base">
              <div className="island-surface" />
              <div className="island-glow" />
              <div className="island-content">
                <h3 className="island-name">{world.name}</h3>
                <p className="island-id">{world.id.slice(0, 8)}…</p>
              </div>
            </div>
            <div className="island-hover-effect" />
          </div>
        ))}
      </div>

      {/* Floating particles */}
      <div className="particles">
        {[...Array(15)].map((_, i) => (
          <div
            key={i}
            className="particle"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${3 + Math.random() * 4}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
