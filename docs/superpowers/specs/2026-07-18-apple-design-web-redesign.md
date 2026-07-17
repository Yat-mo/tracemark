# TraceMark Web Apple Design Redesign

**Date:** 2026-07-18  
**Repo:** `Yat-mo/tracemark`  
**Branch target:** current default `improve/v2.3-hardening` (or a feature branch cut from it)  
**Status:** Draft for user review

## 1. Problem

TraceMark’s Web UI is a single 2.7k-line file (`hlwy-ai-checker.html`) with a purple-gradient marketing look:

- heavy white card over full-page gradient
- emoji-forward buttons and status copy
- mixed simplified-Chinese UI while product branding is Traditional Chinese + English
- limited theming and accessibility affordances
- hard to evolve interaction quality or maintain feature surface area

The product is a local forensic / verification tool. The UI should feel like a system utility (Settings / Instruments style), not a 2018 SaaS landing form.

## 2. Goals

1. Rebuild the web front end as a modular Vite + React + TypeScript app.
2. Redesign visuals and interaction using Apple Design foundations translated to the web (materials, typography, response, interruptibility, reduced-motion / reduced-transparency).
3. Preserve behavioral parity for calibration, test, baseline management, and multi-channel compare.
4. Keep the primary user launch path as `python3 start.py` serving a built static bundle plus the existing hardened local proxy.
5. Use Traditional Chinese as primary UI language, with English subtitles/labels where branding already uses them.
6. Support system light/dark with optional manual override.

## 3. Non-goals

- Changing probe protocol semantics, scoring math, or baseline pack format
- Adding accounts, cloud sync, or remote multi-user features
- Full i18n framework / language packs beyond zh-Hant primary + English subtitles
- Rewriting the headless CLI or Python scoring core in this pass
- Pixel-perfect SF Pro licensing; use system font stack instead
- Over-animated “delight” that fights a high-frequency local tool

## 4. Decisions already approved

| Decision | Choice |
| --- | --- |
| Scope | Modernization refactor: split structure + Apple Design look |
| Language | Traditional Chinese primary + English subtitles |
| Stack | Vite + React (+ TypeScript) |
| Theme | Full light/dark following system, with manual override |
| Shell | System-tool shell (top translucent toolbar + segmented control), not purple hero card |
| Motion | Restrained; springs / bounce only where physical or rare |

## 5. Current behavior that must remain equivalent

### 5.1 Feature surface

| View | Required behavior |
| --- | --- |
| 標定基準 / Calibrate | Configure API type, base URL, key, model, header preset, probe suite, iterations (50–500), concurrency (1–50), baseline name; run; abort; progress; error log + consecutive-fail warning; distribution chart; save baseline to local storage |
| 測試識別 / Test | Same connection fields; run against stored baselines; ranked matches with overall score, confidence, mode score, distribution score, cosine, JS divergence, Hellinger; comparison chart; abort / errors |
| 基準管理 / Baselines | List, view detail, rename, delete, export single, export all as pack, import array/single/pack, load official packs from `/baselines/official/*` |
| 渠道橫評 / Compare | Select official baseline; manage N channel configs; shared suite/iterations/concurrency; ranked leaderboard; multi-series chart; abort |

### 5.2 Domain contracts (do not drift)

- Proxy headers: `X-Target-Base-URL`, `X-Header-Preset`
- Endpoints via local proxy: OpenAI chat completions, Anthropic messages, OpenAI responses
- Suites: `classic`, `robust` with weights / protocol metadata
- Strict integer parse for probe responses
- Transport vs parse failure buckets; retries for retriable transport errors
- localStorage key: `modelBaselines` (keep compatibility unless migration is explicit and tested)
- Pack format: `hlwy-baseline-pack/v1`
- Protocol compatibility rules already used by the HTML app
- AbortController / in-flight cancel semantics

### 5.3 Server contracts to keep or lightly extend

`start.py` currently serves:

- `GET /` and `GET /index.html` → single HTML file
- `GET /health`
- `GET /baselines/official/index.json` and `/baselines/*`
- `POST` proxy to allowed API suffixes
- SSRF protections, bind defaults, CORS headers

Redesign requires static asset serving for the Vite build (`/assets/*` and SPA fallback), without weakening proxy safety.

## 6. Target architecture

