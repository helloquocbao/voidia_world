import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { WalletHeader } from "../components";
import {
  PRESALE_TIERS,
  PRESALE_WALLET,
  TOKENOMICS,
  type PresaleTier,
  PRESALE_GOAL_SUI,
  PRESALE_RAISED_SUI,
} from "../chain/config";
import "./PresalePage.css";

type TierWithProgress = PresaleTier & {
  sold: number;
};

type Stage = {
  id: "testnet" | "community" | "presale" | "mainnet";
  label: string;
  status: "done" | "current" | "upcoming";
  detail: string;
};

// Replace these placeholders with live on-chain or backend data when available.
const tierProgress: Record<string, number> = {
  // "tier-1": 120,
  // "tier-2": 85,
  // "tier-3": 42,
  // "tier-4": 12,
};

export default function PresalePage() {
  const [copied, setCopied] = useState(false);
  const numberFmt = useMemo(() => new Intl.NumberFormat("en-US"), []);
  const toSafeNumber = (value: number, fallback = 0) =>
    Number.isFinite(value) ? value : fallback;

  const stages: Stage[] = [
    {
      id: "testnet",
      label: "Testnet",
      status: "done",
      detail: "Game + minting live on Sui testnet",
    },
    {
      id: "community",
      label: "Community raise",
      status: "current",
      detail: "You are here - accepting SUI contributions by tier",
    },
    {
      id: "presale",
      label: "Pre-sale",
      status: "upcoming",
      detail: "Public NFT + token bonus sale",
    },
    {
      id: "mainnet",
      label: "Mainnet",
      status: "upcoming",
      detail: "Launch Voidia World on Sui mainnet",
    },
  ];

  const tiers: TierWithProgress[] = useMemo(
    () =>
      PRESALE_TIERS.map((tier) => ({
        ...tier,
        sold: tierProgress[tier.id] ?? 0,
      })),
    []
  );

  const totalContributions = useMemo(
    () => tiers.reduce((sum, tier) => sum + tier.sold, 0),
    [tiers]
  );

  const goalSui = Math.max(0, toSafeNumber(PRESALE_GOAL_SUI, 0));
  const raisedSui = Math.max(0, toSafeNumber(PRESALE_RAISED_SUI, 0));
  const projectPercent = goalSui
    ? Math.min(100, Math.round((raisedSui / goalSui) * 100))
    : 0;

  const currentStageIndex = stages.findIndex((s) => s.status === "current");
  const progressSegments = Math.max(1, stages.length - 1);
  const stagePercent =
    currentStageIndex >= 0
      ? Math.min(100, Math.round((currentStageIndex / progressSegments) * 100))
      : 0;

  const unlockDescription = `50% locked ${TOKENOMICS.lockedTreasury.cliffMonths} months, then unlock ${TOKENOMICS.lockedTreasury.unlockPercentEachInterval *
    100}% every ${TOKENOMICS.lockedTreasury.unlockIntervalMonths} months.`;

  const handleCopyWallet = async () => {
    if (!PRESALE_WALLET) return;
    try {
      await navigator.clipboard.writeText(PRESALE_WALLET);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch (err) {
      console.error("Copy failed", err);
      setCopied(false);
    }
  };

  return (
    <div className="presale">
      <div className="presale__bg" />

      <header className="presale__nav">
        <div className="presale__brand">
          <img
            src="https://ik.imagekit.io/huubao/chunk_coin.png"
            alt="Voidia"
            className="presale__brand-icon"
          />
          <div>
            <div className="presale__brand-name">Voidia World</div>
            <div className="presale__brand-tag">Community Presale</div>
          </div>
        </div>

        <nav className="presale__links">
          <Link to="/">Home</Link>
          <Link to="/game">Game</Link>
          <Link to="/editor">Editor</Link>
          <Link to="/marketplace">Market</Link>
          <Link className="is-active" to="/presale">
            Presale
          </Link>
        </nav>

        <div className="presale__wallet">
          <WalletHeader />
        </div>
      </header>

      <main className="presale__content">
        <section className="presale__roadmap">
          <div className="section__header">
            <div className="pill">Roadmap</div>
            <h2>4 stages: Testnet → Community raise → Pre-sale → Mainnet</h2>
            <p>Current progress: {stagePercent}% of the journey.</p>
          </div>

          <div className="stage-bar">
            <div className="stage-bar__track">
              <div
                className="stage-bar__fill"
                style={{ width: `${stagePercent}%` }}
              />
              {stages.map((stage, idx) => (
                <div
                  key={stage.id}
                  className={`stage-bar__dot stage-bar__dot--${stage.status}`}
                  style={{
                    left: `${(idx / Math.max(1, stages.length - 1)) * 100}%`,
                  }}
                  title={stage.label}
                />
              ))}
            </div>
            <div className="stage-bar__labels">
              {stages.map((stage) => (
                <div key={stage.id} className="stage-bar__label">
                  <div className="stage-bar__label-title">{stage.label}</div>
                  <div className="stage-bar__label-sub">
                    {stage.status === "current"
                      ? "Current"
                      : stage.status === "done"
                      ? "Done"
                      : "Upcoming"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="stage-grid stage-grid--full">
            {stages.map((stage) => (
              <div key={stage.id} className="stage-item">
                <div className={`stage-item__pill stage-item__pill--${stage.status}`}>
                  {stage.status === "current"
                    ? "Current"
                    : stage.status === "done"
                    ? "Done"
                    : "Upcoming"}
                </div>
                <div className="stage-item__title">{stage.label}</div>
                <div className="stage-item__desc">{stage.detail}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="presale__hero">
          <div className="presale__hero-copy">
            <div className="pill pill--glow">Sui testnet - On-chain rewards</div>
            <h1>
              Power up Voidia with a tiered presale.
              <span className="hero__accent"> NFTs + token bonus.</span>
            </h1>
            <p className="hero__lead">
              Four contribution tiers, progressive rewards, and a transparent
              token schedule. Funds go to the presale vault; NFTs and bonus
              tokens are allocated per tier weight.
            </p>

            <div className="hero__actions">
              <button
                className="btn-primary"
                onClick={handleCopyWallet}
                disabled={!PRESALE_WALLET}
              >
                {copied ? "Copied!" : "Copy presale wallet"}
              </button>
              <a className="btn-ghost" href="#tiers">
                View tiers
              </a>
            </div>

            <div className="hero__wallet">
              <div className="wallet-label">Send SUI to</div>
              <code className="wallet-address">
                {PRESALE_WALLET || "Set VITE_PRESALE_WALLET to show address"}
              </code>
              <div className="wallet-note">
                Contributions are tracked per sender address; items + bonus
                tokens map to your wallet.
              </div>
            </div>

            <div className="hero__progress">
              <div className="progress__meta">
                <span>
                  {numberFmt.format(totalContributions)} contributions recorded
                </span>
                <span>Unlimited capacity - no slot caps</span>
              </div>
            </div>
          </div>

          <div className="presale__hero-side">
            <div className="presale__hero-card">
              <div className="card__title">Distribution</div>
              <div className="card__row">
                <span>Community bonus</span>
                <span>{TOKENOMICS.communityBonusPercent * 100}%</span>
              </div>
              <div className="card__row">
                <span>Locked treasury</span>
                <span>{TOKENOMICS.lockedTreasury.percent * 100}%</span>
              </div>
              <div className="card__row">
                <span>Reward vault</span>
                <span>{TOKENOMICS.rewardVaultPercent * 100}%</span>
              </div>
              <div className="card__divider" />
              <div className="card__row small">{unlockDescription}</div>
              <div className="card__pill">High tier scaling starts at {TOKENOMICS.highTierScaleFrom} SUI</div>
            </div>

            <div className="progress-card">
              <div className="progress-card__head">
                <div>
                  <div className="card__title">Project progress</div>
                  <div className="progress-card__sub">
                    Based on total SUI contributions vs goal.
                  </div>
                </div>
                <div className="progress-card__pill">
                  {projectPercent}% funded
                </div>
              </div>

              <div className="progress progress--large">
                <div
                  className="progress__bar"
                  style={{ width: `${projectPercent}%` }}
                />
              </div>
              <div className="progress__meta">
                <span>
                  Raised {numberFmt.format(raisedSui)} / {numberFmt.format(goalSui)} SUI
                </span>
                <span>
                  Remaining {numberFmt.format(Math.max(0, goalSui - raisedSui))} SUI
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="presale__tiers" id="tiers">
          <div className="section__header">
            <div className="pill">Tiered bundles</div>
            <h2>Pick a tier, claim on-chain items.</h2>
            <p>
              No slot caps. We simply track total contributions per tier and
              split the 15% community bonus by weights: 1 &lt; 2 &lt; 3 &lt; 4.
              Above 350 SUI, bonus scales with your contribution inside tier 4.
            </p>
          </div>

          <div className="tier-grid">
            {tiers.map((tier) => (
              <article key={tier.id} className="tier-card">
                <div className="tier-card__head">
                  <div>
                    <div className="tier-card__label">{tier.label}</div>
                    <div className="tier-card__min">
                      Min {tier.minContribution} SUI
                      {tier.maxContribution
                        ? ` - up to ${tier.maxContribution} SUI`
                        : " or more"}
                    </div>
                  </div>
                  <div className="tier-card__count">
                    {numberFmt.format(tier.sold)} contributions
                  </div>
                </div>

                <div className="tier-card__meta">
                  <span>Unlimited capacity</span>
                  <span>Weight {tier.tokenBonusWeight}x</span>
                </div>

                <ul className="tier-card__rewards">
                  {tier.rewards.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                  {tier.powerStones && (
                    <li>{tier.powerStones} Power Stones</li>
                  )}
                </ul>

                {tier.notes && <div className="tier-card__note">{tier.notes}</div>}
              </article>
            ))}
          </div>
        </section>

        <section className="presale__how">
          <div className="section__header">
            <div className="pill">How it works</div>
            <h2>Transparent flow for contributors.</h2>
            <p>
              Send SUI to the presale wallet, we track by sender address, and
              allocate NFTs + token bonus per tier. Vesting and reward vault
              timelines are visible up front.
            </p>
          </div>

          <div className="steps">
            <div className="step-card">
              <div className="step-card__id">01</div>
              <div className="step-card__body">
                <div className="step-card__title">Choose a tier</div>
                <div className="step-card__text">
                  Match your contribution to a tier. Higher tiers unlock rarer
                  NFTs and larger community-bonus weight.
                </div>
              </div>
            </div>

            <div className="step-card">
              <div className="step-card__id">02</div>
              <div className="step-card__body">
                <div className="step-card__title">Send SUI to vault</div>
                <div className="step-card__text">
                  Use the wallet address above. Contributions are mapped to your
                  sender address for item minting and token bonus share.
                </div>
              </div>
            </div>

            <div className="step-card">
              <div className="step-card__id">03</div>
              <div className="step-card__body">
                <div className="step-card__title">Claim & follow vesting</div>
                <div className="step-card__text">
                  NFTs are delivered per tier; bonus tokens follow the 15% pool
                  split with locked treasury and reward vault schedule.
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
