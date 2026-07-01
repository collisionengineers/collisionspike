/* Collision Engineers — marketing site, part B: about + difference + CTA + contact + footer */
const { useState: useStateB } = React;

/* ---- About ---- */
function AboutSection() {
  const points = [
    "Clear, concise and technically accurate reports",
    "All reports fully CPR compliant",
    "Engineers qualified as expert witnesses",
    "Honest, impartial evidence and advice",
  ];
  return (
    <section id="about" style={{ padding: "96px 0", background: "#fff" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }} className="ce-about-grid">
          <Reveal x={-24} y={0}>
            <div style={{ position: "relative" }}>
              <img src="../../assets/web_bg_garage.jpg" alt="Engineering workshop" style={{ width: "100%", height: 440, objectFit: "cover", borderRadius: 2, filter: "grayscale(1)" }} />
            </div>
          </Reveal>
          <Reveal delay={150} x={24} y={0}>
            <Eyebrow>About Us</Eyebrow>
            <h2 style={{ fontSize: 40, fontWeight: 700, color: "#1a1a1a", margin: "0 0 20px" }}>Ensuring Your Confidence</h2>
            <p style={{ color: "#6b6b6b", lineHeight: 1.6, margin: "0 0 20px" }}>Collision Engineers is formed by some of the UK's most talented automotive experts. We are the technical substructure supporting the legal, motor trade, government and insurance sectors.</p>
            <p style={{ color: "#6b6b6b", lineHeight: 1.6, margin: "0 0 32px" }}>We are the UK's only expert witness firm to have full workshop facilities on-site at our HQ — enabling us to carry out component failure examinations in the correct environment.</p>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 36px", display: "grid", gap: 12 }}>
              {points.map(p => (
                <li key={p} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <CEIcon name="check" size={20} style={{ color: RED, flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 14, color: "#1a1a1a" }}>{p}</span>
                </li>
              ))}
            </ul>
            <WebButton variant="solid" icon="arrowRight" href="#about">Learn More About Our Expertise</WebButton>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---- The Collision Engineers Difference (dark) ---- */
function DifferenceSection() {
  const items = [
    ["shield", "Independent Expert Reports", "All our engineers are fully impartial with no commercial allegiance — ensuring reports withstand rigorous scrutiny in legal proceedings."],
    ["search", "Detailed Technical Analysis", "Using the latest diagnostic software, research tools and workshop equipment to produce technically robust, defensible findings."],
    ["fileText", "Legal & Court Experience", "Our engineers are qualified to act as expert witnesses, providing reliable, informative testimony to assist courts across the UK."],
    ["clock", "Industry-Leading Turnaround", "Exceptional response times delivering accurate, court-ready reports faster than competitors, without ever compromising on quality."],
  ];
  return (
    <section style={{ position: "relative", padding: "96px 0", background: CHAR, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <img src="../../assets/web_bg_garage.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.05, filter: "contrast(3) brightness(1.8) grayscale(1)" }} />
      </div>
      <div style={{ position: "relative", maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
        <Reveal as="div" style={{ textAlign: "center", marginBottom: 64 }}>
          <Eyebrow center>Why Instruct Us</Eyebrow>
          <h2 style={{ fontSize: 40, fontWeight: 700, color: "#fff", margin: "0 0 16px" }}>The Collision Engineers Difference</h2>
          <p style={{ color: "rgba(255,255,255,.5)", maxWidth: 560, margin: "0 auto", lineHeight: 1.6 }}>We pride ourselves on employing only the UK's best automotive engineers, delivering impeccable service with a personal and supportive feel.</p>
        </Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }} className="ce-diff-grid">
          {items.map(([ic, t, b], i) => (
            <Reveal key={t} delay={i * 100}>
              <div style={{ padding: 28, border: "1px solid rgba(255,255,255,.1)", borderRadius: 2, background: CHAR, height: "100%", boxSizing: "border-box" }}>
                <div style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 2, marginBottom: 20, background: RED }}>
                  <CEIcon name={ic} size={20} style={{ color: "#fff" }} />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 12px", lineHeight: 1.3 }}>{t}</h3>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,.55)", lineHeight: 1.6, margin: 0 }}>{b}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---- CTA band (red, dot texture) ---- */
function CTABand() {
  return (
    <section style={{ position: "relative", padding: "96px 0", overflow: "hidden", background: RED }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.06, backgroundImage: "radial-gradient(white 1.5px, transparent 1.5px)", backgroundSize: "32px 32px" }} />
      <Reveal as="div" style={{ position: "relative", maxWidth: 1200, margin: "0 auto", padding: "0 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: 40, fontWeight: 700, color: "#fff", margin: "0 0 16px" }}>Need an Independent Engineering Assessment?</h2>
        <p style={{ color: "rgba(255,255,255,.75)", fontSize: 18, margin: "0 auto 40px", maxWidth: 640, lineHeight: 1.6 }}>Speak to our team today. We provide clear, impartial expert reports for legal professionals, insurers, and private clients across the UK.</p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <WebButton variant="onred" icon="arrowRight" href="#contact">Request a Report</WebButton>
          <WebButton variant="outlineLight" icon="arrowRight" href="#contact">Contact Us</WebButton>
        </div>
      </Reveal>
    </section>
  );
}

/* ---- Contact ---- */
function ContactSection() {
  const [sent, setSent] = useStateB(false);
  const fieldStyle = { width: "100%", padding: "12px 16px", fontSize: 14, border: "1px solid #e6e4e1", borderRadius: 2, background: "#fff", boxSizing: "border-box", fontFamily: "inherit" };
  const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "#1a1a1a", marginBottom: 6 };
  return (
    <section id="contact" style={{ padding: "96px 0", background: "#fff" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "flex-start" }} className="ce-contact-grid">
          <Reveal>
            <Eyebrow>Get in Touch</Eyebrow>
            <h2 style={{ fontSize: 40, fontWeight: 700, color: "#1a1a1a", margin: "0 0 20px" }}>Make an Enquiry</h2>
            <p style={{ color: "#6b6b6b", margin: "0 0 32px", lineHeight: 1.6 }}>Contact us to discuss your requirements. We provide tailored, cost-effective solutions for solicitors, insurers, government bodies, and private clients.</p>
            <div style={{ display: "grid", gap: 16 }}>
              <ContactRow icon="phone" label="Telephone" value="0151 559 0762" href="tel:01515590762" />
              <ContactRow icon="mail" label="Email" value="newbusiness@collisionengineers.co.uk" href="mailto:newbusiness@collisionengineers.co.uk" />
            </div>
          </Reveal>
          <Reveal delay={150}>
            <form onSubmit={(e) => { e.preventDefault(); setSent(true); }} style={{ display: "grid", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div><label style={labelStyle}>Name *</label><input required placeholder="Full name" style={fieldStyle} /></div>
                <div><label style={labelStyle}>Phone</label><input placeholder="Phone number" style={fieldStyle} /></div>
              </div>
              <div><label style={labelStyle}>Email *</label><input required type="email" placeholder="Email address" style={fieldStyle} /></div>
              <div><label style={labelStyle}>Message *</label><textarea required rows={5} placeholder="Tell us about your requirements..." style={{ ...fieldStyle, resize: "none" }} /></div>
              <button type="submit" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "16px", fontSize: 14, fontWeight: 600, color: "#fff", background: sent ? "#16833b" : RED, border: 0, borderRadius: 2, cursor: "pointer", transition: "background .2s" }}>
                {sent ? "Enquiry Sent — We'll be in touch" : "Send Enquiry"}<CEIcon name={sent ? "check" : "send"} size={16} />
              </button>
              <p style={{ fontSize: 12, textAlign: "center", color: "#6b6b6b", margin: 0 }}>Or call us on <a href="tel:01515590762" style={{ fontWeight: 600, color: RED, textDecoration: "none" }}>0151 559 0762</a></p>
            </form>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function ContactRow({ icon, label, value, href }) {
  const [hov, setHov] = useStateB(false);
  return (
    <a href={href} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "flex", alignItems: "center", gap: 16, padding: 16, border: `1px solid ${hov ? "rgba(26,26,26,.25)" : "#e6e4e1"}`, borderRadius: 2, textDecoration: "none", boxShadow: hov ? "0 1px 4px rgba(0,0,0,.06)" : "none", transition: "all .2s" }}>
      <div style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 2, background: "rgba(219,8,22,.07)" }}>
        <CEIcon name={icon} size={20} style={{ color: RED }} />
      </div>
      <div>
        <p style={{ fontSize: 10, color: "#6b6b6b", textTransform: "uppercase", letterSpacing: ".15em", margin: 0 }}>{label}</p>
        <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", margin: "2px 0 0" }}>{value}</p>
      </div>
    </a>
  );
}

/* ---- Footer ---- */
function Footer() {
  const nav = ["Home", "About", "Services", "Contact", "Repairer Portal", "Staff Area"];
  const services = ["Accident Damage Reports", "Forensic Engineering", "Vehicle Valuation", "Diminution in Value", "Roadworthy Reports", "Post Repair Reports", "Theft Validation"];
  return (
    <footer style={{ background: CHAR }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 48, paddingBottom: 48, borderBottom: "1px solid rgba(255,255,255,.1)" }} className="ce-footer-grid">
          <div>
            <img src="../../assets/web_logo_white.png" alt="Collision Engineers" style={{ height: 52, width: "auto", marginBottom: 20 }} />
            <p style={{ fontSize: 14, color: "rgba(255,255,255,.5)", lineHeight: 1.6, margin: "0 0 16px" }}>Independent automotive engineering experts providing court-compliant reports across the UK.</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,.25)", fontStyle: "italic", margin: 0 }}>"Accuracy through excellent engineering"</p>
            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              <a href="#" aria-label="LinkedIn" style={{ color: "rgba(255,255,255,.4)" }}><CEIcon name="linkedin" size={20} /></a>
            </div>
          </div>
          <FooterCol title="Navigation" items={nav} />
          <FooterCol title="Services" items={services} />
          <div>
            <h4 style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".18em", textTransform: "uppercase", color: "rgba(255,255,255,.35)", margin: "0 0 20px" }}>Contact</h4>
            <div style={{ display: "grid", gap: 16 }}>
              <a href="tel:01515590762" style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, color: "rgba(255,255,255,.55)", textDecoration: "none" }}><CEIcon name="phone" size={16} style={{ color: RED, flexShrink: 0 }} />0151 559 0762</a>
              <a href="mailto:newbusiness@collisionengineers.co.uk" style={{ display: "flex", alignItems: "flex-start", gap: 12, fontSize: 14, color: "rgba(255,255,255,.55)", textDecoration: "none" }}><CEIcon name="mail" size={16} style={{ color: RED, flexShrink: 0, marginTop: 2 }} />newbusiness@collisionengineers.co.uk</a>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,.35)", lineHeight: 1.6, margin: 0 }}>North West HQ<br />UK-wide & Europe coverage</p>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 32, gap: 12, flexWrap: "wrap" }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.25)", margin: 0 }}>© 2026 Collision Engineers Ltd. All rights reserved.</p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.25)", margin: 0 }}>CPR Compliant · Expert Witness Qualified · UK-Wide</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, items }) {
  return (
    <div>
      <h4 style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".18em", textTransform: "uppercase", color: "rgba(255,255,255,.35)", margin: "0 0 20px" }}>{title}</h4>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 11 }}>
        {items.map(i => <li key={i}><a href="#" style={{ fontSize: 14, color: "rgba(255,255,255,.55)", textDecoration: "none" }}>{i}</a></li>)}
      </ul>
    </div>
  );
}

