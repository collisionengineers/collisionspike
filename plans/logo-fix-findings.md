# Logo "broken image" — live root-cause (2026-06-18, corrected)

**The user was right: the logo is broken on every screen.** My earlier "200 OK = fine" was wrong — a 200
status doesn't guarantee a decodable body.

## Evidence (Chrome DevTools, live deployed app)
- Rail logo + top-bar logo both render as the browser **broken-image placeholder + alt text**.
- The served asset `…/assets/web_logo_white-DOCB7O8X.png` returns **200, `content-type: image/png`,
  `content-length: 145129`, `x-content-type-options: nosniff`**, from same-origin (`'self'`); page CSP
  `img-src 'self' data:` permits it.
- Navigating directly to that URL shows a **broken-image icon** → the browser cannot decode the bytes.
- **Source is a valid PNG:** `mockup-app/src/assets/web_logo_white.png` = PNG 1024×571, **82,978 bytes**
  (magic `89 50 4e 47`). Current local `dist/assets/web_logo_white-DOCB7O8X.png` = also **82,978 bytes**,
  valid PNG. `logo_no_margin.png` = valid PNG, 199,792 bytes.
- **Deployed bytes (145,129) ≠ dist bytes (82,978)** for the *same content-hash filename*.

## Root cause
The **deployed** PNG is **binary-corrupted** (≈75% larger, undecodable) — the signature of **LF→CRLF
text-mode mangling of the binary** during the prior build/packaging/`pac code push`. With `nosniff`, the
browser is forbidden from content-sniffing and fails to render. This is a **deploy-pipeline corruption**,
not a code/CSP/404/Vite-base issue.

## Fix (decision tree)
1. **Clean rebuild + `pac code push`, then verify** the deployed asset is **82,978 bytes / renders**
   (navigate to the asset URL; expect the logo, not a broken icon). If fixed → it was a one-off.
2. **If corruption recurs** (deployed bytes ≠ dist bytes after a fresh push → `pac code push` is mangling
   binaries): make the logos corruption-proof —
   - inline them as **base64 `data:` URIs** (CSP `img-src` already allows `data:`) via Vite
     `assetsInlineLimit` / explicit inline import, **or**
   - ship an optimised **SVG** logo (text-based; render-safe).
   The data-URI route removes the separate binary asset entirely and is the most robust.
3. Ensure a repo **`.gitattributes`** marks `*.png *.otf *.ttf *.woff* -text` (binary) so git never
   CRLF-translates them (defence in depth).

## Separate, possibly-related
Console error **`React.createElement: type is invalid … got undefined`** (a bad default/named import or an
invalid lucide-react icon) — being traced by the UI + code-audit planning agents; fix alongside the logo.
