# Website System

Layout rules, motion, interaction states, and component patterns for `collisionengineers.co.uk`.

Full component implementations are in `ui_kits/website/`.

---

## Layout

- **Max content width:** 1200px, centred
- **Gutters:** 24px
- **Section rhythm:** 96px vertical padding
- **Header:** fixed, h-20, transparent on load → frosted white on scroll (backdrop-filter)
- **Backgrounds:** dark charcoal bands, solid red CTA band, full-width section fills
- Mobile: single column + hamburger menu

---

## Backgrounds & imagery

- Photography is **automotive and grayscale** — garage, workshop, inspection shots
- Images dropped to 2–5% opacity **behind** dark sections as texture; never full-colour hero behind text
- Hero foreground image subtly fades to white at the bottom
- CTA band: faint white radial dot pattern at ~6% opacity (`radial-gradient(white 1.5px, transparent 1.5px)` at 32px)
- No gradients beyond logo shading and image protection fades. No blur/glass.

---

## Motion

- Fade + small translate entrances: `opacity 0→1`, `translateY 24px→0`, ~700ms
- Staggered delays: 70–80ms per card
- Triggered on scroll intersection
- Hover: `opacity 0.9` or darker-red swap; icons scale to 1.1 on card hover
- **Reduced motion:** honour `prefers-reduced-motion` — show end-state, skip transforms

No bounce, no spring, no looping decorative animation.

---

## Interaction states

| State | Style |
|---|---|
| Hover (primary red) | `opacity .9` or `#8F1422` swap |
| Hover (secondary/ghost) | `#F5F4F2` fill |
| Hover (contact row) | hairline-darken + `0 1px 4px rgba(0,0,0,.06)` |
| Hover (nav link) | red text |
| Hover (service card icon) | scale 1.1 |
| Active/pressed | subtle opacity/brightness drop |
| Focus | 3px red focus ring `rgba(219,8,22,.38)` |
| Disabled | reduced opacity + `not-allowed` cursor |

---

## Eyebrow pattern

```css
.ce-eyebrow {
  color: var(--ce-red);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}
```

Used above section headings and on service cards.

---

## Icon chips (service cards)

Square chips, 40–44px, 2px radius, red `#DB0816` fill with white icon. Icons scale to 1.1 on hover. Chips sit on charcoal background sections.

---

## WhatsApp floating pill

Bottom-right fixed position. Green `#25D366`. 999px radius. Shadow `0 8px 24px rgba(0,0,0,.20)`. Always present.

---

## Components

See `ui_kits/website/` for full implementations:
- `site-parts-a.jsx`: Header, Hero, TrustBar, ServicesSection, ServiceCard, Reveal, Eyebrow, WebButton
- `site-parts-b.jsx`: AboutSection, DifferenceSection, CTABand, ContactSection, Footer, WhatsAppButton
- `icons.jsx`: CEIcon component (inlined Lucide paths)
