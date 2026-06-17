# Iconography

## Icon system

**Lucide** is the icon system for all web/UI surfaces. Use Lucide for everything. No emoji. No unicode dingbats. No custom/hand-drawn icons.

- Stroke style: `stroke-width: 2`, `round` caps & joins
- ViewBox: 24×24
- Rendered size: 16–24px
- Colour: inherit `currentColor`

## Loading Lucide in static HTML

```html
<script src="https://unpkg.com/lucide@latest"></script>
<script>lucide.createIcons();</script>
```

Use `<i data-lucide="shield"></i>` for inline icons.

## Common glyphs in use on the CE website

`Shield` · `FileText` · `MapPin` · `Clock` · `Search` · `TrendingDown` · `BarChart` · `TriangleAlert` · `CircleCheckBig` · `Phone` · `Mail` · `ChevronRight` · `ArrowRight` · `Send` · `Linkedin` · `Menu`

## Icon chip (square chip variant)

```css
.icon-chip {
  width: 44px;
  height: 44px;
  border-radius: 2px;
  background: #db0816;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}
```

Used on service cards (charcoal background). Icon scales to 1.1 on hover.

## Faint red-tint variant

Icon with red color on a faint `rgba(219,8,22,0.07)` background. Used in lighter-background contexts.

## Documents & reports

Icons are not typically used in the document/print surface. The letterhead system uses text-based section headings, not icons.

## Brand logo

The gear-C logo is in `assets/logo_no_margin.png` (red gear-C lockup) and `assets/web_logo_white.png` (white reverse). Never redraw the gear — always use the supplied assets.
