# Handoff: FilmRank Landing Page

## Overview

Pre-login marketing landing page for FilmRank, a film-ranking app built on head-to-head comparisons instead of star ratings. The page's distinguishing feature is a **live, playable demo in the hero**: the visitor is shown two films side by side and clicks one. No signup, no modal, no "watch a video." After four picks, a save prompt appears offering to persist the ranking behind an account.

The conversion argument the page makes: *you are already using the product.*

## About the Design Files

The file in this bundle (`Landing.dc.html`) is a **design reference created in HTML** — a working prototype showing intended look and behavior. It is not production code to copy directly.

The task is to **recreate this design in the target codebase's existing environment** (React, Vue, Svelte, etc.) using its established patterns, component library, and styling approach. If the codebase has a Button, Card, or layout primitive, use it — do not port the inline styles verbatim. If no frontend environment exists yet, choose the framework appropriate to the project and implement there.

The prototype uses inline styles throughout because of the authoring environment it was made in. That is an artifact of the tool, not a design instruction. Translate to whatever the codebase uses (CSS modules, Tailwind, styled-components, plain stylesheets).

## Target Codebase

The repo is a **Vite + React 19 + TypeScript** app. Relevant conventions, confirmed by reading it:

- **Styling:** Tailwind 3 with shadcn-style CSS variables in `src/index.css`. Semantic tokens (`bg-background`, `text-muted-foreground`, `border-border`) — use them, don't write hex values into class names.
- **Animation:** `motion/react` (Motion v12). Use it rather than CSS transitions where the codebase already does.
- **Icons:** `@heroicons/react` and `lucide-react` are both present.
- **Routing:** `react-router-dom` v7. `useNavigate()` for CTAs.
- **Auth/data:** Supabase, via `src/lib/supabaseClient.ts`.
- **Path:** this replaces `src/pages/Landing.tsx`.

### On the palette — read this before touching `index.css`

