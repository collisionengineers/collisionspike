/* ============================================================
   Collision Engineers — email-body PREVIEW cleaner (TKT-070, DOMAIN LOGIC).

   The stored `inbound_email.body_preview` used to be built with
   `body.replace(/\s+/g, ' ')` — one unreadable run-on line where the typed
   message drowned between signature image-links and legal footers (the QDOS
   sample: logo/phone/email/web image URLs, an association link, then the full
   copyright/disclaimer block filled the entire preview). This module builds a
   READABLE preview instead:

     * line breaks preserved; blank-line runs collapsed to a single blank line;
     * bracketed image/link garbage removed ("[https://…/Logo%2050.png]",
       "[cid:image001.png@…]", "<tel:…>", "<mailto:…>", duplicate "<https://…>"
       angle-links);
     * remaining bare URLs shortened to their host (the domain stays visible);
     * quoted reply chains cut (the "-----Original Message-----" / "________"
       dividers, the Gmail "On … wrote:" attribution, an Outlook "From:/Sent:"
       header block, ">"-quoted lines) — mirrors the Python engine's
       _sender_written_text conventions;
     * the signature/legal tail cut: everything after a sign-off line ("Kind
       regards", …) except the signer's name line, and everything from a known
       legal/boilerplate marker ("Registered office", "This email carries a
       disclaimer", …) onward.

   PREVIEW ONLY. The FULL `body` is untouched — the VRM/ref sniffs and the
   parser keep reading the complete text (TKT-070 acceptance: cleaning applies
   to the stored preview, never to extraction inputs).

   PURE + DETERMINISTIC + FRAMEWORK-FREE. No I/O, no env.
   ============================================================ */

/** Markers that begin a QUOTED reply chain — everything from the earliest one onward is
 *  prior-thread text, not what this sender wrote. */
const QUOTE_DIVIDERS: RegExp[] = [
  /^-{3,}\s*Original Message\s*-{3,}\s*$/im,
  /^_{8,}\s*$/m, // Outlook reply divider
  /^\s*On\b[^\n]{0,160}\bwrote:\s*$/im, // Gmail attribution
  /^[ \t]*From:[ \t]*\S[^\n]*(?:\r?\n[ \t]*(?:Sent|To|Cc|Subject|Date):[ \t]*[^\n]*){1,5}/im, // Outlook header block
];

/** Sign-off lines that begin an email signature. The sign-off itself (and the signer's
 *  name line after it) is kept — everything beyond is signature furniture. */
const SIGN_OFF_RE =
  /^(?:kind\s+regards|kindest\s+regards|best\s+regards|warm\s+regards|regards|many\s+thanks|thanks(?:\s+again)?|thank\s+you|best\s+wishes|yours\s+sincerely|yours\s+faithfully|cheers)\s*[,.!]?\s*$/i;

/** Legal / footer boilerplate markers — the line carrying one (and everything after it)
 *  is dropped outright. Grounded on the live corpus (QDOS, Oakwood, Express Solicitors,
 *  Accident Specialists footers). */
const LEGAL_MARKERS: RegExp[] = [
  /\bregistered (?:office|in england|in scotland|number|no\b)/i,
  /\bauthorised and regulated\b/i,
  /\bthis (?:e-?mail|message) (?:carries a disclaimer|and any attachment|and its attachments?)/i,
  /\bif you (?:are not|have received this .* in error)\b/i,
  /\bintended (?:solely )?for the addressee\b/i,
  /\bprivacy (?:notice|policy) (?:may be read|can be found|is available)\b/i,
  /\breserves? copyright\b/i,
  /\byou are dealing with\b/i,
  /\bproud members? of\b/i,
  /\bconfidentiality notice\b/i,
  /\bplease consider the environment\b/i,
  /\bscanned for the presence of computer viruses\b/i,
  /\bcalls? (?:may|will) be recorded\b/i,
];

/** Bracketed link/image garbage: "[https://…]", "[cid:image001.png@…]" and the
 *  angle-bracket duplicates Outlook writes next to link text ("<tel:…>", "<mailto:…>",
 *  "<https://…>"). Removed entirely — they carry no typed content. */
const BRACKET_GARBAGE_RE = /\[(?:cid:|https?:\/\/)[^\]]*\]|<(?:tel:|mailto:|https?:\/\/)[^>\s]*>/gi;

/** A bare URL — shortened to its host so the domain stays visible (acceptance). */
const BARE_URL_RE = /\bhttps?:\/\/([^\s/<>"')\]]+)[^\s<>"')\]]*/gi;

/** Lines that are nothing but leftover link/bracket fragments once the garbage is
 *  stripped ("[Finalist] [PI logo] …", stray "]" runs). */
const RESIDUE_LINE_RE = /^[\s[\]()|·•–—-]*$/;

function cutAtEarliestQuote(text: string): string {
  let cut = text.length;
  for (const re of QUOTE_DIVIDERS) {
    const m = re.exec(text);
    if (m && m.index < cut) cut = m.index;
  }
  return text.slice(0, cut);
}

/**
 * Build a readable multi-line preview of an email body (TKT-070). Pure; the caller
 * applies its own length cap. Cleans the PREVIEW only — never feed the result to
 * VRM/ref extraction (those read the full body).
 */
export function cleanEmailBodyForPreview(body: string | null | undefined): string {
  if (!body) return '';
  let text = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 1) Cut the quoted reply chain, then drop ">"-quoted stragglers.
  text = cutAtEarliestQuote(text);

  // 2) Remove bracketed image/link garbage, then shorten remaining URLs to the host.
  text = text.replace(BRACKET_GARBAGE_RE, ' ');
  text = text.replace(BARE_URL_RE, '$1');

  // 3) Walk lines: drop ">"-quotes and residue, stop at legal boilerplate, and keep
  //    only the signer's name after a sign-off.
  const kept: string[] = [];
  let signOffSeen = false;
  let nameLinesAfterSignOff = 0;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/[ \t]+$/g, '');
    const trimmed = line.trim();
    if (trimmed.startsWith('>')) continue;
    if (LEGAL_MARKERS.some((re) => re.test(trimmed))) break;
    if (signOffSeen && trimmed) {
      // Keep at most one short, URL-free line after the sign-off (the signer's name);
      // anything longer or later is signature furniture (job title, numbers, address).
      if (nameLinesAfterSignOff >= 1 || trimmed.length > 40 || /[@\d]/.test(trimmed)) break;
      nameLinesAfterSignOff += 1;
      kept.push(line);
      continue;
    }
    if (!signOffSeen && SIGN_OFF_RE.test(trimmed)) {
      signOffSeen = true;
      kept.push(line);
      continue;
    }
    if (trimmed && RESIDUE_LINE_RE.test(trimmed)) continue;
    kept.push(line);
  }

  // 4) Collapse blank-line runs to a single blank line and trim the edges.
  return kept
    .join('\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