```text
.
├── start.py                      # static + proxy (updated)
├── web/                          # new React app
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── public/
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── styles/
│       │   ├── tokens.css
│       │   ├── base.css
│       │   └── materials.css
│       ├── components/
│       │   ├── AppShell.tsx
│       │   ├── Toolbar.tsx
│       │   ├── SegmentedControl.tsx
│       │   ├── GroupedSection.tsx
│       │   ├── Field.tsx
│       │   ├── Button.tsx
│       │   ├── ProgressBar.tsx
│       │   ├── StatusBanner.tsx
│       │   ├── ErrorPanel.tsx
│       │   ├── ResultCard.tsx
│       │   ├── BaselineList.tsx
│       │   ├── ChannelEditor.tsx
│       │   ├── ThemeToggle.tsx
│       │   └── charts/*
│       ├── views/
│       │   ├── CalibrateView.tsx
│       │   ├── TestView.tsx
│       │   ├── BaselinesView.tsx
│       │   └── CompareView.tsx
│       ├── lib/
│       │   ├── api.ts            # proxyFetch + provider callers
│       │   ├── probes.ts         # suites / protocol meta
│       │   ├── scoring.ts        # stats + similarity
│       │   ├── storage.ts        # baselines localStorage
│       │   ├── errors.ts         # classifyError
│       │   ├── run.ts            # concurrency runner
│       │   └── theme.ts
│       └── types/
├── hlwy-ai-checker.html          # legacy: redirect/help only after cutover
├── docs/superpowers/specs/...
└── (existing CLI / baselines / tests unchanged in spirit)
```

### 6.1 Runtime modes

**Production / user path**

1. `cd web && npm ci && npm run build` (documented; optional checked-in dist policy below)
2. `python3 start.py --no-open`
3. Server serves `web/dist` at `/` and keeps proxy/baselines/health

**Development path**

1. `python3 start.py --no-open` on proxy port (e.g. 8000)
2. `cd web && npm run dev` with Vite proxying API/baselines/health to 8000
3. HMR for UI; no proxy reimplementation in Node

### 6.2 Delivery policy (default)

- Repo **does not require** committing `web/dist` if CI or docs make build explicit.
- For “Python-only users,” either:
  - document Node build as a prerequisite for Web UI, **or**
  - ship a release artifact / optional committed dist.
- Spec default: **document build step; do not bloat git with dist unless user later requests checked-in dist.**

Legacy `hlwy-ai-checker.html` after cutover becomes a small offline help page explaining `start.py` + build, not a second product.

## 7. Information architecture

### 7.1 Shell

- Full-viewport system background
- Sticky translucent top bar:
  - left: product mark + `TraceMark`
  - center or below-title: segmented control for four views
  - right: version chip + theme control
- Subtitle under product name: `模型行為指紋探測 · Behavioral Model Fingerprinting`
- Content max-width ~980–1080px, generous vertical rhythm, grouped sections

### 7.2 Views

**標定基準**

1. 連線設定 (API type, Base URL, Key, Model, Header preset)
2. 探測設定 (suite, iterations, concurrency, baseline name)
3. 執行 (primary + stop)
4. 狀態區 (progress, status, early-fail warning, expandable errors)
5. 結果 (chart + save confirmation)

**測試識別**

1. 連線設定
2. 探測設定
3. 執行
4. 狀態區
5. 結果排名卡 + 分佈對比圖

**基準管理**

1. Toolbar actions: 匯出全部 / 匯入 / 載入預置
2. Empty state with clear next action
3. List rows with name, model, suite, samples, created time, key stats
4. Row actions: 檢視 (sheet/modal, not `alert`), 重新命名, 匯出, 刪除
5. Destructive delete uses lightweight confirmation, not browser `confirm` if avoidable; keep easy undo if low-cost, else confirm only for delete

**渠道橫評**

1. Baseline picker
2. Channel cards (add/remove; each with connection fields)
3. Shared probe settings
4. Run/stop
5. Leaderboard + multi-series chart

## 8. Visual design system

### 8.1 Foundations (Apple principles used)

- **Purpose:** every control maps to calibrate / test / manage / compare
- **Familiarity:** system font, segmented control, grouped lists, materials
- **Simplicity:** progressive disclosure for advanced scores; primary score first
- **Craft:** consistent spacing scale, hairline separators, optical tracking on large titles
- **Agency:** abort always available while running; no input lock-out during transitions
- **Delight:** only as a side effect of correctness and responsiveness

### 8.2 Color tokens

Light defaults (semantic names, not raw purple brand):

