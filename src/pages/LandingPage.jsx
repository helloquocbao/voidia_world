import { Link } from "react-router-dom";
import { WalletHeader } from "../components";
import "./LandingPage.css";

export default function LandingPage() {
  return (
    <div className="landing landing--ghost">
      {/* Hero Section */}
      <section className="ghost-hero">
        <div className="ghost-hero__bg">
          <div className="floating-elements">
            <span className="crystal crystal--1"></span>
            <span className="crystal crystal--2"></span>
            <span className="crystal crystal--3"></span>
            <span className="crystal crystal--4"></span>
            <span className="lantern lantern--1"></span>
            <span className="lantern lantern--2"></span>
            <span className="ghost-float ghost-float--1"></span>
            <span className="ghost-float ghost-float--2"></span>
            <span className="ghost-float ghost-float--3"></span>
            <span className="star star--1"></span>
            <span className="star star--2"></span>
            <span className="star star--3"></span>
            <span className="star star--4"></span>
            <span className="star star--5"></span>
          </div>
          <div className="ghost-hero__hills">
            <span className="hill hill--back"></span>
            <span className="hill hill--mid"></span>
            <span className="hill hill--front"></span>
          </div>
        </div>

        <header className="ghost-nav">
          <div className="ghost-logo">
            <span className="ghost-logo__box">
              TR
              <br />
              EE
            </span>
          </div>
          <nav className="ghost-nav__links">
            <Link to="/game">Play</Link>
            <Link to="/boss-fight">Boss Fight</Link>
            <Link to="/marketplace">Shop</Link>
            <Link to="/presale">Token</Link>
          </nav>
          <WalletHeader />
        </header>

        <div className="ghost-hero__content">
          <div className="ghost-hero__left">
            <div className="ghost-hero__title-wrapper">
              <h1 className="ghost-hero__title">
                <span className="title-running">RUNNING</span>
                <span className="title-ghost">GHOST</span>
              </h1>
              <p className="ghost-hero__subtitle">Nightly Journey</p>
            </div>
            <p className="ghost-hero__lead">
              A gentle night run through dream towns with friendly ghosts,
              glowing candies, and floating islands.
            </p>
            <div className="ghost-hero__actions">
              <Link to="/game" className="ghost-hero__button">
                Play Now
              </Link>
              <Link
                to="/marketplace"
                className="ghost-hero__button ghost-hero__button--ghost"
              >
                Visit Shop
              </Link>
            </div>
          </div>
          <div className="ghost-hero__right">
            <div className="hero-illustration">
              <div className="hero-island">
                <div className="hero-island__grass"></div>
                <div className="hero-island__stone"></div>
              </div>
              <div className="hero-ghost hero-ghost--big"></div>
              <div className="hero-ghost hero-ghost--small"></div>
              <div className="hero-ghost hero-ghost--tiny"></div>
              <div className="hero-candy hero-candy--1"></div>
              <div className="hero-candy hero-candy--2"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Story Section */}
      <section className="ghost-story">
        <div className="ghost-story__grid">
          <div className="ghost-story__text">
            <h2 className="section-title section-title--story">
              <span className="title-star">*</span>
              STORY
              <span className="title-star">*</span>
            </h2>

            <div className="ghost-story__content">
              <p>
                <strong>RUNNING GHOST: Nightly Journey</strong> is a story about
                mischievous ghosts living in Cemetery Island. Every night, when
                the sun goes down, the ghosts go to "Dream Towns" where their
                favorite candies and soul-stones are abundant.
              </p>
              <p>
                However, there is a very scary Grim Reaper whose mission is to
                keep the ghosts out of the Dream Towns. If the ghosts are cut by
                the Grim Reaper's scythe, they will be temporarily scattered.
                Even so, the ghosts still want to go to the Dream Towns
                collecting candies while trying to avoid the Grim Reaper.
              </p>
            </div>
          </div>

          <div className="cemetery-island">
            <div className="cemetery-island__image">
              <div className="floating-island-scene">
                <div className="island-base"></div>
                <div className="island-grass-top"></div>
                <div className="island-trees"></div>
                <div className="island-ghost"></div>
              </div>
            </div>
            <div className="cemetery-island__label">
              <span>Cemetery Island</span>
            </div>
          </div>
        </div>
      </section>

      {/* Character Section */}
      <section className="ghost-character">
        <div className="ghost-character__header">
          <h2 className="section-title section-title--character">
            <span className="title-star">*</span>
            CHARACTER
            <span className="title-star">*</span>
          </h2>
          <p className="ghost-character__subtitle">
            Meet the night crew and the gentle spirits you will rescue along the
            way.
          </p>
        </div>

        <div className="character-card">
          <div className="character-card__header">
            <span className="character-card__label">The Ghosts</span>
          </div>

          <div className="character-card__content">
            <div className="character-card__image">
              <div className="ghost-group">
                <div className="ghost-main"></div>
                <div className="ghost-companion ghost-companion--1"></div>
                <div className="ghost-companion ghost-companion--2"></div>
              </div>
            </div>

            <div className="character-card__text">
              <p>
                There are many ghosts with their own interesting stories that
                you will meet on your nightly journey, gather with them and
                explore the dream towns together. Especially, at some certain
                points in the towns, you will be able to encounter the ancient
                ghosts sealed inside the fairy stones.
              </p>
              <p>
                Rescue those ghosts, invite them to live on your Cemetery Island
                and grow the land together.
              </p>
            </div>
          </div>
        </div>

        <div className="first-ideas">
          <h3 className="first-ideas__title">The first ideas of "the Ghost"</h3>
          <div className="first-ideas__gallery">
            <div className="idea-sketch idea-sketch--1"></div>
            <div className="idea-sketch idea-sketch--2"></div>
            <div className="idea-sketch idea-sketch--3"></div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="ghost-cta">
        <div className="ghost-cta__content">
          <h2>Ready to Begin Your Journey?</h2>
          <p>Join the ghosts on their nightly adventure!</p>
          <Link to="/game" className="ghost-cta__button">
            Play Now
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="ghost-footer">
        <div className="ghost-footer__content">
          <p>(c) 2026 Running Ghost: Nightly Journey. All rights reserved.</p>
          <div className="ghost-footer__links">
            <a href="#">Twitter</a>
            <a href="#">Discord</a>
            <a href="#">Telegram</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
