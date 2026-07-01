/* Collision Engineers — marketing site, part A: primitives + header + hero + trust + services */
const { useState, useEffect, useRef } = React;
const CEIcon = window.CEIcon;

const RED = "#db0816";
const CHAR = "#2c2a27";

/* ---- Reveal-on-scroll wrapper ---- */
function Reveal({ children, delay = 0, y = 24, x = 0, as = "div", className, style }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setShown(true); return; }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const Tag = as;
  return (
    <Tag ref={ref} className={className}
      style={{
        ...style,
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : `translate(${x}px, ${y}px)`,
        transition: `opacity .7s ease ${delay}ms, transform .7s cubic-bezier(.2,.7,.3,1) ${delay}ms`,
      }}>
      {children}
    </Tag>
  );
}

/* ---- Eyebrow (red hairline + uppercase label) ---- */
function Eyebrow({ children, center = false, light = false }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: center ? "center" : "flex-start", marginBottom: 20 }}>
      <span style={{ height: 1, width: 34, background: RED }} />
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: RED }}>{children}</span>
      {center && <span style={{ height: 1, width: 34, background: RED }} />}
    </div>
  );
}

/* ---- Button ---- */
function WebButton({ children, variant = "solid", icon = "chevronRight", href = "#", onClick, full = false }) {
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    fontSize: 14, fontWeight: 600, borderRadius: 2, cursor: "pointer",
    padding: "13px 26px", textDecoration: "none", transition: "all .2s ease", whiteSpace: "nowrap",
    width: full ? "100%" : "auto", border: "1px solid transparent", boxSizing: "border-box",
  };
  const styles = {
    solid: { ...base, background: RED, color: "#fff" },
    ghost: { ...base, background: "#fff", color: "#1a1a1a", borderColor: "#e6e4e1" },
    onred: { ...base, background: "#fff", color: RED },
    outlineLight: { ...base, background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,.35)" },
  };
  const [hov, setHov] = useState(false);
  const st = { ...styles[variant], ...(hov ? { opacity: variant === "ghost" ? 1 : 0.9, background: variant === "ghost" ? "#f5f4f2" : styles[variant].background, ...(variant === "outlineLight" ? { background: "rgba(255,255,255,.1)" } : {}) } : {}) };
  return (
    <a href={href} onClick={onClick} style={st} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      {children}{icon && <CEIcon name={icon} size={18} />}
    </a>
  );
}

/* ---- Header ---- */
function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll); return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const links = ["Home", "About", "Services", "Contact"];
  return (
    <header style={{
      position: "fixed", insetInline: 0, top: 0, zIndex: 50, transition: "all .3s ease",
      background: scrolled ? "rgba(255,255,255,.92)" : "transparent",
      backdropFilter: scrolled ? "saturate(180%) blur(8px)" : "none",
      borderBottom: scrolled ? "1px solid #e6e4e1" : "1px solid transparent",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 80 }}>
          <a href="#top" style={{ display: "flex", alignItems: "center" }}>
            <img src="../../assets/logo_no_margin.png" alt="Collision Engineers" style={{ height: 52, width: "auto" }} />
          </a>
          <nav style={{ display: "flex", alignItems: "center", gap: 28 }} className="ce-desktop-nav">
            {links.map((l, i) => (
              <a key={l} href={`#${l.toLowerCase()}`} style={{ fontSize: 14, fontWeight: 500, letterSpacing: ".02em", color: i === 0 ? RED : "#1a1a1a", textDecoration: "none" }}>{l}</a>
            ))}
            <a href="#portal" style={{ fontSize: 14, fontWeight: 500, letterSpacing: ".02em", padding: "6px 14px", borderRadius: 2, color: "#fff", background: RED, textDecoration: "none" }}>Repairer Portal</a>
            <a href="#staff" style={{ fontSize: 14, fontWeight: 500, color: "#6b6b6b", textDecoration: "none" }}>Staff Area</a>
          </nav>
          <button className="ce-mobile-btn" onClick={() => setMenu(m => !m)} aria-label="Toggle menu"
            style={{ display: "none", padding: 8, background: "none", border: 0, color: "#1a1a1a", cursor: "pointer" }}>
            <CEIcon name={menu ? "x" : "menu"} size={24} />
          </button>
        </div>
      </div>
      {menu && (
        <div className="ce-mobile-menu" style={{ background: "#fff", borderTop: "1px solid #e6e4e1", padding: "12px 24px 20px", display: "grid", gap: 4 }}>
          {[...links, "Repairer Portal", "Staff Area"].map(l => (
            <a key={l} href={`#${l.toLowerCase().replace(/ /g, "")}`} onClick={() => setMenu(false)} style={{ padding: "12px 4px", fontSize: 15, fontWeight: 500, color: "#1a1a1a", textDecoration: "none", borderBottom: "1px solid #f0eeec" }}>{l}</a>
          ))}
        </div>
      )}
    </header>
  );
}

