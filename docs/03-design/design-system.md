# Instrument

The Nextly design language. Dense, technical, near-monochrome.

Live reference: open **`/design-system`** in any environment. It renders every
token and primitive in both themes and 404s in production.

---

## The brief, restated

Nextly has no brand yet. The instruction was that this must not look
vibe-coded or AI-boilerplated.

Those failure modes are specific and avoidable, so they are named here as things
this system deliberately does not do:

| Tell | Instead |
|---|---|
| Stock shadcn zinc neutrals with a violet accent | Neutrals tinted to hue 207; cyan as the only accent |
| Four identical stat cards with invented "+12.5% vs last month" | Four position tiles carrying the real 12-week series |
| `rounded-2xl` and `shadow-sm` on everything | 2 / 6 / 10px radii; borders carry elevation |
| Inter or Geist | Instrument Sans + JetBrains Mono |
| Emoji as iconography | Lucide, 14–16px, `text-ink-4` |
| Gradient headline text | Gradient appears once, on the sign-in plate |
| A filled brand-colour pill on the active nav item | A 2px accent rule at the rail's edge |
| A generated logo | A type lockup and a signal glyph, clearly provisional |
| "No data" empty states | Empty states that say what the page is for and offer the action |

---

## Colour

All tokens: [`src/styles/tokens.css`](../../src/styles/tokens.css). Nothing
defines a colour anywhere else.

### The neutrals are not grey

Every surface, border and text colour is tinted toward **hue 207°** — the hue of
`#125488` from the supplied palette. This is the single highest-leverage
decision in the system. Grey chrome reads as a default; a consistently tinted
ramp reads as designed, even to someone who could not say why.

```
Dark    base hsl(207 42% 5.5%)   raised hsl(207 32% 8.5%)   text hsl(200 30% 96%)
Light   base hsl(205 30% 98.5%)  raised hsl(0 0% 100%)      text hsl(207 48% 11%)
```

### The brand palette is for data only

```
#125488 → #2A93D5 → #37CAEC → #3DD9D6 → #ADD9D8
```

These five appear in **charts and nowhere else**. Chrome stays near-monochrome
so the data is the only thing carrying colour. It is what keeps a dense screen
calm.

### One accent

`#37CAEC` in dark, darkened to `hsl(196 82% 36%)` in light so text on white
clears WCAG AA. Used for: the primary button, the active nav rule, focus rings,
links. Nothing else.

### Semantic colour is scarce on purpose

| Token | Meaning |
|---|---|
| `positive` (teal) | Money in, profit |
| `negative` (warm red) | Money out, loss, errors |
| `warning` (amber) | Low stock, stale rate |
| `info` (blue) | Neutral status |

Applied to individual figures via `<Money tone="flow">`, never to whole rows. A
table where every number is coloured is a table nobody can scan.

### Both themes are designed, not inverted

Dark is not light with the lightness flipped. Saturation and lightness are tuned
per theme, and elevation works differently: light mode uses a soft shadow, dark
mode uses a 1px inner top highlight, because a drop shadow against near-black is
invisible and only adds mud.

Every token is defined on bare `:root` (light) first, then redefined under a
single `.dark` class — not `@media (prefers-color-scheme: dark)` or
`[data-theme="dark"]`; `tokens.css` has no media query and no data-attribute
selector at all. `next-themes` (`attribute="class"`, `enableSystem`) is what
adds `.dark` to `<html>`: it reads the OS preference and injects a small
blocking inline script that sets the class before first paint, so there is no
flash of the wrong theme — but it is JS, run synchronously pre-hydration, not
CSS reading the media query itself.

---

## Type

**Instrument Sans** for interface text. **JetBrains Mono** for every number.

### Every number is tabular

```css
.tabular {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1, 'zero' 1;
}
```

Applied by `<Money>`, `<Numeric>`, `<Percent>` and the `numeric` prop on table
cells. Never hand-write a formatted amount into JSX.

Two reasons, one aesthetic and one functional: columns line up on the decimal,
and a larger number is physically wider, so an outlier is visible before it is
read.

### Scale

| Use | Size | Weight |
|---|---|---|
| Page title | 20px / `-0.02em` | 500 |
| Display figure | 30px / `-0.03em` | 400 mono |
| Panel title | 13px | 500 |
| Body, table cell | 13px | 400 |
| Supporting | 12px | 400 |
| Section label | 11px uppercase / `0.08em` | 400 |

