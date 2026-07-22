# 艾倫報報 · Allen I³ Aurora — Design System

> **Insight · Intelligence · Illumination** 洞察世界．累積智慧．點亮未來。 *Insight the World. Intelligence the Future. Illumination the Journey.*

A dark-first, aurora-themed design system for **艾倫報報 (Allen**  I**³ Aurora)** — a personal **dashboard + newsletter** product by Allen Chen. It publishes a **日報 / 週報 / 月報** (daily / weekly / monthly) email and hosts a personal dashboard that surfaces the things Allen tracks: **理財 (finance), 工作 (work), 研究 (research), 興趣 (hobbies)**, frequently-used sites, favourite podcasts, and a **個人年輪 (personal annual-rings)** life timeline.

The name encodes the brand: **I³ = Insight × Intelligence × Illumination**, and **Aurora / 極光** — luminous colour arcing across a night sky — is the visual metaphor that runs through every surface.

---

## Quick start

```bash
# 1. Link the single global stylesheet (tokens + fonts + base reset)
<link rel="stylesheet" href="styles.css">

# 2. Use the CSS custom properties anywhere
color: var(--text-1);
background: var(--night-800);
background-image: var(--aurora-gradient);
```

React components live in `components/**` (Button, Card, StatCard, Badge, Tabs,
Input, Switch, Callout, SectionHeader, AuroraText, …). See each component's
`.prompt.md` for a usage example. The full interactive product recreation is in
`ui_kits/aurora/` (open `index.html`).

> `_ds_bundle.js`, `_ds_manifest.json`, `_adherence.oxlintrc.json` are generated
> artifacts, committed intentionally (they are **not** git-ignored) so the
> static site works with no build step — `index.html` and
> `ui_kits/aurora/index.html` load `_ds_bundle.js` directly at runtime.
> Regenerate them with your design-system build tool after editing
> `components/*` or `tokens/*`; do not hand-edit the generated files. The
> `.html` specimen cards under `guidelines/` render the living style guide.

---

## Sources & provenance

The brand was established green-field from Allen Chen's existing ecosystem. The originally-attached repo was empty, so identity was derived from the surrounding public projects. Explore these to design more faithfully:

- **Target product repo (empty at time of build; link unverified — returns 404 as of 2026-07, may be private/renamed/removed, please confirm):** `https://github.com/allenchen1113official/Allen3IAurora`
- **Personal website (Hugo, dark theme):** `https://github.com/allenchen1113official/allenchen1113official` — source of the avatar, favicons, dark colour scheme, and the painterly **blue-eyed-rabbit** illustration library (`assets/rabbit-*.jpeg`).
- **Showmethemoney — 台股看盤系統:** `https://github.com/allenchen1113official/Showmethemoney` — source of the brand **voice** (see `MARKETING.md` there) and the Taiwan-market finance conventions.
- Other context repos: `Mx.Ada` (finance LINE bot), `AntsiSeCare` (長照 app), `AllenDashboard`, `allenannuli` (personal timeline).

Reader/maintainer: browse the repos above for deeper fidelity when extending this system.

---

## Content fundamentals — how 艾倫報報 writes

Derived from Allen's real marketing copy and blog voice.

- **Language.** 繁體中文 first, English second. Mixed CJK + Latin in the same line is normal; technical terms stay in English (Agent, LLM, Supabase, ETF).
- **Person & warmth.** Warm, personal **first person** — *「我做了一個…」*, *「我相信…」*. It reads like a capable friend writing to you, not a corporation.
- **Benefit-first.** Lead with the value to the reader, then the detail. Marketing copy opens on the pain (*「看盤軟體都要錢？」*) then the relief.
- **Scannable structure.** Short paragraphs, checklist rhythm (✅ / ❌), bolded key phrases, section rules. Long-form still breaks into digestible beats.
- **Emoji — used, but measured.** A leading emoji per section or a sparkle to mark rhythm (📊 ✨ 🎯 🚀 👉). Never a wall of emoji; one accent per idea.
- **Casing.** English headline-style caps for kickers (INSIGHT · 洞察); Chinese has no casing so weight + colour carry emphasis.
- **Honesty markers.** Finance content always footnotes *「非投資建議」* and notes the 紅漲綠跌 convention.

