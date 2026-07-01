# Collision Engineers — Marketing Website UI Kit

A high-fidelity recreation of the public site at **collisionengineers.co.uk** (Home page), built
from the scraped source in `docs/reference_information/cewebsitescraped/`.

## Run it
Open `index.html`. It loads `../../colors_and_type.css`, React + Babel (pinned), and the JSX below.
Single-page, scroll-anchored, fully responsive (desktop / tablet / mobile menu).

## Files
| File | Contents |
|---|---|
| `index.html` | App shell, responsive CSS, mounts `<App>`. |
| `icons.jsx` | `CEIcon` — inlined Lucide paths (stroke 2, round caps). |
| `site-parts-a.jsx` | `Reveal` (scroll animation), `Eyebrow`, `WebButton`, `Header`, `Hero`, `TrustBar`, `ServicesSection`, `ServiceCard`. |
| `site-parts-b.jsx` | `AboutSection`, `DifferenceSection`, `CTABand`, `ContactSection`, `Footer`, `WhatsAppButton`. |

## Design notes (lifted from source)
- **Red `#DB0816`** primary, **warm charcoal `#2C2A27`** dark sections/footer, white grounds.
- **Sharp 2px** corners everywhere (`rounded-sm`). 1200px max width, 96px section rhythm, 24px gutters.
- **Eyebrows:** red hairline + 12px uppercase label, letter-spacing .22em.
- **Geometric corner accents** bracket the hero image (2px red L-corners).
- **Imagery** is grayscale + high-contrast, dropped to 2–5% opacity behind dark sections as texture.
- **Service cards** sit on charcoal with red icon chips; icon scales 1.1 on hover.
- **CTA band** is solid red with a faint white dot-grid (`radial-gradient` 32px @ 6%).
- **Motion:** fade + translate on scroll (IntersectionObserver), staggered; honours reduced-motion.
- **Fixed header** goes transparent → frosted white on scroll. Floating green WhatsApp pill bottom-right.
- Icons: **Lucide**. Copy: British English, calm and factual — see root `README.md` §2.

## Cut corners (intentional)
The contact form is a visual mock (submit shows a success state, no network). Nav links scroll to
in-page anchors rather than separate routes. About / Services / Contact / Repairer Portal pages from
the live site are not recreated — this kit covers the Home page and all its reusable components.