| Token | Role |
| --- | --- |
| `--bg` | page grouped background |
| `--bg-elevated` | cards / grouped sections |
| `--bg-chrome` | translucent toolbar fill |
| `--label-primary` / `--label-secondary` / `--label-tertiary` | text hierarchy |
| `--separator` | hairlines |
| `--fill-control` | inputs / secondary fills |
| `--accent` | primary actions / selected segment |
| `--accent-soft` | selected soft backgrounds |
| `--success` / `--warning` / `--danger` | status |
| `--match` / `--drift` / `--suspect` | result semantics if used |

Dark mode: true dark elevated surfaces; avoid pure white labels; charts retheme.

Manual theme override stored in `localStorage` (e.g. `tracemark-theme = system|light|dark`).

### 8.3 Materials

- Toolbar: semi-transparent fill + `backdrop-filter: blur(...) saturate(...)`
- Content cards: mostly solid elevated surfaces (legibility over glass stacking)
- Never light glass on light glass
- `@media (prefers-reduced-transparency: reduce)` → solid chrome, no blur
- Scroll edge: fade/mask preferred over heavy 1px chrome borders when content scrolls under toolbar

### 8.4 Typography

```css
font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
  "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif;
```

- Display/title: tight leading, slight negative tracking
- Body: leading ~1.45–1.55, tracking ~0
- Prefer weight + size for hierarchy; avoid rainbow text
- UI labels concise Traditional Chinese; English as secondary line or middot pair where helpful

### 8.5 Controls

- Primary button: filled accent; secondary: plain/gray; destructive: red text or soft red fill
- Press feedback: `transform: scale(0.97)` on pointer-down / `:active`, ~120–160ms ease-out
- Inputs: full-width in grouped inset style; clear focus ring; no thick 2px “bootstrap” borders
- Segmented control: continuous selection indicator; short motion; interruptible
- Progress: thin track, determinate fill, percent + human status text

### 8.6 Charts

- Keep Chart.js unless a lighter option is justified during implementation
- Theme-aware grid/tick/dataset colors
- Bucketed distribution presentation parity with current 10-wide buckets over 1–355
- Avoid decorative animations on chart updates; crossfade data if needed

## 9. Motion & interaction rules

From Apple Design + Emil design-engineering constraints:

| Interaction | Rule |
| --- | --- |
| Button press | Instant scale feedback on down |
| Segment change | Short ease-out; no bounce |
| Error panel expand | Height/opacity transition; interruptible |
| Modal / sheet | Enter/exit same path; origin-aware only if anchored to a trigger; center for true modals |
| Drag (if any) | Not required in v1 redesign |
| Keyboard / high-frequency | No ornamental animation |
| Reduced motion | Opacity/color only; drop large transforms |
| Default spring feel | Critically damped; bounce only for rare physical gestures (none mandatory in v1) |

CSS guidance:

- Prefer transitions for UI that can re-target
- Animate `transform` / `opacity` only
- Strong ease-out curve (e.g. `cubic-bezier(0.23, 1, 0.32, 1)`)
- UI durations generally ≤ 250ms; progress width can track data directly

## 10. Content / copy

### 10.1 Language

- Primary: 繁體中文
- Secondary: English product/subtitle terms already in README
- Remove leftover simplified-only phrasing where practical (`标定` → `標定`, etc.)

### 10.2 Tone

- Direct, instrument-like
- Prefer specific labels: 「匹配度」「置信度」「漂移」「可疑」
- Errors explain cause + next step (retain current classify/suggestion quality, rewrite in zh-Hant)

### 10.3 Emoji policy

- Remove emoji as primary visual identity from headers and primary CTAs
- Optional status glyphs only if they improve scanability; SF-style text labels preferred
- Ranking can use `#1` / medals sparingly or pure numeric rank

## 11. Component inventory

Minimum reusable components:

1. `AppShell` — background, safe area, content width
2. `Toolbar` — materials chrome
3. `SegmentedControl` — 4-way navigation
4. `GroupedSection` — title + inset group
5. `Field` / `SelectField` / `PasswordField`
6. `Button` — variants + loading/disabled + press scale
7. `ProgressBar`
8. `StatusBanner` — success/info/error
9. `ErrorPanel` — summary + expandable list + badges
10. `EarlyFailWarning`
11. `ResultCard` / `MatchList`
12. `BaselineList` + row actions
13. `ChannelEditor`
14. `ThemeToggle`
15. Chart wrappers