Nothing is bold. Hierarchy comes from size, colour and space.

---

## Form

**Radii** — `2px` data rows, `6px` controls, `10px` cards. Small and consistent.

**Elevation** — a hairline border plus one soft shadow (light) or one inner
highlight (dark). There is exactly one elevation step. If something needs to
float further, it is an overlay and uses `shadow-overlay`.

**Spacing** — 4 / 8 / 12 / 16 / 24 / 32 / 48. Table rows are 32px.

Density is the point. Someone should see their whole stock position without
scrolling.

---

## Motion

Sparing and purposeful. `--ease-out-instrument: cubic-bezier(0.22, 1, 0.36, 1)`.

- 150ms on colour and border transitions
- `active:translate-y-px` on buttons, so a press is felt
- Overlays fade and scale from 98%
- `prefers-reduced-motion` collapses everything to 0.01ms

Nothing bounces. Nothing pulses except a loading skeleton.

---

## Component rules

1. `components/ui` knows nothing about Nextly. `components/overview` knows
   everything. Compositions in between go in `components/patterns`.
2. **Never** render a raw formatted amount. Use `<Money>`.
3. Every skeleton matches the geometry of what replaces it.
4. Every empty state names the action that fills it.
5. Colour is information. If it is not carrying meaning, it is noise.
6. New colours go in `tokens.css` or they do not exist.

---

## The storefront skin — "Northlight"

The dashboard is dense and near-monochrome because it is read, not sold
from. The public shop has the opposite job, so it gets its own skin, taken
from Fairphone's playbook: the product always sits on a soft colour FIELD —
a light-blue wash (`store-field`, `store-hero-field`) — never on chrome, and
the page is white and open rather than tinted and dense.

Blue, deliberately: this shop sells IoT hardware, and blue is the
category's near-universal signal for "connected." A warm amber palette was
tried briefly and reverted — it read as artisanal/organic rather than
tech, fighting the product instead of selling it. The accent is a lighter,
softer blue than the original dark navy ("baby blue," directly) rather
than a plain revert; the soft radial wash behind product photos stays, on
purpose — for hardware like this, a gentle blue glow reads as ambient
"signal" light, not a decorative gradient.

Scoped, not forked. `.nx-store` on the `(store)` layout root redefines the
same `--nx-*` custom properties the whole app consumes; because
`@theme inline` keeps the Tailwind utilities pointing at live `var()`
references, every existing component re-skins with zero code changes, and
the dashboard is untouched. Light only — the store layout gives its own
root an explicit `bg-base` background rather than relying on inheritance,
so nothing can show through it regardless of the visitor's OS theme (see
`(store)/layout.tsx`'s doc comment for the bug this replaced).

Northlight's own rules, on top of Instrument's:

| | Instrument (dashboard) | Northlight (storefront) |
|---|---|---|
| Canvas | tinted base `hsl(205 30% 98.5%)` | pure white; light-blue only as fields |
| Accent | cyan `#37CAEC` darkened | a softer "baby blue" `hsl(205 75% 45%)`, lighter than a corporate navy |
| Bright note | accent = cyan | `hsl(199 85% 65%)` returns as highlight: NEW pills, stock dots, footer CTA |
| Cards | hairline border, 10px radius, one shadow | `store-card`: 16px radius, lift-on-hover, product on a colour field |
| CTAs | 28/32/36px dense controls | pill (`rounded-full`) 36–44px — a shop invites, a tool confirms |
| Type | 13px body, weight 500 max | up to 54px/600 hero, 15–16px body |
| Closing move | — | one navy promise band above the footer (`StoreFooterBanner`) |

Storefront-specific tokens (`--nx-store-bright`, `--nx-store-navy` and
friends) live in the same `.nx-store` block in `tokens.css`, mapped through
`@theme inline` as `store-bright` / `store-navy` utilities with light-theme
fallbacks. Rule 6 still holds: nothing defines a colour anywhere else.

---

## The wordmark is provisional

`components/shell/wordmark.tsx` is a type lockup plus a signal glyph — three
arcs and a node. It says "connected device" without pretending to be finished
identity work, and it is one file to delete when real branding arrives.

A generated logo would have been the fastest possible way to make the whole
product look templated.
