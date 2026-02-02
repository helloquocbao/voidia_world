import { useState } from "react";
import "./PortfolioPage.css";

const services = [
  "Cash cow editing",
  "Reels editing",
  "Logo animation",
  "Podcast edit",
];

const edits = [
  {
    title: "Cash Cow",
    image:
      "https://images.unsplash.com/photo-1523419400520-223c6f02b4ef?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Reel",
    image:
      "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Vlog",
    image:
      "https://images.unsplash.com/photo-1522199710521-72d69614c702?auto=format&fit=crop&w=1200&q=80",
  },
];

const testimonials = [
  {
    name: "Marcus",
    role: "Co-founder",
    quote: "Perfect communication and exceptional skills. This guy is king.",
  },
  {
    name: "Peter",
    role: "Manager",
    quote: "Did a great job, understood all the requirements.",
  },
  {
    name: "Jane",
    role: "CEO",
    quote: "Wonderful to work with. Will definitely hire him again.",
  },
];

export default function PortfolioPage() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText("lehoquocbao9@gmail.com");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error("Copy failed", error);
    }
  };

  return (
    <div className="page">
      <header className="nav">
        <div className="logo">VideoAlchemist</div>
        <nav>
          <a href="#hero">Home</a>
          <a href="#about">About</a>
          <a href="#portfolio">Portfolio</a>
          <a href="#testimonials">Testimonials</a>
          <a href="#contact">Contact</a>
        </nav>
        <div className="socials">
          <a href="https://github.com/LeHoQuocBao" aria-label="Github">
            gh
          </a>
          <a href="https://www.linkedin.com" aria-label="LinkedIn">
            in
          </a>
          <a href="mailto:lehoquocbao9@gmail.com" aria-label="Mail">
            ✉
          </a>
        </div>
      </header>

      <section className="hero" id="hero">
        <div className="hero-text">
          <p className="eyebrow">LE HO QUOC BAO</p>
          <h1>
            Professional
            <br /> Front-end Engineer
          </h1>
          <p className="lede">
            Making your products look sharper, run faster, and feel realtime. React/Next.js, SignalR,
            and Web3-ready.
          </p>
          <div className="hero-actions">
            <a className="btn primary" href="#contact">
              Let&apos;s talk
            </a>
            <a className="btn ghost" href="#portfolio">
              See portfolio
            </a>
          </div>
        </div>
        <div className="hero-visual">
          <div className="electric" />
          <div className="floating-icon pr">Pr</div>
          <div className="floating-icon ae">Ae</div>
          <img
            src="https://avatars.githubusercontent.com/u/62052027?v=4"
            alt="Le Ho Quoc Bao portrait"
            className="portrait"
          />
        </div>
      </section>

      <section className="about" id="about">
        <div className="about-inner">
          <h2>ABOUT ME</h2>
          <p className="body">
            Welcome to the build space of Bao, where pragmatic UX meets solid engineering. With a passion
            for realtime collaboration and performance, I turn product ideas into reliable, high-impact web
            experiences.
          </p>
          <div className="services">
            {services.map((item) => (
              <div className="service" key={item}>
                <span className="dot" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="edits" id="portfolio">
        <div className="section-head">
          <h2>MY BEST BUILDS</h2>
          <div className="accent-line" />
        </div>
        <div className="edit-grid">
          {edits.map((edit) => (
            <div className="edit-card" key={edit.title}>
              <div
                className="edit-thumb"
                style={{ backgroundImage: `url(${edit.image})` }}
                role="img"
                aria-label={edit.title}
              >
                <button className="play">▶</button>
              </div>
              <h3>{edit.title}</h3>
            </div>
          ))}
        </div>
      </section>

      <section className="testimonials" id="testimonials">
        <div className="section-head">
          <h2>TESTIMONIALS</h2>
          <div className="accent-line" />
        </div>
        <div className="testimonial-grid">
          {testimonials.map((item) => (
            <div className="testimonial-card" key={item.name}>
              <p className="name">{item.name}</p>
              <p className="role">{item.role}</p>
              <p className="quote">{item.quote}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="contact" id="contact">
        <div className="section-head">
          <h2>I AM READY TO CONSULT YOU</h2>
          <div className="accent-line" />
        </div>
        <form className="contact-form" onSubmit={(e) => e.preventDefault()}>
          <input type="text" placeholder="My name is" />
          <input type="text" placeholder="I am interested in" />
          <input type="text" placeholder="Message" />
          <button type="submit" className="btn primary">
            Send
          </button>
        </form>
        <div className="contact-meta">
          <span>📞 +84 917 982 707</span>
          <span>📍 District 7, HCMC</span>
          <span>✉️ lehoquocbao9@gmail.com</span>
          <button className="btn ghost" onClick={handleCopy}>
            {copied ? "Copied!" : "Copy email"}
          </button>
        </div>
      </section>
    </div>
  );
}
