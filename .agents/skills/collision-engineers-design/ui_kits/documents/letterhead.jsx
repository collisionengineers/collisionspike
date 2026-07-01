/* Collision Engineers — document shared components */
const { useState } = React;

const ADDRESS = "Collision Engineers Ltd, 77-79 Hoylake Road, Moreton, Wirral, CH46 9PY";
const WEB = "www.CollisionEngineers.co.uk";

/* Small inline icons (Lucide) for placeholders */
function PhIcon({ name, size = 26 }) {
  const paths = {
    image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  };
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: paths[name] }} />;
}

/* Letterhead: logo + Our Ref / Your Ref / Date */
function Letterhead({ ourRef, yourRef, date }) {
  return (
    <div className="letterhead">
      <img src="../../assets/logo_no_margin.png" alt="Collision Engineers" />
      <div className="ref-block">
        <span className="lab">Our Ref:</span><span className="val">{ourRef}</span>
        <span className="lab">Your Ref:</span><span className="val">{yourRef}</span>
        <span className="lab">Date:</span><span className="val">{date}</span>
      </div>
    </div>
  );
}

function RunningHead({ ourRef, yourRef, date }) {
  return (
    <div className="running-head">
      <span><strong>Our Ref:</strong> {ourRef}</span>
      <span><strong>Your Ref:</strong> {yourRef}</span>
      <span><strong>Date:</strong> {date}</span>
    </div>
  );
}

function DocTitle({ children, underlined, red }) {
  return <h1 className={`doc-title${underlined ? " underlined" : ""}${red ? " red" : ""}`}>{children}</h1>;
}
function DocSubtitle({ children }) { return <p className="doc-subtitle">{children}</p>; }
function SectionHeading({ children }) { return <h3 className="sec-h">{children}</h3>; }

/* Red-bordered two-pair summary table */
function DataTable({ rows }) {
  return (
    <table className="data-table"><tbody>
      {rows.map((r, i) => (
        <tr key={i}>
          <td className="k">{r[0]}</td><td className="v">{r[1]}</td>
          <td className="k">{r[2]}</td><td className="v">{r[3]}</td>
        </tr>
      ))}
    </tbody></table>
  );
}

/* Plain key/value (two columns of pairs) */
function KVTable({ rows }) {
  return (
    <table className="kv-table"><tbody>
      {rows.map((r, i) => (
        <tr key={i}>
          <td className="k">{r[0]}</td><td>{r[1]}</td>
          <td className="k">{r[2]}</td><td>{r[3]}</td>
        </tr>
      ))}
    </tbody></table>
  );
}

function ValueCallout({ label, value }) {
  return (
    <table className="value-box"><tbody><tr>
      <td className="l">{label}</td><td className="n">{value}</td>
    </tr></tbody></table>
  );
}

function Bullets({ items }) {
  return <ul className="doc-ul">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>;
}

function MediaPlaceholder({ title, note, icon = "image" }) {
  return (
    <div className="media-col">
      <h4>{title}</h4>
      <div className="media-ph"><PhIcon name={icon} /><small>{note}</small></div>
    </div>
  );
}

function DocFooter({ page, total }) {
  return (
    <div className="doc-footer">
      <span>Collision Engineers Ltd | {WEB} | engineers@collisionengineers.co.uk</span>
      {page && <span className="page">— {page} of {total} —</span>}
    </div>
  );
}

/* Signature block — image above typed name + role (some documents are signed) */
const SIGNATORIES = {
  ed:   { img: "ed_mawdsley.png",   name: "E. Mawdsley",   role: "Independent Automotive Engineer" },
  neil: { img: "neil_oreilly.png",  name: "N. D. O'Reilly", role: "Independent Automotive Engineer" },
  andy: { img: "andy_patterson.png", name: "A. Patterson",  role: "Independent Automotive Engineer" },
};
function SignatureBlock({ who = "ed", closing = "Yours faithfully," }) {
  const s = SIGNATORIES[who] || SIGNATORIES.ed;
  return (
    <div className="sig-block">
      <p className="sig-closing">{closing}</p>
      <img className="sig-img" src={`../../assets/signatures/${s.img}`} alt={s.name} />
      <p className="sig-name">{s.name}</p>
      <p className="sig-role">{s.role}</p>
      <p className="sig-org">Collision Engineers Ltd</p>
    </div>
  );
}

Object.assign(window, { ADDRESS, WEB, Letterhead, RunningHead, DocTitle, DocSubtitle, SectionHeading, DataTable, KVTable, ValueCallout, Bullets, MediaPlaceholder, DocFooter, SignatureBlock, PhIcon });
