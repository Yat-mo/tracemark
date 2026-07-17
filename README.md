<div align="center">

# TraceMark

### 模型行為指紋探測器  
### Behavioral Model Fingerprinting

**標定官方指紋，比對第三方渠道，找出摻假與漂移**  
**Calibrate official fingerprints. Compare third-party channels. Catch substitution and drift.**

<br>

[![Version](https://img.shields.io/badge/version-2.5.0-7c5cff?style=for-the-badge)](./CHANGELOG-FORK.md)
[![Python](https://img.shields.io/badge/python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![License](https://img.shields.io/badge/license-LGPL--2.1-0E7C86?style=for-the-badge)](./LICENSE)
[![Interface](https://img.shields.io/badge/interface-Web%20%2B%20CLI-111827?style=for-the-badge)](#-快速開始)

<br>

[繁體中文](#-繁體中文) · [English](#-english) · [Changelog](./CHANGELOG-FORK.md) · [Baseline Packs](./baselines/README.md)

<br>

```text
 official API ── calibrate ──► baseline fingerprint
                                      │
 third-party  ── probe suite ─────────┼── score ──► match / drift / suspicion
```

</div>

---

## 目錄

| | |
|---|---|
| 繁中 | [概念](#這是什麼) · [能力](#核心能力) · [結構](#專案結構) · [開始](#-快速開始) · [CLI](#headless-cli) · [基準包](#基準包) · [原理](#原理) · [安全](#安全與邊界) · [免責](#免責聲明) |
| EN | [Idea](#what-it-is) · [Features](#core-features) · [Layout](#project-layout) · [Start](#quick-start) · [CLI](#headless-cli-1) · [Packs](#baseline-packs) · [Method](#how-it-works) · [Safety](#safety--limits) · [Disclaimer](#disclaimer) |

---

## 繁體中文

### 這是什麼

大語言模型不是真正的亂數產生器。  
當你要求它「隨機選一個數字」，不同模型會留下不同的統計偏差。

這些偏差在大量取樣後，會形成可比較的**行為指紋**。

**TraceMark** 用這件事做渠道驗證：

1. 先對**官方 API** 標定基準指紋  
2. 再用同一套探針測試**第三方渠道**  
3. 比較分布、眾數與樣本品質，判斷是否像同一模型

它適合回答：

- 這個中轉是不是真的在跑它宣稱的模型？
- 兩個渠道對同一模型是否行為一致？
- 有沒有明顯摻假、串路、或路由漂移？

### 核心能力

| 面向 | 內容 |
| --- | --- |
| **Web UI** | 本機一頁式流程：標定、測試、基準管理、渠道橫評 |
| **Headless CLI** | `calibrate` / `test` / `compare`，可進腳本與 CI |
| **多探針協議** | `classic` 相容舊基準；`robust` 多探針更穩 |
| **嚴格解析** | 只接受純整數輸出，減少髒樣本污染 |
| **更穩評分** | 分布優先 + 眾數輔助 + 置信度 |
| **基準包** | `hlwy-baseline-pack/v1`，可匯入、匯出、預置、分享 |
| **本機安全代理** | 預設綁 `127.0.0.1`，含 SSRF 防護與請求限制 |

### 專案結構

```text
.
├── start.py                 # Web UI static server + 本機安全代理
├── web/                     # Vite + React Web UI（Apple Design）
│   ├── src/
│   └── dist/                # npm run build 產物（需建置）
├── hlwy-ai-checker.html     # 舊版單檔 UI（僅在未建置 web/dist 時後援）
├── hlwy_check.py            # CLI 入口
├── hlwy_checker/            # 協議、客戶端、評分、基準包
├── baselines/official/      # 預置 / 匯出基準包
├── tests/                   # 單元測試
├── requirements.txt
└── CHANGELOG-FORK.md
```

> 倉庫路徑：`Yat-mo/tracemark`  
> 產品名：**TraceMark**  
> 方法論受 [hanlinwenyuan/hlwy-ai-checker](https://github.com/hanlinwenyuan/hlwy-ai-checker) 啟發。

### ✨ 快速開始

#### 安裝

```bash
git clone https://github.com/Yat-mo/tracemark.git
cd tracemark
git checkout improve/v2.3-hardening
python3 -m pip install -r requirements.txt

# Web UI（需要 Node.js 18+）
cd web
npm ci
npm run build
cd ..
```

#### 啟動 Web UI

```bash
python3 start.py --no-open
```

開啟：

```text
http://127.0.0.1:8000
```

> `start.py` 會優先服務 `web/dist`。若尚未建置前端，會回退到舊版 `hlwy-ai-checker.html` 或顯示建置說明。

開發模式（可選）：

```bash
# 終端 1：代理
python3 start.py --no-open

# 終端 2：前端 HMR（會 proxy API 到 8000）
cd web && npm run dev
```

常用參數：

```bash
python3 start.py \
  --host 127.0.0.1 \
  --port 8000 \
  --timeout 60 \
  --allow-host api.openai.com \
  --allow-host api.anthropic.com \
  --no-open
```

#### 建議流程

```text
選擇套件 → 官方 key 標定 → 匯出基準包 → 測試第三方 → 看匹配度 / 置信度
```

| 套件 | 何時用 |
| --- | --- |
| `robust` | 預設推薦，多探針，抗噪更好 |
| `classic` | 相容舊基準，或想最小化請求數 |

> 舊基準（沒有 suite 中繼資料）只相容 `classic`。  
> 要用新方法，請用 `robust` 重新標定。

### Headless CLI

```bash
# 查看探針套件
python3 hlwy_check.py suites

# 查看預置基準包
python3 hlwy_check.py list-packs

# 官方 API 標定
export HLWY_API_KEY=sk-...
python3 hlwy_check.py calibrate \
  --name "gpt-4o-official" \
  --base-url https://api.openai.com/v1 \
  --model gpt-4o \
  --suite robust \
  --iterations 200 \
  --as-pack \
  -o baselines/official/gpt-4o-robust.json

# 測試單一第三方渠道
python3 hlwy_check.py test \
  --base-url https://third-party.example/v1 \
  --api-key sk-xxx \
  --model gpt-4o \
  --suite robust \
  --baseline baselines/official/gpt-4o-robust.json

# 多渠道橫評
python3 hlwy_check.py compare \
  --channels channels.json \
  --baseline baselines/official/gpt-4o-robust.json \
  --suite robust
```

`channels.json` 範例：

```json
[
  {
    "name": "relay-a",
    "api_type": "openai",
    "base_url": "https://a.example/v1",
    "api_key": "sk-a",
    "model": "gpt-4o"
  },
  {
    "name": "relay-b",
    "api_type": "openai",
    "base_url": "https://b.example/v1",
    "api_key": "sk-b",
    "model": "gpt-4o"
  }
]
```

### 基準包

格式：`hlwy-baseline-pack/v1`

預置位置：[`baselines/official/`](./baselines/official/)

| 檔案 | 說明 |
| --- | --- |
| `demo-classic-pack.json` | 離線 demo（classic） |
| `demo-robust-pack.json` | 離線 demo（robust） |

這些 demo 是 **synthetic** 資料，只供離線驗證 UI / CLI，**不是**真實官方指紋。

Web UI 支援：

- 匯入 pack / 基準陣列 / 單一基準
- 一鍵載入預置包
- 匯出為標準 pack

完整格式見：[baselines/README.md](./baselines/README.md)

### 原理

```text
probe prompt
    │
    ▼
many samples ──► number distribution
    │
    ├─ cosine similarity
    ├─ JS divergence
    ├─ Hellinger distance
    ├─ mode agreement
    └─ sample quality
            │
            ▼
      overall score + confidence
```

重點不是「這次有沒有答對」，而是：

- 分布形狀像不像
- 眾數有沒有漂
- 有效樣本夠不夠乾淨

### 安全與邊界

- 本機代理預設只綁 `127.0.0.1`
- 會阻擋私網 / localhost 目標，降低 SSRF 風險
- 請勿把代理直接暴露到公網
- 同一套件才能比較；跨套件會被拒絕
- 結果是統計估計，不是司法鑑定

### 開發

```bash
python3 -m unittest discover -s tests -v
python3 hlwy_check.py gen-demo-packs
```

### 免責聲明

測試結果僅供參考。

模型取樣具有隨機性，中轉也可能限流、改寫、路由或混模。  
本工具結果**不能**作為商業糾紛、退款或法律主張的唯一依據。

TraceMark 由 [Yat-mo/tracemark](https://github.com/Yat-mo/tracemark) 維護。  
方法論受 [hanlinwenyuan/hlwy-ai-checker](https://github.com/hanlinwenyuan/hlwy-ai-checker) 啟發，本倉庫為功能增強 fork。

---

## English

### What it is

Large language models are not true RNGs.  
Ask them to pick a “random” integer and different models leave different statistical biases.

After enough samples, those biases become a **behavioral fingerprint**.

**TraceMark** turns that into a channel audit tool:

1. **Calibrate** against an official API  
2. **Probe** a third-party channel with the same suite  
3. **Compare** distribution, mode, and sample quality

Use it when you want to know:

- does this relay behave like the claimed model?
- do two channels look consistent?
- is there a strong sign of substitution or routing drift?

### Core features

| Area | What you get |
| --- | --- |
| **Web UI** | Local one-page flow for calibrate / test / baseline management / multi-channel ranking |
| **Headless CLI** | `calibrate`, `test`, `compare` for scripts and automation |
| **Probe suites** | `classic` for legacy baselines; `robust` multi-probe suite by default |
| **Strict parsing** | Accepts pure integers only, reducing contaminated samples |
| **Better scoring** | Distribution-first scoring with mode assist and confidence |
| **Baseline packs** | Portable `hlwy-baseline-pack/v1` format |
| **Safer local proxy** | Binds to `127.0.0.1` by default, with SSRF guards and request limits |

### Project layout

```text
.
├── start.py                 # static server + hardened local proxy
├── web/                     # Vite + React Web UI (Apple Design)
│   ├── src/
│   └── dist/                # build output from npm run build
├── hlwy-ai-checker.html     # legacy single-file UI (fallback only)
├── hlwy_check.py            # CLI entry
├── hlwy_checker/            # protocol, client, scoring, packs
├── baselines/official/      # preset / exported packs
├── tests/
├── requirements.txt
└── CHANGELOG-FORK.md
```

> Repository: `Yat-mo/tracemark`  
> Product: **TraceMark**  
> Methodologically inspired by [hanlinwenyuan/hlwy-ai-checker](https://github.com/hanlinwenyuan/hlwy-ai-checker).

### Quick start

#### Install

```bash
git clone https://github.com/Yat-mo/tracemark.git
cd tracemark
git checkout improve/v2.3-hardening
python3 -m pip install -r requirements.txt

# Web UI (Node.js 18+)
cd web
npm ci
npm run build
cd ..
```

#### Web UI

```bash
python3 start.py --no-open
# open http://127.0.0.1:8000
```

`start.py` prefers `web/dist`. If the frontend is not built, it falls back to legacy `hlwy-ai-checker.html` or shows build instructions.

Dev mode (optional):

```bash
# terminal 1
python3 start.py --no-open

# terminal 2
cd web && npm run dev
```

Useful flags:

```bash
python3 start.py \
  --host 127.0.0.1 \
  --port 8000 \
  --timeout 60 \
  --allow-host api.openai.com \
  --allow-host api.anthropic.com \
  --no-open
```

#### Recommended workflow

```text
choose suite → calibrate official → export pack → test third-party → inspect score / confidence
```

| Suite | Use when |
| --- | --- |
| `robust` | Default. Multi-probe, more resilient |
| `classic` | Legacy baseline compatibility or minimal requests |

> Legacy baselines without suite metadata only match `classic`.  
> Re-calibrate with `robust` for the new method.

### Headless CLI

```bash
python3 hlwy_check.py suites
python3 hlwy_check.py list-packs

export HLWY_API_KEY=sk-...
python3 hlwy_check.py calibrate \
  --name "gpt-4o-official" \
  --base-url https://api.openai.com/v1 \
  --model gpt-4o \
  --suite robust \
  --iterations 200 \
  --as-pack \
  -o baselines/official/gpt-4o-robust.json

python3 hlwy_check.py test \
  --base-url https://third-party.example/v1 \
  --api-key sk-xxx \
  --model gpt-4o \
  --suite robust \
  --baseline baselines/official/gpt-4o-robust.json

python3 hlwy_check.py compare \
  --channels channels.json \
  --baseline baselines/official/gpt-4o-robust.json \
  --suite robust
```

Example `channels.json`:

```json
[
  {
    "name": "relay-a",
    "api_type": "openai",
    "base_url": "https://a.example/v1",
    "api_key": "sk-a",
    "model": "gpt-4o"
  },
  {
    "name": "relay-b",
    "api_type": "openai",
    "base_url": "https://b.example/v1",
    "api_key": "sk-b",
    "model": "gpt-4o"
  }
]
```

### Baseline packs

Format: `hlwy-baseline-pack/v1`

Preset directory: [`baselines/official/`](./baselines/official/)

| File | Notes |
| --- | --- |
| `demo-classic-pack.json` | Offline demo for classic |
| `demo-robust-pack.json` | Offline demo for robust |

These demo packs are **synthetic**.  
They are only for offline UI/CLI checks and are **not** real official fingerprints.

The Web UI can:

- import packs / arrays / single baselines
- load preset packs
- export standard packs

See [baselines/README.md](./baselines/README.md) for the schema.

### How it works

```text
probe prompt
    │
    ▼
many samples ──► number distribution
    │
    ├─ cosine similarity
    ├─ JS divergence
    ├─ Hellinger distance
    ├─ mode agreement
    └─ sample quality
            │
            ▼
      overall score + confidence
```

The question is not “was this one answer lucky?”  
The question is whether the **shape of behavior** matches.

### Safety & limits

- Local proxy binds to `127.0.0.1` by default
- Private / localhost targets are blocked to reduce SSRF risk
- Do not expose the proxy publicly
- Compare only within the same suite
- Results are statistical estimates, not forensic proof

### Development

```bash
python3 -m unittest discover -s tests -v
python3 hlwy_check.py gen-demo-packs
```

### Disclaimer

Results are for reference only.

Model sampling is stochastic, and relays may rate-limit, rewrite, route, or mix models.  
This tool must **not** be used as the sole commercial or legal basis for refunds or disputes.

TraceMark is maintained at [Yat-mo/tracemark](https://github.com/Yat-mo/tracemark).  
Methodologically inspired by [hanlinwenyuan/hlwy-ai-checker](https://github.com/hanlinwenyuan/hlwy-ai-checker); this repository is an enhanced fork.

---

<div align="center">

### Status

| Item | Value |
| --- | --- |
| Product | **TraceMark** |
| Version | `2.4.0` |
| Branch | `improve/v2.3-hardening` |
| Repo | [Yat-mo/tracemark](https://github.com/Yat-mo/tracemark) |
| Docs | [Changelog](./CHANGELOG-FORK.md) · [Baseline packs](./baselines/README.md) |

<br>

**Calibrate carefully. Compare fairly. Treat scores as evidence, not verdicts.**

</div>