**Voice examples**

- Tagline: 「洞察世界．累積智慧．點亮未來。」
- Section kicker: `ILLUMINATION · 啟發`
- CTA: 「立即預覽」「開始訂閱」「回信給主編」
- Disclaimer: 「※ 台股慣例 紅漲綠跌。資料僅供參考，非投資建議。」

---

## Visual foundations

**Overall vibe.** A calm, luminous night. Deep navy-black canvas; content sits on slightly-lighter night surfaces; brand energy arrives as aurora light — gradients, soft glows, and colour-coded accents — never as loud fills.

- **Colour.** Base is a **night-sky scale** (`--night-1000 → --night-500`), app background `--night-900 #0B1020`, cards `--night-800`. Accents are the **aurora spectrum** (green `#3DDC97` → teal `#2DD4BF` → blue `#4F7BF0` → violet `#7C3AED`), expressed most often as `--aurora-gradient`. The three I's are semantic accents: **Insight** = teal-green, **Intelligence** = violet, **Illumination** = gold. Finance follows Taiwan **紅漲綠跌** (`--finance-up` red, `--finance-down` green), kept separate from generic success/danger.
- **Type.** Warm humanist / rounded. **Nunito** (800–900) for display & headings, **Nunito Sans** for body, **Noto Sans TC** for 繁體中文, **JetBrains Mono** for numerals / tickers / metadata. Display is tight-tracked (-0.02em); CJK reading uses relaxed 1.72 line-height.
- **Backgrounds.** Mostly flat night. A signature ambient treatment (`body.aurora-bg`) paints faint aurora glows bleeding from the top of the viewport (green left, violet right). Imagery is **painterly & warm** — the blue-eyed-rabbit oil-painting illustrations, always with a dark protection gradient when text overlays them.
- **Corner radii.** Generous and rounded — cards `--radius-xl (24)`, controls `--radius-md (14)`, pills for tags/badges. Nothing sharp.
- **Cards.** Night-800 fill, 1px `--border` hairline (translucent white), 24px radius, soft cool `--shadow-card`. A card can carry a 3px **top accent bar** and, for hero moments, an aurora **glow** shadow. Interactive cards lift 3px on hover.
- **Shadows.** Two systems: cool low-contrast **elevation** shadows for depth, and coloured **aurora glows** for brand/active/focus moments only.
- **Borders.** Hairlines are translucent white (`rgba(255,255,255,.07–.18)`); active/brand borders use `--border-aurora` (teal).
- **Transparency & blur.** Sticky top bars and glass cards use `--glass-fill` + `backdrop-filter: blur` for a frosted night-glass effect. Scrims dim behind drawers/modals.
- **Motion.** Gentle and quick. `--ease-out` for most transitions (140–220ms); a soft overshoot (`--ease-soft`) for toggles. Hover = lift + slight brighten/saturate; press implied by the lift settling. Reduced-motion respected. Decorative loops avoided; keyframes exist for spinners and a slow gradient shift.
- **Hover / press states.** Buttons lift 1px and brighten \~6%; ghost controls fill to `--night-700`; nav items tint to `--brand-soft` with an aurora border.
- **Layout.** Fixed 256px sidebar + sticky glass topbar on app surfaces; centered \~760–860px reading measure for newsletter/long-form. Responsive: sidebar collapses to an off-canvas drawer under 900px.

---

## Iconography

