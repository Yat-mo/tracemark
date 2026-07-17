# TraceMark Apple Design Web Redesign Implementation Plan

> **For Hermes:** Execute task-by-task. Prefer same-session implementation for continuity; use subagents only for isolated pure-logic extraction if needed.

**Goal:** Replace the single-file purple UI with a Vite + React + TypeScript Apple-style system tool, keeping probe/scoring/proxy parity.

**Architecture:** `web/` SPA build output served by hardened `start.py`. Domain logic extracted to pure TS modules with unit tests. CSS design tokens for light/dark materials. Four views behind a segmented shell.

**Tech Stack:** React 18, TypeScript, Vite 5/6, Chart.js, Vitest, existing Python `start.py` proxy.

**Spec:** `docs/superpowers/specs/2026-07-18-apple-design-web-redesign.md`

---

### Task 1: Scaffold `web/` app

**Objective:** Create a working Vite React TS project skeleton.

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig*.json`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/vite-env.d.ts`

**Steps:**
1. `npm create vite@latest web -- --template react-ts` (or manual files)
2. Install deps: `react`, `react-dom`, `chart.js`, `react-chartjs-2`, `vitest`, `@types/node`
3. Configure Vite proxy for `/chat/completions`, `/messages`, `/responses`, `/health`, `/baselines` → `http://127.0.0.1:8000`
4. Verify: `cd web && npm install && npm run build`

---

### Task 2: Domain types + pure logic with TDD

**Objective:** Port scoring/protocol/storage helpers without UI.

**Files:**
- Create: `web/src/types/index.ts`
- Create: `web/src/lib/probes.ts`, `scoring.ts`, `parse.ts`, `packs.ts`, `errors.ts`, `theme.ts`
- Create: `web/src/lib/*.test.ts`

**Cover at least:**
- `extractNumber` strict parse
- `calculateDistribution` / `calculateStats`
- `calculateSimilarity` / `sampleQuality` / `protocolCompatible`
- `normalizeImportedBaselines` / `isValidBaseline`

**Verify:** `cd web && npm test`

---

### Task 3: Design tokens + base materials CSS

**Objective:** Apple-like light/dark system tokens.

**Files:**
- Create: `web/src/styles/tokens.css`, `base.css`, `materials.css`
- Wire import in `main.tsx`

**Include:** system font stack, grouped backgrounds, chrome blur, reduced-motion/transparency/contrast, button press scale, segmented control styles.

---

### Task 4: Shell components

**Objective:** App chrome.

**Files:**
- Create: `web/src/components/AppShell.tsx`, `Toolbar.tsx`, `SegmentedControl.tsx`, `ThemeToggle.tsx`, `Button.tsx`, `Field.tsx`, `GroupedSection.tsx`, `ProgressBar.tsx`, `StatusBanner.tsx`, `ErrorPanel.tsx`

**Verify:** App renders shell with four segments, theme toggle works.

---

### Task 5: API + run engine

**Objective:** Port proxy callers, concurrency, probe sampling, abort.

**Files:**
- Create: `web/src/lib/api.ts`, `run.ts`, `baselinesStore.ts`

**Parity:** headers `X-Target-Base-URL`, `X-Header-Preset`; AbortController set; retries for 429/5xx/timeout.

---

### Task 6: Views (Calibrate / Test / Baselines / Compare)

**Objective:** Full feature parity UI in zh-Hant.

**Files:**
- Create: `web/src/views/CalibrateView.tsx`, `TestView.tsx`, `BaselinesView.tsx`, `CompareView.tsx`
- Create: chart components under `web/src/components/charts/`

**Verify:** Manual UI validation paths + import demo packs when server running.

---

### Task 7: Update `start.py` static serving

**Objective:** Serve `web/dist` with SPA fallback; keep proxy/health/baselines.

**Files:**
- Modify: `start.py`
- Optionally replace `hlwy-ai-checker.html` with minimal help page after cutover

**Verify:**
```bash
cd web && npm run build
python3 start.py --no-open
curl -sS http://127.0.0.1:8000/ | head
curl -sS http://127.0.0.1:8000/health
curl -sS http://127.0.0.1:8000/baselines/official/index.json | head
```

---

### Task 8: Docs + changelog

**Objective:** Document build/run for Web UI redesign.

**Files:**
- Modify: `README.md`, `CHANGELOG-FORK.md`
- Bump visible version to `2.5.0` in UI/server if appropriate

**Verify:** README has `cd web && npm ci && npm run build` then `python3 start.py`.

---

### Task 9: Final verification gate

1. `cd web && npm test && npm run build`
2. `python3 -m unittest discover -s tests -v`
3. Smoke `start.py` serves new UI
4. Theme light/dark
5. Import official demo packs in UI
6. Diff review: no protocol/scoring drift

---

## Execution notes

- Do not change probe prompts, weights, scoring formulas, pack format, or localStorage key `modelBaselines`.
- CSS-first motion; no Motion library required for v1.
- Prefer solid content cards + translucent toolbar only.
- Traditional Chinese UI strings.