/* ---- Hero ---- */
function Hero() {
  const stats = [["UK", "Coverage"], ["CPR", "Compliant"], ["100%", "Independent"]];
  return (
    <section id="home" style={{ position: "relative", minHeight: "85vh", display: "flex", alignItems: "center", background: "#fff", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <img src="../../assets/web_bg_garage.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.03, filter: "contrast(3) brightness(1.8) grayscale(1)" }} />
      </div>
      <div style={{ position: "relative", maxWidth: 1200, margin: "0 auto", padding: "96px 24px 48px", width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }} className="ce-hero-grid">
        <Reveal>
          <Eyebrow>Independent Automotive Experts</Eyebrow>
          <h1 style={{ fontSize: 60, fontWeight: 700, color: "#1a1a1a", lineHeight: 1.08, margin: "0 0 24px", letterSpacing: "-0.01em" }} className="ce-hero-h1">
            Independent<br /><span style={{ color: RED }}>Automotive</span><br />Engineering Experts
          </h1>
          <p style={{ fontSize: 18, color: "#6b6b6b", lineHeight: 1.6, margin: "0 0 36px", maxWidth: 460 }}>
            We provide vehicle damage assessments and expert reports for legal professionals, insurers, government bodies, and private clients across the UK.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 16 }} className="ce-hero-cta">
              <SplitCTA top="Request" bottom="Engineering Report" />
              <SplitCTA top="Request" bottom="Bodyshop Estimate" />
            </div>
            <WebButton variant="ghost" icon="chevronRight" href="#services">View Services</WebButton>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 32, marginTop: 48, paddingTop: 40, borderTop: "1px solid #e6e4e1" }}>
            {stats.map(([n, l], i) => (
              <React.Fragment key={l}>
                {i > 0 && <span style={{ width: 1, height: 32, background: "#e6e4e1" }} />}
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>{n}</p>
                  <p style={{ fontSize: 10, color: "#6b6b6b", textTransform: "uppercase", letterSpacing: ".15em", margin: 0 }}>{l}</p>
                </div>
              </React.Fragment>
            ))}
          </div>
        </Reveal>
        <Reveal delay={200} x={24} y={0} className="ce-hero-img">
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", top: -16, left: -16, width: 80, height: 80, borderLeft: `2px solid ${RED}`, borderTop: `2px solid ${RED}` }} />
            <div style={{ position: "absolute", bottom: -16, right: -16, width: 80, height: 80, borderRight: `2px solid ${RED}`, borderBottom: `2px solid ${RED}` }} />
            <img src="../../assets/web_hero_image.png" alt="Engineering inspection" style={{ width: "100%", height: 500, objectFit: "cover", borderRadius: 2 }} />
            <div style={{ position: "absolute", inset: 0, borderRadius: 2, background: "linear-gradient(to top, #fff 0%, transparent 45%)" }} />
            <div style={{ position: "absolute", bottom: 24, left: 24, right: 24 }}>
              <p style={{ color: "#6b6b6b", fontSize: 14, fontStyle: "italic", margin: 0 }}>"Accuracy through excellent engineering"</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function SplitCTA({ top, bottom }) {
  const [hov, setHov] = useState(false);
  return (
    <a href="#contact" onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 24px", color: "#fff", background: RED, borderRadius: 2, textDecoration: "none", opacity: hov ? 0.9 : 1, boxShadow: hov ? "0 18px 40px rgba(143,20,34,.3)" : "none", transition: "all .2s ease" }}>
      <span style={{ textAlign: "left" }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 800 }}>{top}</span>
        <span style={{ display: "block", fontSize: 13, fontWeight: 500, marginTop: -2 }}>{bottom}</span>
      </span>
      <CEIcon name="chevronRight" size={20} />
    </a>
  );
}