- **Style.** A single custom **line icon** set (see `ui_kits/aurora/kit.jsx → Icons`): 24×24 viewBox, **1.9px stroke**, round caps & joins — matching the warm, rounded type. Consistent, monochrome, coloured via `currentColor`.
- **Substitution flag.** This bespoke set is intentionally small and covers the product's needs. If you need broader coverage, the closest CDN match with the same feel is **Lucide** (`https://unpkg.com/lucide-static`) — same 24px grid and \~2px rounded stroke. Flag any swap so the visual language stays consistent.
- **No icon font / no emoji-as-icon in UI.** Emoji appear only in *editorial copy* (headlines, newsletter, marketing) as rhythm accents — never as functional UI icons.
- **Logo mark.** The **AI³A** monogram — the two A's stand for **Allen** and **Aurora**, flanking **I³** — set in a rounded tile with the **warm aurora** gradient (`--aurora-warm`: gold → coral → violet), or a 2px outline in mono contexts. Wordmark: **ALLEN I³ AURORA** / 艾倫報報. See `guidelines/brand-logo.html`.
- **Imagery, not vector illustration.** Brand illustration = the painterly rabbit photos in `assets/`. Do not hand-draw SVG illustrations in this style.

---

## Repository index

**Foundations (linked from `styles.css`)**

- `styles.css` — entry point; `@import`s everything below.
- `tokens/fonts.css` — webfont loading (Google Fonts) + substitution note.
- `tokens/colors.css` — night scale, aurora spectrum, the three I's, semantic, finance, borders, glass, gradients (+ courtesy `[data-theme="light"]`).
- `tokens/typography.css` — families, weights, scale, line-heights, tracking.
- `tokens/spacing.css` — 4px space scale, radii, layout dims.
- `tokens/effects.css` — shadows, aurora glows, focus ring, blur, motion, z-index.
- `tokens/base.css` — reset, element defaults, `aurora-bg` ambience, keyframes.

**Components** (`window.AllenAuroraDesignSystem_*`)

- `components/core/` — Button, IconButton, Badge, Tag, Avatar, Divider, AuroraText.
- `components/forms/` — Input, Switch, Tabs.
- `components/surfaces/` — Card, StatCard (+ Sparkline), SectionHeader, Callout.

**UI kit**

- `ui_kits/aurora/` — interactive product recreation: `index.html` + Dashboard, NewsletterIssue, Archive, Timeline, Subscribe screens (see its README).

**Deployed app** (GitHub Pages, served at `/AllenI3Aurora/`)

- `index.html` — production entry point (absolute-path build of the UI kit).
- `aurora-data.js` — front-end data layer: reads each dashboard section from Firebase (Firestore) when configured, else falls back to the built-in mock data in `kit.jsx` so the site always renders.
- `firebase-config.js` — public Firebase web config (safe to ship; empty by default → mock-data fallback).
- `admin/` — owner-only back office (Firebase Auth + Firestore CRUD) for editing each dashboard section.
- `firebase/firestore.rules` — public-read / owner-write security rules.

**Specimen cards** — `guidelines/*.html` (Colors · Type · Spacing · Brand), rendered in the Design System tab.

**Assets** — `assets/` (avatar, favicons, `rabbit-*.jpeg` illustration library).

**Skill** — `SKILL.md` (Agent-Skills compatible).

---

## Deployment & launch

- **Hosting.** Static GitHub Pages — no build step. `index.html`, `ui_kits/aurora/index.html`, and `admin/index.html` load React (UMD), Babel-standalone, and Firebase from CDN at runtime.
- **Production builds.** The shipped pages load React's **`.production.min.js`** UMD builds (SRI-pinned) — smaller and faster, with dev-mode warnings off. The `components/*/*.card.html` specimen files keep the dev builds on purpose (their warnings help while authoring).
- **Validation.** `npm run lint` (oxlint adherence rules) runs locally and in CI (`.github/workflows/ci.yml`) on every push / PR.
- **Firebase (optional).** Fill in `firebase-config.js`, publish `firebase/firestore.rules`, and sign in to `admin/` as the owner email to drive live data; leave it empty to ship on the built-in mock data.

---

## Caveats

- **繁中 rounded font:** no high-quality *rounded* Traditional-Chinese webfont is freely CDN-hosted, so **Noto Sans TC** (humanist, not rounded) ships as the closest match. Swap in a licensed 圓體 for full "warm rounded" fidelity.
- **Mascot images** carry a small watermark from their original generation and are DALL·E/Bing-style renders — replace with final licensed art for production.
- All UI-kit data is **mock**; finance figures are illustrative and not advice.
