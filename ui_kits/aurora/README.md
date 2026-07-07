# Aurora — Product UI Kit

High-fidelity, interactive recreation of the **艾倫報報 · Allen³ Aurora** personal
dashboard + newsletter web app. Open `index.html` and use the left nav to move
between the five surfaces. Fully responsive (sidebar collapses to a drawer under 900px).

## Screens
| File | Surface | Notes |
|------|---------|-------|
| `Dashboard.jsx` | 儀表板 — home control panel | Greeting hero, stat row (TAIEX/結餘/深度工作/待讀), 今日關注動態 feed, 待讀進度, 常聽 Podcast, 常用網站, 個人年輪 mini. |
| `NewsletterIssue.jsx` | 本期報報 — editorial reading view | Centered masthead, cover image, 洞察/理財/啟發 sections, mini stock table (紅漲綠跌), pull-quote, footer CTA. |
| `Archive.jsx` | 歷期彙整 — past issues | Cadence tabs (全部/日報/週報/月報), year filter chips, cover-card grid. |
| `Timeline.jsx` | 個人年輪 — life timeline | Aurora-spine vertical timeline, ring stat band, 1975→2026 milestones. |
| `Subscribe.jsx` | 訂閱管理 — landing + signup | Hero, three cadence cards with toggles, email capture with success state. |
| `kit.jsx` | shared shell | Icon set (`window.Icons`), mock data (`window.KIT`), `Sidebar`, `Topbar`. |

## How it's wired
`index.html` loads React + Babel + the compiled design-system bundle
(`../../_ds_bundle.js`), then `kit.jsx` and each screen. Screens read the DS
components off `window.AllenAuroraDesignSystem_e6fd5f` and register themselves on
`window`. No build step.

## Composition, not reinvention
Screens compose the published primitives — `Button`, `Card`, `StatCard`,
`Sparkline`, `Badge`, `Tag`, `Tabs`, `Input`, `Switch`, `Callout`,
`SectionHeader`, `AuroraText`, `Avatar` — and only add product-specific layout
(sidebar, topbar, timeline spine). All color/type/spacing come from tokens.

All data is mock. Not investment advice; finance colors follow Taiwan 紅漲綠跌.