/* ---- WhatsApp float ---- */
function WhatsAppButton() {
  const [hov, setHov] = useStateB(false);
  return (
    <a href="#" onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ position: "fixed", bottom: 24, right: 24, zIndex: 50, display: "flex", alignItems: "center", gap: 10, background: hov ? "#1ebe5d" : "#25d366", color: "#fff", padding: "12px 20px 12px 16px", borderRadius: 999, boxShadow: "0 8px 24px rgba(0,0,0,.2)", textDecoration: "none", transition: "all .2s" }}>
      <CEIcon name="whatsapp" size={20} fill />
      <span style={{ position: "relative", display: "flex", height: 10, width: 10 }}>
        <span style={{ position: "absolute", display: "inline-flex", height: "100%", width: "100%", borderRadius: 999, background: "#fff", opacity: 0.6, animation: "cePing 1.4s cubic-bezier(0,0,.2,1) infinite" }} />
        <span style={{ position: "relative", display: "inline-flex", borderRadius: 999, height: 10, width: 10, background: "#fff" }} />
      </span>
      <span style={{ fontSize: 14, fontWeight: 600 }}>WhatsApp Us</span>
    </a>
  );
}

Object.assign(window, { AboutSection, DifferenceSection, CTABand, ContactSection, Footer, WhatsAppButton });
