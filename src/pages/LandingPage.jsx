import { Link } from "react-router-dom";
import { WalletHeader } from "../components";
import "./LandingPage.css";

export default function LandingPage() {
  // News data
  const newsItems = [
    {
      id: 1,
      date: "13 Feb 2024",
      title: "Introducing Voidia Extraction DLC",
      tag: "announcement",
    },
    {
      id: 2,
      date: "13 Feb 2024",
      title: "Introducing Voidia Extraction DLC",
      tag: "patch notes",
    },
    {
      id: 3,
      date: "13 Feb 2024",
      title: "Introducing Voidia Extraction DLC",
      tag: "patch notes",
    },
    {
      id: 4,
      date: "13 Feb 2024",
      title: "Introducing Voidia Extraction DLC",
      tag: "patch notes",
    },
  ];

  // Roadmap data
  const roadmapItems = [
    {
      month: "September",
      title: "Phase 1 Launch",
      description:
        "Lorem ipsum dolor sit amet consectetur. In sed luctus elit elementum cras cursus risus. Proin consequat eget pretium parturient. Vivamus euismod ut commodo imperdiet ultrices a.",
    },
    {
      month: "August",
      title: "Beta Testing",
      description: "Lorem ipsum dolor sit amet consectetur. In sed luctus",
    },
    {
      month: "July",
      title: "Alpha Release",
      description:
        "Lorem ipsum dolor sit amet consectetur. In sed luctus elit elementum cras cursus risus. Proin consequat eget pretium parturient. Vivamus euismod ut commodo imperdiet ultrices a.",
    },
  ];

  return (
    <div className="landing landing--cyber">
      {/* Hero Section */}
      <section className="cyber-hero">
        <div className="cyber-hero__bg"></div>

        {/* Navigation */}
        <header className="cyber-nav">
          <div className="cyber-logo">
            <span className="cyber-logo__icon">V</span>
          </div>

          <nav className="cyber-nav__links">
            <Link to="/" className="active">
              Home
            </Link>
            <Link to="/game">Play</Link>
            <Link to="/boss-fight">Boss Fight</Link>
            <Link to="/marketplace">Store</Link>
            <Link to="/presale">Token</Link>
          </nav>

          <div className="cyber-nav__right">
            <Link to="/game" className="cyber-btn cyber-btn--primary">
              Join the Community
            </Link>

            <div className="cyber-online">
              <span className="cyber-online__count">7411</span>
              <span className="cyber-online__label">Total Online</span>
            </div>

            <WalletHeader />
          </div>
        </header>

        {/* Hero Content */}
        <div className="cyber-hero__content">
          <h1 className="cyber-hero__title">
            <span>Welcome to</span>
            <span className="highlight">VOIDIA WORLD</span>
          </h1>
          <p className="cyber-hero__tagline">Hardcore , Immersive , Unique</p>

          <div className="cyber-hero__actions">
            <Link to="/about" className="cyber-btn cyber-btn--solid">
              Watch
            </Link>
            <Link to="/game" className="cyber-btn cyber-btn--outline">
              Get Started
            </Link>
          </div>
        </div>

        {/* Decorative Logo */}
        <div className="cyber-hero__logo-bg">
          <span className="cyber-logo-large">V</span>
        </div>
      </section>

      {/* Latest News Section */}
      <section className="cyber-news">
        <div className="cyber-news__header">
          <h2 className="cyber-section-title">Latest News</h2>
          <div className="cyber-news__filters">
            <button className="filter-btn active">Announcement</button>
            <button className="filter-btn">Patch Notes</button>
            <button className="filter-btn">Patch Notes</button>
            <button className="filter-btn">Patch Notes</button>
          </div>
        </div>

        <div className="cyber-news__grid">
          {newsItems.map((item) => (
            <div key={item.id} className="news-card">
              <div className="news-card__image">
                <div className="news-card__logo">V</div>
              </div>
              <div className="news-card__content">
                <span className="news-card__tag">{item.tag}</span>
                <span className="news-card__date">{item.date}</span>
                <h3 className="news-card__title">{item.title}</h3>
                <Link to="/news" className="news-card__link">
                  Read More <span className="arrow">→</span>
                </Link>
              </div>
            </div>
          ))}
        </div>

        <button className="cyber-btn cyber-btn--outline cyber-btn--large">
          Load More
        </button>
      </section>

      {/* Who Will You Become Section */}
      <section className="cyber-become">
        <div className="cyber-become__bg"></div>

        <h2 className="cyber-section-title">Who Will You Become</h2>

        <div className="cyber-become__content">
          <div className="become-card">
            <h3 className="become-card__title">Become Criminal</h3>
            <p className="become-card__subtitle">
              Lorem ipsum dolor sit amet consectetur. Lorem leo dictum dictum
              tellus amet.
            </p>
            <p className="become-card__description">
              Lorem ipsum dolor sit amet consectetur. Congue nulla praesent
              ultrices nunc lacus. Neque turpis enim morbi a tempus pulvinar
              vitae eleifend vulputate. Nec laoreet pellentesque interdum cursus
              volutpat ultrices. Pellentesque sed maecenas curabitur aliquet
              pellentesque praesent vitae in donec.
            </p>
            <div className="become-card__actions">
              <Link to="/about" className="cyber-btn cyber-btn--solid">
                Watch
              </Link>
              <Link to="/game" className="cyber-btn cyber-btn--outline">
                Get Started
              </Link>
            </div>
          </div>

          <div className="cyber-become__logo">
            <span>V</span>
          </div>
        </div>
      </section>

      {/* City Background Section */}
      <section className="cyber-city">
        <div className="cyber-city__bg"></div>
      </section>

      {/* Roadmap Section */}
      <section className="cyber-roadmap">
        <div className="cyber-roadmap__bg"></div>

        <div className="cyber-roadmap__header">
          <span className="cyber-roadmap__label">Roadmap</span>
          <h2 className="cyber-section-title">Planned Updates</h2>
        </div>

        <div className="cyber-roadmap__timeline">
          <div className="timeline-line"></div>

          {roadmapItems.map((item, index) => (
            <div key={index} className="timeline-item">
              <div className="timeline-item__month">{item.month}</div>
              <div className="timeline-item__content">
                <p>{item.description}</p>
              </div>
            </div>
          ))}

          <div className="timeline-arrow">↓</div>
        </div>

        {/* Decorative Logo */}
        <div className="cyber-roadmap__logo">
          <span>V</span>
        </div>
      </section>

      {/* Media Gallery Section */}
      <section className="cyber-media">
        <h2 className="cyber-section-title">Roadmap</h2>

        <div className="cyber-media__grid">
          <div className="media-card media-card--video">
            <div className="media-card__overlay">
              <span className="media-card__label">The Official Trailer</span>
              <h3 className="media-card__title">VOIDIA: NEWCOMERS</h3>
              <div className="media-card__cta">
                <span>Watch Now</span>
                <div className="media-card__underline"></div>
              </div>
            </div>
          </div>

          <div className="media-card media-card--video">
            <div className="media-card__overlay">
              <span className="media-card__label">The Official Trailer</span>
              <h3 className="media-card__title">VOIDIA: NEWCOMERS</h3>
              <div className="media-card__cta">
                <span>Watch Now</span>
                <div className="media-card__underline"></div>
              </div>
            </div>
          </div>

          <div className="media-card media-card--wide">
            <div className="media-card__overlay">
              <span className="media-card__label">The Official Trailer</span>
              <h3 className="media-card__title">VOIDIA: NEWCOMERS</h3>
              <div className="media-card__cta">
                <span>Watch Now</span>
                <div className="media-card__underline"></div>
              </div>
            </div>
          </div>

          <div className="media-card media-card--info">
            <div className="media-info">
              <span className="media-info__label">Getting Started</span>
              <h4 className="media-info__title">How to Start Playing</h4>
              <p className="media-info__match">Main VS Vitality</p>
              <p className="media-info__date">17:15 July 30 2024</p>
              <button className="cyber-btn cyber-btn--outline cyber-btn--small">
                Watch Tutorial
              </button>
            </div>
          </div>

          <div className="media-card media-card--play">
            <div className="play-btn">
              <span>▶</span>
            </div>
          </div>

          <div className="media-card media-card--play">
            <div className="play-btn">
              <span>▶</span>
            </div>
          </div>

          <div className="media-card media-card--full">
            <div className="media-card__overlay">
              <span className="media-card__label">The Official Trailer</span>
              <h3 className="media-card__title">VOIDIA: NEWCOMERS</h3>
              <div className="media-card__cta">
                <span>Watch Now</span>
                <div className="media-card__underline"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="cyber-footer">
        <h2 className="cyber-footer__title">
          Be Part of the VOIDIA WORLD World
        </h2>

        <div className="cyber-footer__social">
          <a href="#" className="social-icon">
            <span>📸</span>
          </a>
          <a href="#" className="social-icon">
            <span>f</span>
          </a>
          <a href="#" className="social-icon">
            <span>in</span>
          </a>
          <a href="#" className="social-icon">
            <span>𝕏</span>
          </a>
          <a href="#" className="social-icon">
            <span>▶</span>
          </a>
          <a href="#" className="social-icon">
            <span>🎮</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