/* ---- Trust bar ---- */
function TrustBar() {
  const items = [
    ["shield", "Independent Experts", "No commercial bias"],
    ["fileText", "Court-Compliant Reports", "Fully CPR compliant"],
    ["mapPin", "UK-Wide Coverage", "England & Europe"],
    ["clock", "Efficient Turnaround", "Industry-leading speed"],
  ];
  return (
    <section style={{ background: "#fff", borderBottom: "1px solid #e6e4e1" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 32 }} className="ce-trust-grid">
          {items.map(([ic, t, s], i) => (
            <Reveal key={t} delay={i * 80} as="div" style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 40, height: 40, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 2, background: "rgba(219,8,22,.07)" }}>
                <CEIcon name={ic} size={20} style={{ color: RED }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", lineHeight: 1.2, margin: 0 }}>{t}</p>
                <p style={{ fontSize: 12, color: "#6b6b6b", margin: "2px 0 0" }}>{s}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---- Services (dark) ---- */
function ServiceCard({ icon, title, body, points, delay }) {
  const [hov, setHov] = useState(false);
  return (
    <Reveal delay={delay}>
      <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{ background: hov ? "rgba(255,255,255,.07)" : CHAR, padding: 28, border: `1px solid rgba(255,255,255,${hov ? .2 : .1})`, borderRadius: 2, height: "100%", display: "flex", flexDirection: "column", transition: "all .3s ease", boxSizing: "border-box" }}>
        <div style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 2, marginBottom: 20, flexShrink: 0, background: RED }}>
          <CEIcon name={icon} size={20} style={{ color: "#fff", transform: hov ? "scale(1.1)" : "none", transition: "transform .3s ease" }} />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 12px", lineHeight: 1.3 }}>{title}</h3>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,.6)", lineHeight: 1.6, margin: "0 0 20px", flex: 1 }}>{body}</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px", display: "grid", gap: 8 }}>
          {points.map(p => (
            <li key={p} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,.55)" }}>
              <span style={{ width: 4, height: 4, borderRadius: 999, background: RED, flexShrink: 0 }} />{p}
            </li>
          ))}
        </ul>
        <a href="#services" style={{ marginTop: "auto", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 16px", fontSize: 12, fontWeight: 600, color: "#fff", background: RED, borderRadius: 2, textDecoration: "none", opacity: hov ? 0.9 : 1 }}>
          Learn More <CEIcon name="chevronRight" size={14} />
        </a>
      </div>
    </Reveal>
  );
}

function ServicesSection() {
  const services = [
    ["fileText", "Accident Damage Reports", "Our engineers cover the UK to provide accurate and comprehensive court-compliant reports with lightning speed — including physical and desktop inspections.", ["Physical inspections", "Desktop inspections", "Court-compliant format"]],
    ["search", "Forensic Engineering", "When a non-standard forensic report is required, we offer a no-nonsense independent view with unmatched experience in consistency of damage, low velocity impact causation, and counter-fraud investigations.", ["Consistency of damage", "Low velocity impact", "Counter-fraud analysis"]],
    ["trendingDown", "Diminution in Value", "How will an impact affect a vehicle's future value, even when repaired correctly? Our independent experts quantify this with real-world market experience.", ["Dedicated department", "Real-world market data", "Free initial check"]],
    ["barChart", "Vehicle Valuation", "When an accurate valuation report is required, speak to experts with an extensive motor trade background — from cars to bicycles and everything in between.", ["All vehicle types", "Market-accurate valuations", "Expert witness ready"]],
    ["triangleAlert", "Roadworthy / Unroadworthy", "Never compromising on the safety of road users, we make accurate roadworthy decisions that can be relied upon by courts, insurers, and private individuals.", ["Safety assessment", "Compliance reporting", "Legally admissible"]],
  ];
  return (
    <section id="services" style={{ position: "relative", padding: "96px 0", background: CHAR, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <img src="../../assets/web_bg_image_02.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.05, filter: "contrast(3) brightness(1.8) grayscale(1)" }} />
      </div>
      <div style={{ position: "relative", maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
        <Reveal as="div" style={{ textAlign: "center", marginBottom: 64 }}>
          <Eyebrow center>Our Expertise</Eyebrow>
          <h2 style={{ fontSize: 40, fontWeight: 700, color: "#fff", margin: "0 0 16px" }}>Engineering Services</h2>
          <p style={{ color: "rgba(255,255,255,.6)", maxWidth: 560, margin: "0 auto", fontSize: 18, lineHeight: 1.6 }}>Specialist automotive engineering reports for legal proceedings, insurance claims, and private investigations.</p>
        </Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }} className="ce-services-grid">
          {services.map((s, i) => <ServiceCard key={s[1]} icon={s[0]} title={s[1]} body={s[2]} points={s[3]} delay={i * 70} />)}
        </div>
        <Reveal as="div" delay={300} style={{ textAlign: "center", marginTop: 48 }}>
          <WebButton variant="outlineLight" icon="arrowRight" href="#services">View All Services</WebButton>
        </Reveal>
      </div>
    </section>
  );
}

Object.assign(window, { Reveal, Eyebrow, WebButton, Header, Hero, TrustBar, ServicesSection, RED, CHAR });
