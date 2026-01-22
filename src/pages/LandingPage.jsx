import { useState } from "react";
import { Link } from "react-router-dom";
import { WalletHeader } from "../components";
import "./LandingPage.css";

const features = [
  {
    title: "🏔️ Stone Chunks",
    description:
      "Mint 5×5 rock tiles as NFTs. Build floating islands in the sky.",
  },
  {
    title: "🎨 Carve & Paint",
    description:
      "Edit tiles live on-chain. Every pixel you place is truly yours.",
  },
  {
    title: "⚔️ Play & Earn",
    description:
      "Explore on-chain worlds. Find hidden keys and claim CHUNK rewards.",
  },
];

const gameFeatures = [
  {
    icon: "🌍",
    title: "On-Chain Worlds",
    description:
      "Every map chunk lives permanently on Sui blockchain. Trade or expand your territory.",
  },
  {
    icon: "🎮",
    title: "Adventure Mode",
    description:
      "WASD movement, combat system. Explore worlds built by the community.",
  },
  {
    icon: <img src="https://ik.imagekit.io/huubao/chunk_coin.png" alt="logo" className="w-12 h-12 mt-3" />,
    title: "Token Rewards",
    description:
      "Find hidden keys, claim CHUNK tokens, and earn while you play.",
  },
  {
    icon: "🔧",
    title: "Map Editor",
    description:
      "Powerful tile editor with decoration layers. Design your dream world.",
  },
];

export default function LandingPage() {
  return (
    <div className="landing">
      <div className="landing__bg">
        <span className="landing__sky" />
        <span className="landing__sun" />
        <span className="landing__cloud landing__cloud--a" />
        <span className="landing__cloud landing__cloud--b" />
        <span className="landing__cloud landing__cloud--c" />
        <span className="landing__mist" />
      </div>

      <div className="landing__content">
        {/* Navigation */}
        <header
          className="landing__nav landing__reveal"
          style={{ "--delay": "0s" }}
        >
          <div className="brand">
            <img src="https://ik.imagekit.io/huubao/chunk_coin.png" alt="logo" className="w-12 h-12" />
            <div>
              <div className="brand__name">Chunk World</div>
              <div className="brand__tag">Sky Adventures on Sui</div>
            </div>
          </div>

          <nav className="landing__links">
            <Link to="/editor">Editor</Link>
            <Link to="/game">Play Now</Link>
            <Link to="/marketplace">Marketplace</Link>
          </nav>

          <WalletHeader />
        </header>

        {/* Hero Section */}
        <section className="landing__hero">
          <div className="hero__copy">
            <div
              className="hero__badge landing__reveal"
              style={{ "--delay": "0.1s" }}
            >
              <span className="badge__dot" />
              <span>Powered by Sui Blockchain</span>
            </div>

            <h1
              className="hero__title landing__reveal"
              style={{ "--delay": "0.15s" }}
            >
              Build your <span className="hero__accent">sky world</span>, one
              chunk at a time.
            </h1>

            <p
              className="hero__subtitle landing__reveal"
              style={{ "--delay": "0.2s" }}
            >
              Claim rocky chunks, carve tiles, and trade them as NFTs. Every
              update lands on Sui and appears instantly in the game loop. Your
              creativity, permanently on-chain.
            </p>

            <div
              className="hero__cta landing__reveal"
              style={{ "--delay": "0.25s" }}
            >
              <Link className="btn btn--solid" to="/game">
                🎮 Launch Game
              </Link>
              <Link className="btn btn--ghost" to="/editor">
                🔧 Open Editor
              </Link>
            </div>

            <div
              className="hero__features landing__reveal"
              style={{ "--delay": "0.3s" }}
            >
              {features.map((feature) => (
                <div key={feature.title} className="feature">
                  <div className="feature__title">{feature.title}</div>
                  <div className="feature__desc">{feature.description}</div>
                </div>
              ))}
            </div>
          </div>

          <div
            className="hero__panel landing__reveal"
            style={{ "--delay": "0.2s" }}
          >
            <div className="panel__header">
              <div>
                <div className="panel__eyebrow">Character Preview</div>
                <div className="panel__title">Your Hero Awaits</div>
              </div>
              <div className="panel__tag">Sui</div>
            </div>

            <div className="panel__preview">
              {/* Character animation is in CSS */}
            </div>

            <div className="panel__highlights">
              <div className="panel__highlight">
                <span className="highlight__icon">⛏️</span>
                <span>5×5 Chunk Tiles</span>
              </div>
              <div className="panel__highlight">
                <span className="highlight__icon">🔗</span>
                <span>Fully On-Chain</span>
              </div>
              <div className="panel__highlight">
                <span className="highlight__icon">💰</span>
                <span>Earn CHUNK Tokens</span>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid Section */}
        <section
          className="landing__features landing__reveal"
          style={{ "--delay": "0.35s" }}
        >
          <div className="features__header">
            <h2 className="features__title">Why Chunk World?</h2>
            <p className="features__subtitle">
              A new kind of gaming experience where players truly own their
              world.
            </p>
          </div>
          <div className="features__grid">
            {gameFeatures.map((feature) => (
              <div key={feature.title} className="feature-card">
                <div className="feature-card__icon flex justify-center">{feature.icon}</div>
                <div className="feature-card__title">{feature.title}</div>
                <div className="feature-card__desc">{feature.description}</div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section
          className="landing__cta landing__reveal"
          style={{ "--delay": "0.4s" }}
        >
          <div className="cta__content">
            <h2 className="cta__title">Ready to Build?</h2>
            <p className="cta__subtitle">
              Connect your wallet and start creating your piece of the sky
              world.
            </p>
            <div className="cta__actions">
              <Link className="btn btn--solid" to="/game">
                Start Playing
              </Link>
              <Link className="btn btn--ghost" to="/editor">
                Create Maps
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer
          className="landing__footer landing__reveal"
          style={{ "--delay": "0.45s" }}
        >
          <div>Build together. Own your world. Play on Sui.</div>
          <div className="landing__foot-links">
            <Link to="/editor">Editor</Link>
            <Link to="/game">Play</Link>
            <Link to="/marketplace">Marketplace</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