The existing theme is already called **"Marquee Pop — cinema-ticket cream, marquee red, ticket gold."** The design in this handoff is the same idea in dark: the current `.dark` block is close to it already (`--background: 20 14% 8%` vs the design's `#12100E`; `--primary: 8 70% 55%` vs `#C9522F`; `--accent: 42 80% 62%` vs `#E8BE4A`).

So this is not a new palette — it is the existing dark palette, tightened. Two options:

1. **Preferred:** nudge the `.dark` variables to the exact values in the Design Tokens section below and render the landing page in dark mode. Keeps one theme system.
2. Add landing-scoped variables if the page must be dark while the app stays light.

Do **not** hardcode the hex values inline across the JSX. The one exception is the marquee bulb gradients and the poster glare — those are literal decorative gradients and belong in `index.css` as utility classes or in a small styled wrapper component.

### Typography change

The design uses **Oswald** (all headings and UI) and **Limelight** (wordmark only). The codebase's `font-display` is currently **Fraunces**. This is a real conflict — Fraunces is a soft serif, Oswald is a condensed uppercase sans, and the marquee aesthetic depends on the latter. Either extend `fontFamily` with `marquee: ['Oswald', ...]` and `wordmark: ['Limelight', ...]` for this page, or take it as a signal to move the whole app's display face. **Ask before changing it globally** — other pages are built on Fraunces.

### Existing components to reckon with

`src/components/ComparisonAnimation.tsx` and `src/components/AnimatedLeaderboard.tsx` already do versions of the two interactive pieces in this design. Read both before writing anything new. If `ComparisonAnimation` can be restyled to the marquee treatment and given the scoring logic below, do that rather than building a second comparison component. Same for `AnimatedLeaderboard` and the ranked list.

## Fidelity

**High fidelity.** Colors, typography, spacing, and interaction behavior are final. Recreate faithfully. Every hex value, font size, and letter-spacing figure below is exact and intentional — particularly the letter-spacing on the uppercase Oswald headings, which carries most of the cinema-marquee character.

Two things are explicitly placeholders, called out again in the Assets section:

1. **Film posters** — rendered as diagonal-stripe placeholder blocks with the word "poster." Real poster artwork is required.
2. **Sample film data** — ten hardcoded titles used to make the demo playable. Replace with real catalog data.

---

## Screens / Views

Single page, six stacked regions in source order.

### 1. Header (sticky)

**Purpose:** Persistent branding and the primary signup CTA.

**Layout:** Flex row, `space-between`, `align-items: center`, gap 24px. Padding `18px 40px`. `position: sticky; top: 0; z-index: 5`.

**Styling:**
- Background `rgba(18,16,14,.92)` with `backdrop-filter: blur(8px)` — semi-transparent so content scrolls visibly beneath
- Bottom border `1px solid #2A231C`

**Components:**

*Logo lockup* — flex row, gap 11px:
- Bulb dot: 11×11px circle, background `#FFE7A6`, `box-shadow: 0 0 12px 2px rgba(232,190,74,.7)` (the glow is what sells it — don't drop it)
- Wordmark: "FilmRank", Limelight serif, 19px, `letter-spacing: .06em`, color `#F4EADB`

*Right cluster* — flex row, gap 22px:
- "Sign in" — Oswald 15px, `letter-spacing: .04em`, color `#9A8F80`, plain text link
- "Create free account" — Oswald 15px, weight 600, `letter-spacing: .06em`, uppercase. Background `#C9522F`, color `#FFF3E2`, padding `10px 20px`, radius 4px, `box-shadow: 0 0 0 1px rgba(232,190,74,.5), 0 8px 20px -8px rgba(201,82,47,.7)` — a gold hairline ring plus a warm drop glow

### 2. Marquee bulb strip

**Purpose:** Decorative divider. Establishes the cinema-marquee motif that recurs throughout.

16px tall. Two stacked backgrounds:
```css
background:
  radial-gradient(circle at 12px 8px, #FFE7A6 0 3.2px, rgba(232,190,74,.3) 4px, transparent 4.6px) 0 0/24px 16px,
  linear-gradient(#B9451F, #8E2F16);
animation: bulbs 2.8s ease-in-out infinite;
```
```css
@keyframes bulbs { 0%,100% { opacity: 1 } 50% { opacity: .7 } }
```
The bottom instance of this strip (before the footer) is **identical but without the animation** — one blinking strip per page is characterful, two is a distraction.

### 3. Hero — live demo

**Purpose:** The core of the page. Visitor plays the product immediately.

**Layout:** `max-width: 1080px`, centered, padding `60px 40px 76px`.

**Components, top to bottom:**

*Eyebrow row* — flex, gap 14px, wrap, `margin-bottom: 18px`:
- "Now showing" — Oswald 11px, weight 500, `letter-spacing: .24em`, uppercase, color `#E8BE4A`
- 5×5px dot, `#4A3E31`
- "Round {NN} · no stars, no scores out of ten" — Oswald 11px, weight 500, `letter-spacing: .18em`, uppercase, color `#7E7365`. `{NN}` is the live pick counter, zero-padded to two digits, starting at `01`

*H1* — "Which one did you like more?" — Oswald 60px, `line-height: 1.06`, `letter-spacing: .015em`, weight 600, uppercase, `max-width: 17ch`, `margin: 0 0 18px`

*Subhead* — "That is the whole app. Pick a side below and watch a ranked list build itself out of your answers." — 17px, `line-height: 1.6`, color `#9A8F80`, `max-width: 52ch`, `margin: 0 0 40px`

*The comparison card* — `max-width: 760px`. This is a two-layer construction:

**Outer layer** (the marquee frame): padding 20px, radius 6px. Background is four repeating bulb gradients — top edge, bottom edge, left edge, right edge — layered over `linear-gradient(160deg, #B9451F, #8E2F16)`:
```css
background:
  radial-gradient(circle at 12px 8px,#FFE7A6 0 3px,rgba(232,190,74,.28) 3.8px,transparent 4.4px) 0 0/24px 16px repeat-x,
  radial-gradient(circle at 12px 8px,#FFE7A6 0 3px,rgba(232,190,74,.28) 3.8px,transparent 4.4px) 0 100%/24px 16px repeat-x,
  radial-gradient(circle at 8px 12px,#FFE7A6 0 3px,rgba(232,190,74,.28) 3.8px,transparent 4.4px) 0 0/16px 24px repeat-y,
  radial-gradient(circle at 8px 12px,#FFE7A6 0 3px,rgba(232,190,74,.28) 3.8px,transparent 4.4px) 100% 0/16px 24px repeat-y,
  linear-gradient(160deg,#B9451F,#8E2F16);
box-shadow: 0 30px 60px -30px rgba(255,180,90,.35);
```
A framed border image is an acceptable substitute if the gradient stack proves fragile, but the bulbs must wrap all four sides.

**Inner layer**: background `#1A1613`, border `1px solid #3A2E24`, radius 3px, padding 22px.

**Inside that**: CSS grid, `grid-template-columns: 1fr 68px 1fr`, `align-items: center`.

*Poster buttons (columns 1 and 3)* — each is a real `<button>`: transparent background, no border, `padding: 0`, `cursor: pointer`, `text-align: left`, `font: inherit`, `color: inherit`, `transition: transform .18s`. Hover: `transform: translateY(-3px)`.

Inner poster frame: `background: linear-gradient(160deg,#3A2E24,#221B15 55%,#332921)`, radius 4px, padding 9px, `box-shadow: 0 22px 40px -22px rgba(0,0,0,.9), inset 0 0 0 1px rgba(232,190,74,.5)`.

Poster image area: `aspect-ratio: 2/3`, `overflow: hidden`, `position: relative`. Placeholder fill is `repeating-linear-gradient(45deg, #EFE4CE 0 9px, #E6D9BF 9px 18px)` — **note the left card uses 45deg and the right uses 135deg**, so the two placeholders mirror each other.

Over the poster area, a non-interactive glare overlay (`position: absolute; inset: 0; pointer-events: none`):
```css
background: linear-gradient(115deg, rgba(255,255,255,.3) 0 22%, rgba(255,255,255,.04) 22% 34%, transparent 34% 62%, rgba(255,255,255,.14) 62% 70%, transparent 70%);
```
This reads as glass reflection on a poster case. Keep it when real posters are dropped in.

The word "poster", absolutely positioned `left: 12px; bottom: 12px`, Oswald 10px weight 500, `letter-spacing: .14em`, uppercase, `#A2967F`. **Remove this once real artwork is wired.**

Caption block below the poster, padding `12px 4px 4px`, centered:
- Title — Oswald 17px, weight 600, `letter-spacing: .06em`, uppercase, `line-height: 1.25`, color `#F4EADB`
- Year — Oswald 11px, weight 500, `letter-spacing: .12em`, color `#E8BE4A`, `margin-top: 6px`

*VS badge (column 2)* — 46×46px circle, background `#C9522F`, color `#FFF3E2`, flex centered, Oswald 13px weight 700, `letter-spacing: .1em`, `box-shadow: 0 0 0 3px rgba(232,190,74,.55), 0 0 18px rgba(232,190,74,.3)`.

*Skip row* — `margin-top: 20px`, flex, gap 14px, centered vertically:
- "Haven't seen one?" — Oswald 12px weight 500, `#7E7365`
- "Skip this pair" button — Oswald 12px weight 500, `#9A8F80`, transparent background, `1px solid #3A2E24`, radius 4px, padding `7px 14px`. Hover: `border-color: #E8BE4A; color: #E8BE4A`

*Save prompt (conditional)* — appears only when pick count ≥ 4. `margin-top: 28px`, `max-width: 760px`, flex row, gap 18px, wrap. Background `#1A1613`, border `1px solid #3A2E24`, radius 4px, padding `16px 20px`. Animates in with `fadeUp .35s ease both`:
```css
@keyframes fadeUp { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
```
- Copy (flex 1, `min-width: 260px`): "You're four picks into a ranking. It disappears when you close the tab — keep it and it becomes your Top 100." — 14px, `line-height: 1.5`, `#9A8F80`
- CTA: "Save my list" — Oswald 14px weight 600, `letter-spacing: .06em`, uppercase, background `#E8BE4A`, color `#2A1D14`, padding `11px 22px`, radius 4px, `white-space: nowrap`

Note this CTA is **gold**, unlike the orange CTAs elsewhere. That is deliberate: it is the highest-intent moment on the page and should not read as the same generic button.

### 4. Three-step explainer

**Purpose:** Explain the mechanic for visitors who scrolled past the demo without playing.

**Layout:** Full-bleed band. Background `#171310`, `border-top` and `border-bottom` `1px solid #2A231C`. Inner container `max-width: 1080px`, centered, padding `58px 40px`, `display: grid`, `grid-template-columns: repeat(3, 1fr)`, `gap: 36px`.

**Each cell:**
- Number — "01" / "02" / "03", Oswald 11px weight 500, `letter-spacing: .2em`, color `#E8BE4A`, `margin-bottom: 12px`
- H3 — Oswald 20px weight 600, `letter-spacing: .06em`, uppercase, `margin: 0 0 10px`
- Body — 14px, `line-height: 1.65`, color `#9A8F80`, `margin: 0`

**Exact copy:**

| # | Heading | Body |
|---|---------|------|
| 01 | Pick a side | Two films at a time. One click, no review box, no half-star agonising. |
| 02 | The list reorders | Every answer moves both films. Ten picks in, the order already looks like you. |
| 03 | Your top 100 writes itself | Come back whenever. The ranking keeps sharpening in the background. |

### 5. Payoff section

**Purpose:** Show the artifact the product produces, and make the argument against star ratings.

**Layout:** `max-width: 1080px`, centered, padding `72px 40px`. Grid `1fr 1.1fr`, `gap: 56px`, `align-items: center`. The right column is intentionally wider.

**Left column:**
- H2 — "A list you'd actually defend" — Oswald 40px, `line-height: 1.1`, `letter-spacing: .015em`, weight 600, uppercase, `margin: 0 0 16px`
- Body — "Star ratings flatten everything into fours and fives. Comparisons force a real answer, so the order at the top means something." — 16px, `line-height: 1.65`, `#9A8F80`, `max-width: 42ch`, `margin: 0 0 26px`
- CTA — "Create free account", same treatment as the header CTA but larger: Oswald 15px weight 600, padding `13px 26px`, `box-shadow: 0 0 0 1px rgba(232,190,74,.5), 0 10px 22px -8px rgba(201,82,47,.6)`
- Reassurance — "Free. About thirty seconds." — Oswald 12px weight 500, `#7E7365`, `margin: 16px 0 0`

**Right column — the Top 100 card.** Same two-layer marquee construction as the hero card, but smaller and with bulbs on the horizontal edges only:
- Outer: padding 14px, radius 6px, top and bottom bulb strips at `20px 14px` tile size with 2.6px bulb radius, over `linear-gradient(160deg,#B9451F,#8E2F16)`
- Inner: background `#F2EDE1` — **this is the one light surface on the page**, reading as printed paper. Radius 2px, padding `18px 20px`, `box-shadow: inset 0 0 0 1px rgba(0,0,0,.18)`

Card header: live label — Oswald 11px weight 500, `letter-spacing: .2em`, uppercase, color `#8E2F16`, `margin-bottom: 10px`. Text is `Your list · not started` at zero picks, otherwise `Your list · {n} pick` / `{n} picks`.

List rows: grid `28px 1fr 34px auto`, gap 12px, `align-items: center`, padding `11px 0`, `border-top: 1px solid #D6CCB6`:
- Position — Oswald 12px weight 500, `#C9522F`
- Title — Oswald 16px weight 600, `letter-spacing: .07em`, uppercase, `#231D18`
- **Movement indicator** — Oswald 11px weight 500, `letter-spacing: .06em`, color `#1F7A4D`, right-aligned, `transition: opacity .3s`. Renders `▲{n}` where `n` is the number of positions that film climbed on the most recent pick. When a film did not climb, the element stays mounted at `opacity: 0` — **do not unmount it**, or the row width jumps on every pick.
- Year — Oswald 11px weight 500, `#8B8377`

**This list is the visitor's own.** It renders the top 6 of the live demo ranking and reorders as they play. It is not sample data and carries no name attribution.

Movement is shown only for the last pick, then clears on the next one. Films that fell show nothing — a landing page demo should feel like progress, not like a scoreboard punishing you.

With `motion/react` available, the reorder should be animated. `AnimatedLeaderboard.tsx` already solves this; reuse its approach.

### 6. Footer

Bulb strip (unanimated), then: background `#0E0C0A`, padding `28px 40px`, flex row `space-between`, gap 24px, wrap.
- "FilmRank" — Limelight 16px, `letter-spacing: .06em`, `#F4EADB`
- "Start with two films." — Oswald 12px weight 500, `letter-spacing: .14em`, uppercase, `#7E7365`

---

## Interactions & Behavior

### The demo

Ten films are held in memory, each with a score starting at 0.

**On pick:** the chosen film's score increases by **1**, the rejected film's score decreases by **0.5**. Then a new random pair is drawn and the round counter increments.

The asymmetric weighting is intentional — winning should move a film further than losing moves it, so that films the visitor keeps choosing rise quickly and produce a visibly reordering list within a handful of picks. A symmetric ±1 makes the list feel sluggish over a ten-item set.

**Ranking order:** sort by score descending, ties broken by original index ascending (stable and deterministic).

**On skip:** draw a new pair. No scores change, round counter does **not** increment.

**Pair selection:** draw two distinct random indices; reject the draw if it exactly repeats the previous pair. The prototype guards this loop at 50 attempts to avoid a hang on small catalogs — keep an equivalent bailout.

**Save prompt:** appears once pick count reaches 4 and stays visible thereafter. It does not dismiss.

**Movement:** after each pick, compare the ranking order before and after. Any film whose index decreased gets a `▲{delta}` badge in the Top-6 card. The set clears and recomputes on the next pick.

**Persistence:** the full demo state (`films`, `pair`, `picks`, `moves`) is written to `localStorage` under the key `filmrank.demo` after every pick and every skip, and restored on mount. A returning visitor picks up where they left off.

Guard the read: wrap `JSON.parse` in try/catch, and discard the saved state if its film array length doesn't match the current catalog — otherwise a catalog change leaves visitors with a corrupt list. The prototype does exactly this.

Once a visitor signs up, this localStorage state should be migrated into their Supabase account rather than discarded. That is the entire promise the save prompt makes, and dropping it would be worse than never offering it.

### Transitions

- Poster hover: `transform: translateY(-3px)`, `.18s`
- Save prompt entry: `fadeUp .35s ease both`
- Bulb strip: `bulbs 2.8s ease-in-out infinite` (top strip only)
- Skip button hover: border and text to `#E8BE4A`, no explicit transition in the prototype — add `.15s` if the codebase's convention is to transition color changes

### Responsive behavior

**Not designed.** The prototype is fixed at desktop width (preview 1280×900) and the three-column explainer, two-column payoff, and side-by-side comparison grid will all break below roughly 900px. This needs a mobile pass before ship. Suggested starting points, to be confirmed with design:
- Comparison grid → stack vertically with the VS badge between, or keep side by side with the posters narrowed (side-by-side is the whole point of the interaction and should survive if at all possible)
- Explainer → single column
- Payoff → single column, list card below the copy
- H1 60px → around 36px

### States not designed

Loading, error, and empty states are absent from the prototype. At minimum the demo needs a loading state for the initial film pair if it fetches from an API rather than shipping with seed data.

---

## State Management

Component-local state is sufficient. Nothing here needs a global store.

| Variable | Type | Purpose |
|---|---|---|
| `films` | `{id, title, year, score}[]` | The comparison pool |
| `pair` | `[number, number]` | Indices of the two films currently shown |
| `picks` | `number` | Count of decisions made; drives the round label and the save prompt |
| `moves` | `Record<id, string>` | Rank deltas from the last pick; rendered in the Top-6 card |

**Transitions:** `pick(winner, loser)` → update scores, recompute order, derive moves, draw new pair, increment picks. `skip()` → draw new pair only.

**Persistence:** `localStorage`, key `filmrank.demo`. See "Interactions & Behavior" above.

⚠️ **Copy conflict to resolve.** The save prompt currently reads "It disappears when you close the tab." That is no longer true. Replace with something accurate — e.g. "This list lives on this device. Save it to keep it anywhere." Do not ship the current line.

**Data fetching:** the ten films are hardcoded. In production these should come from the catalog, ideally weighted toward well-known titles so a visitor is likely to have seen both.

---

## Design Tokens

### Colors

| Value | Role |
|---|---|
| `#12100E` | Page background |
| `#171310` | Alternate band background (explainer) |
| `#0E0C0A` | Footer background |
| `#1A1613` | Card interior |
| `#2A231C` | Hairline border, subtle |
| `#3A2E24` | Border, standard |
| `#4A3E31` | Muted dot |
| `#F4EADB` | Primary text |
| `#9A8F80` | Secondary text |
| `#7E7365` | Tertiary text |
| `#E8BE4A` | Gold accent — eyebrows, years, links, high-intent CTA |
| `#F7DC9C` | Gold, link hover |
| `#FFE7A6` | Bulb highlight |
| `#C9522F` | Primary CTA / VS badge |
| `#B9451F` → `#8E2F16` | Marquee gradient |
| `#FFF3E2` | Text on orange |
| `#2A1D14` | Text on gold |
| `#F2EDE1` | Paper surface (Top 100 card) |
| `#231D18` | Text on paper |
| `#8B8377` | Muted text on paper |
| `#1F7A4D` | Movement indicator (upward) |
| `#D6CCB6` | Divider on paper |
| `#EFE4CE` / `#E6D9BF` | Poster placeholder stripes |

Selection styling: `::selection { background: #E8BE4A; color: #2A1D14 }`

Links: default `#E8BE4A`, hover `#F7DC9C`, `text-decoration: none`.

### Typography

Two families, loaded from Google Fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600&family=Limelight&display=swap" rel="stylesheet">
```
- **Limelight** — wordmark only, header and footer. Nowhere else.
- **Oswald** (400/500/600) — all headings, all labels, all buttons, all UI text
- **System sans stack** — body paragraphs only: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`

If the codebase self-hosts fonts, note that Oswald weight 700 is used once (the VS badge) but only 400/500/600 are loaded — it renders synthetically bold. Either load 700 or change the badge to 600.

| Element | Font | Size | Weight | Letter-spacing |
|---|---|---|---|---|
| H1 | Oswald | 60px | 600 | .015em |
| H2 | Oswald | 40px | 600 | .015em |
| H3 | Oswald | 20px | 600 | .06em |
| Body large | system | 17px | 400 | — |
| Body | system | 16px | 400 | — |
| Body small | system | 14px | 400 | — |
| Eyebrow | Oswald | 11px | 500 | .18–.24em |
| Button | Oswald | 14–15px | 600 | .06em |
| Wordmark | Limelight | 19px / 16px | 400 | .06em |

All Oswald headings and labels are `text-transform: uppercase`. Body copy is not.

### Spacing

Section padding `58–76px` vertical, `40px` horizontal. Container `max-width: 1080px`. Gaps: 11, 12, 14, 18, 22, 24, 36, 56px.

### Radius

2px (paper), 3px (card interior), 4px (buttons, poster frames), 6px (marquee frames), 50% (dots, VS badge).

### Shadows

| Use | Value |
|---|---|
| Header CTA | `0 0 0 1px rgba(232,190,74,.5), 0 8px 20px -8px rgba(201,82,47,.7)` |
| Section CTA | `0 0 0 1px rgba(232,190,74,.5), 0 10px 22px -8px rgba(201,82,47,.6)` |
| Marquee card | `0 30px 60px -30px rgba(255,180,90,.35)` |
| Poster frame | `0 22px 40px -22px rgba(0,0,0,.9), inset 0 0 0 1px rgba(232,190,74,.5)` |
| VS badge | `0 0 0 3px rgba(232,190,74,.55), 0 0 18px rgba(232,190,74,.3)` |
| Bulb dot | `0 0 12px 2px rgba(232,190,74,.7)` |
| Paper card | `inset 0 0 0 1px rgba(0,0,0,.18)` |

---

## Assets

**No image or icon files.** Everything is CSS — marquee bulbs, poster placeholders, glare overlays, the VS badge.

**Required before ship:**
1. **Film posters** — 2:3 aspect ratio. The placeholder stripe pattern and the "poster" label both come out when real artwork goes in; the glare overlay stays.
2. **Real film data** — replace the ten hardcoded titles.

**Fonts:** Oswald and Limelight, Google Fonts. Both are open-licensed and safe to self-host.

---

## Open questions for product

1. **The save-prompt copy is now wrong** — see State Management. Needs a replacement line before ship.
2. **Does the "A list you'd actually defend" heading still fit?** The card beside it is now the visitor's own list, not an example of someone else's. The heading works either way, but the section reads differently now and is worth a second look.
3. **Does signup migrate the local list?** Assumed yes above. Confirm the Supabase write exists.

---

## Files

- `Landing.dc.html` — the complete design prototype. Open it directly in a browser; the demo is fully playable.

The file is written for a component runtime that is not part of your codebase. Read it for structure, values, and behavior — the markup between `<x-dc>` tags is the layout, and the class at the bottom is the demo logic. Both translate cleanly to a standard component; neither should be copied verbatim.