Logic modules extracted from existing HTML with tests where pure:

- `extractNumber`
- suite/protocol helpers
- stats + similarity scoring
- pack import normalization
- error classification

## 12. Accessibility & platform

- Visible focus states
- Form labels associated with controls
- Color not sole status channel (text labels too)
- `prefers-reduced-motion`
- `prefers-reduced-transparency`
- `prefers-contrast: more` → stronger borders / solid fills
- Hover effects gated with `@media (hover: hover) and (pointer: fine)`
- Touch targets ≥ ~44px where practical
- Password fields remain password type; no key logging beyond existing browser behavior

## 13. Server changes

Update `start.py` to:

1. Resolve web root as `web/dist` when present
2. Serve `index.html` for `/` and SPA routes that are not API/baselines/health
3. Serve hashed static assets under `/assets` with correct content types
4. Preserve proxy, health, baselines exactly
5. If `web/dist` missing, return a clear HTML error page instructing build steps (and optional mention of legacy file only during migration)
6. Startup checks updated from “missing hlwy-ai-checker.html” to “missing built web UI” with actionable message

No change to SSRF rules, body limits, or default bind address.

## 14. Testing & verification

### 14.1 Automated

- Port pure JS domain helpers to testable modules
- Unit tests (Vitest or existing Python tests remain for backend; add frontend unit tests for pure functions)
- Keep Python `unittest` suite green
- Optional: smoke test that `start.py` serves `web/dist/index.html` when present

### 14.2 Manual smoke

1. Build web + start server
2. Calibrate with a mock/demo path if available; otherwise validate UI validation + abort without key
3. Import demo baseline pack from official baselines
4. Test ranking UI against imported baselines without live API if possible
5. Compare multi-channel form add/remove
6. Theme: system / light / dark
7. reduced-motion OS setting
8. Mobile narrow width sanity

### 14.3 Parity checklist

- Suite selection affects protocol compatibility messaging
- Progress and abort work mid-run
- Error badges still categorize network/auth/rate limit/server/parse
- Export/import pack round-trips
- Charts render and destroy cleanly on re-run
- localStorage baselines survive reload

## 15. Migration plan

1. Scaffold `web/` alongside existing HTML (no delete yet)
2. Extract domain logic with tests
3. Implement shell + design tokens
4. Implement four views with parity
5. Wire `start.py` static serving
6. Manual smoke + unit tests
7. Replace root HTML role with help/redirect
8. Update README / CHANGELOG-FORK for Web redesign version bump
9. Remove dead single-file app only after parity sign-off

## 16. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Behavior drift while porting scoring | Extract pure functions first; snapshot tests against known fixtures |
| Python-only users blocked | Clear build docs; optional later checked-in dist / release asset |
| Chart theming regressions | Shared chart theme helper; manual light/dark check |
| Glass illegibility | Prefer solid content surfaces; accessibility media queries |
| Over-animation | Explicit motion budget; no bounce on nav |
| Large PR | Feature branch; commit by layer (scaffold → logic → shell → views → server) |

## 17. Success criteria

1. All four workflows usable end-to-end with equivalent outcomes to current HTML app.
2. UI reads as a native system tool under both light and dark.
3. Primary copy is Traditional Chinese; English appears as intentional subtitles.
4. `python3 start.py --no-open` serves the new UI after build.
5. Existing proxy safety and baseline pack loading still work.
6. Reduced motion / reduced transparency do not break layout.
7. No purple full-page gradient shell remains as the product identity.

## 18. Open implementation details (non-blocking)

These can be decided during planning without changing product intent:

- Exact package versions (React 18/19, Vite 5/6)
- Whether to use Motion library or CSS-only for v1 (default: CSS-first; add Motion only if interruptible gesture needs appear)
- Whether detail “view baseline” is a modal sheet or route panel (default: modal sheet)
- Version number for CHANGELOG (suggest `v2.5.0` web redesign)

## 19. Out-of-scope follow-ups

- Sharing frontend scoring with Python via generated fixtures
- PWA installability
- Full bilingual toggle
- Plugin themes
- Replacing Chart.js with a custom canvas visualization

---

## Spec self-review notes

- No intentional TBDs left that block implementation planning.
- Architecture matches approved Vite + React deep refactor.
- Domain parity constraints are explicit to prevent visual rewrite from silently changing science.
- Delivery policy chooses docs-first over mandatory committed `dist`; can reverse on request.
