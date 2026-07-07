---
name: allen-aurora-design
description: Use this skill to generate well-branded interfaces and assets for 艾倫報報 · Allen³ Aurora (Insight · Intelligence · Illumination) — a dark-first, aurora-themed personal dashboard + newsletter brand — for production or throwaway prototypes/mocks. Contains design guidelines, colors, type, fonts, assets, and UI-kit components for prototyping.
user-invocable: true
---

Read `readme.md` in this skill first — it holds the full brand system: content
voice (繁體中文-first, warm first-person, benefit-led), visual foundations
(dark night-sky base + aurora gradient accents, the three I's, warm rounded type),
iconography, and a file index.

Then explore the other files:
- `styles.css` + `tokens/*` — link `styles.css` to inherit every color, type,
  spacing, shadow and font token.
- `components/*` — React primitives (Button, Card, StatCard, Badge, Tabs, Input,
  Switch, Callout, SectionHeader, AuroraText, …). Each has a `.prompt.md` with a
  usage example. In HTML, load the compiled bundle and read components off
  `window.AllenAuroraDesignSystem_*`.
- `ui_kits/aurora/*` — full interactive product recreation (dashboard, newsletter
  issue, archive, 個人年輪 timeline, subscribe). Copy patterns from here.
- `assets/*` — logo idea (I³ mark), avatar, favicons, painterly rabbit mascot art.

If creating visual artifacts (slides, mocks, throwaway prototypes), copy the assets
you need out of `assets/` and produce static HTML files that link `styles.css` for
the user to view. If working on production code, copy assets and follow the rules
here to design as an expert in this brand.

If the user invokes this skill without other guidance, ask what they want to build
or design, ask a few focused questions, and act as an expert designer who outputs
HTML artifacts **or** production code depending on the need.

Key brand rules to honor:
- Dark-first. App background `--night-900`; cards `--night-800`; rounded corners.
- Aurora accents (green→teal→violet gradient) used sparingly for brand/hero/active.
- The three I's map to colors: Insight = teal-green, Intelligence = violet,
  Illumination = gold. Use them to color-code sections.
- Finance uses Taiwan 紅漲綠跌 (red up / green down); always footnote 非投資建議.
- Warm rounded type: Nunito / Nunito Sans / Noto Sans TC / JetBrains Mono.
- Emoji only in editorial copy, never as functional UI icons; icons are 1.9px
  rounded-stroke line icons.
