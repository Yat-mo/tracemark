# hlwy-ai-checker

<p align="center">
  <strong>AI API 指紋檢測器 / Model Fingerprinting Checker</strong><br>
  <em>檢查第三方 AI API 是否摻假、渠道是否一致</em><br>
  <em>Detect third-party AI API substitution and channel consistency</em>
</p>

<p align="center">
  <img alt="Python" src="https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/License-LGPL--2.1-blue">
  <img alt="Version" src="https://img.shields.io/badge/version-2.4.0-7c5cff">
  <img alt="UI" src="https://img.shields.io/badge/UI-Web%20%2B%20CLI-2ea44f">
</p>

<p align="center">
  <a href="#繁體中文">繁體中文</a> ·
  <a href="#english">English</a> ·
  <a href="./CHANGELOG-FORK.md">Changelog</a> ·
  <a href="./baselines/README.md">Baseline Packs</a>
</p>

---

> **Fork 改進版 / Enhanced fork:** [Yat-mo/hlwy-ai-checker](https://github.com/Yat-mo/hlwy-ai-checker)  
> **上游專案 / Upstream:** [hanlinwenyuan/hlwy-ai-checker](https://github.com/hanlinwenyuan/hlwy-ai-checker)

這個 fork 在原有 Web UI 基礎上，補上了：
- 更安全的本機代理
- 多探針協議與更嚴格的解析／評分
- Headless CLI
- 基準包（baseline pack）格式與預置 demo 包

This fork builds on the original Web UI with:
- a safer local proxy
- multi-probe protocol + stricter parsing / scoring
- a headless CLI
- baseline pack format and demo packs

---

## 繁體中文

### 這是什麼

大語言模型不是真正的亂數產生器。  
當模型被要求「隨機選一個數字」時，不同模型會因為訓練資料、架構、對齊方式與 tokenization 差異，表現出可重複的偏差分布。

`hlwy-ai-checker` 會：

1. 先用**官方 API** 標定（calibrate）模型指紋  
2. 再對**第三方渠道**重複相同探測  
3. 以分布相似度判斷渠道是否像同一模型、是否有摻假嫌疑

### 為什麼有用

| 能力 | 說明 |
| --- | --- |
| 指紋區分度高 | 以統計分布比較模型行為，不只看單一回答 |
| 成本低 | 單次請求只要求輸出一個數字，token 消耗很小 |
| 可重複 | 固定探針與參數，便於橫向比較渠道 |
| Web + CLI | 可用瀏覽器操作，也能腳本化批量測試 |
| 可匯出證據 | 基準與結果可存成 JSON pack，方便存檔與分享 |

### 快速開始

#### 1. 安裝

```bash
git clone https://github.com/Yat-mo/hlwy-ai-checker.git
cd hlwy-ai-checker
git checkout improve/v2.3-hardening
python3 -m pip install -r requirements.txt
```

#### 2. 啟動 Web UI

```bash
python3 start.py --no-open
# 瀏覽器開啟 http://127.0.0.1:8000
```

常用參數：

```bash
python3 start.py --host 127.0.0.1 --port 8000 --timeout 60 --no-open
python3 start.py --allow-host api.openai.com --allow-host api.anthropic.com
```

#### 3. 建議操作流程

1. 選擇探針套件  
   - **穩健多探針（robust）**：推薦  
   - **經典單探針（classic）**：相容舊基準
2. 用官方 key 建立基準  
3. 用同一套件測試第三方渠道  
4. 查看匹配度、眾數、JS 散度與置信度  
5. 匯出結果或基準包

> 舊版基準（沒有 suite 中繼資料）只相容「經典單探針」。  
> 要用新方法，請先用 robust 重新標定。

### Headless CLI

```bash
# 查看探針套件
python3 hlwy_check.py suites

# 查看預置基準包
python3 hlwy_check.py list-packs

# 官方 key 標定並匯出 pack
export HLWY_API_KEY=sk-...
python3 hlwy_check.py calibrate \
  --name "gpt-4o-official" \
  --base-url https://api.openai.com/v1 \
  --model gpt-4o \
  --suite robust \
  --iterations 200 \
  --as-pack \
  -o baselines/official/gpt-4o-robust.json

# 測試第三方渠道
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
    "name": "中轉A",
    "api_type": "openai",
    "base_url": "https://a.example/v1",
    "api_key": "sk-a",
    "model": "gpt-4o"
  },
  {
    "name": "中轉B",
    "api_type": "openai",
    "base_url": "https://b.example/v1",
    "api_key": "sk-b",
    "model": "gpt-4o"
  }
]
```

### 基準包（Baseline Pack）

預置包位於 [`baselines/official/`](./baselines/official/)：

- `demo-classic-pack.json`
- `demo-robust-pack.json`

這些 demo 包是 **synthetic** 資料，只適合離線驗證 CLI / UI，**不是**真實官方指紋。

Web UI 的「基準管理」可：

- 匯入 pack / 基準陣列 / 單一基準
- 一鍵載入預置基準包
- 匯出為 `hlwy-baseline-pack/v1`

詳細格式見：[baselines/README.md](./baselines/README.md)

### 原理（簡述）

LLM 被要求「隨機選數字」時，並不會真正均勻抽樣。  
不同模型的偏差，在大量取樣後會形成可區分的統計指紋。

本工具會比較：

- 分布相似度（cosine / JS divergence / Hellinger）
- 眾數是否接近
- 樣本品質（解析失敗率、傳輸失敗率）

結果用來判斷：

- 這個渠道像不像官方同名模型
- 多個中轉是否行為一致
- 是否有明顯摻假或路由異常

### 截圖

#### 區分度

<img width="1463" height="599" alt="fingerprint separation" src="https://github.com/user-attachments/assets/2081fd7c-040d-4512-aff3-755926d893e8" />

<img width="1447" height="607" alt="match comparison" src="https://github.com/user-attachments/assets/0141405c-7d23-4cf0-bbe6-3e3b8a3e9fce" />

#### 一致性

<img width="1448" height="600" alt="consistency" src="https://github.com/user-attachments/assets/07b00a61-ee17-4d39-bb32-8e367d0d03cd" />

#### 低 token 消耗

<img width="1663" height="290" alt="low token usage" src="https://github.com/user-attachments/assets/64e1f1a3-0796-4477-a1c0-1f3b004fdf4d" />

#### 標定後再測試

<img width="1513" height="713" alt="calibrate then test" src="https://github.com/user-attachments/assets/2d2670b1-72ba-4cd1-9b5e-e3bf6a0d13b7" />

#### 標定介面

<img width="1354" height="852" alt="calibration UI" src="https://github.com/user-attachments/assets/67ff8592-dcf3-407c-9e12-57991447d016" />

### 安全與相容性提醒

- 本機代理預設綁定 `127.0.0.1`
- 會阻擋私網 / localhost 目標，降低 SSRF 風險
- 建議只在本機使用，不要把代理直接暴露到公網
- 舊基準只相容 classic 套件
- 協議 `2.3.0` 與 `2.4.0` 的同套件基準可互相接受
- demo pack 不可當作真實官方結果

### 開發與測試

```bash
python3 -m unittest discover -s tests -v
```

更多變更說明：[CHANGELOG-FORK.md](./CHANGELOG-FORK.md)

### 免責聲明

測試結果僅供參考。

由於模型本身具有隨機性，且受網路波動、限流、中轉設定影響，本工具結果**不能**作為商業糾紛、退款或法律主張的唯一依據。

本專案上游由 **hanlinwenyuan** 開發並在 [LINUX DO](https://linux.do/) 發布。  
本 fork 僅提供開源改進與維護，不介入使用者與 API 提供商之間的商業爭議。

---

## English

### What it is

Large language models are not true random number generators.  
When asked to “pick a random number,” different models leave different statistical biases because of training data, architecture, alignment, and tokenization.

`hlwy-ai-checker` works like this:

1. **Calibrate** a fingerprint against an official API  
2. **Replay** the same probe suite against a third-party channel  
3. **Compare** the resulting distributions to estimate whether the channel behaves like the claimed model

### Why it helps

| Strength | Description |
| --- | --- |
| High separation | Compares distributions, not one-off answers |
| Low token cost | Each request only asks for a single number |
| Reproducible | Fixed probes and parameters enable fair comparison |
| Web + CLI | Works in a browser and in automation scripts |
| Evidence export | Baselines and results can be saved as JSON packs |

### Quick start

#### 1. Install

```bash
git clone https://github.com/Yat-mo/hlwy-ai-checker.git
cd hlwy-ai-checker
git checkout improve/v2.3-hardening
python3 -m pip install -r requirements.txt
```

#### 2. Start the Web UI

```bash
python3 start.py --no-open
# open http://127.0.0.1:8000
```

Useful flags:

```bash
python3 start.py --host 127.0.0.1 --port 8000 --timeout 60 --no-open
python3 start.py --allow-host api.openai.com --allow-host api.anthropic.com
```

#### 3. Recommended workflow

1. Choose a probe suite  
   - **robust**: recommended multi-probe suite  
   - **classic**: single-probe suite for old baselines
2. Calibrate with an official key  
3. Test third-party channels with the **same** suite  
4. Inspect match score, mode, JS divergence, and confidence  
5. Export the baseline or result pack

> Legacy baselines without suite metadata only match **classic**.  
> For the new method, re-calibrate with **robust**.

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

Preset packs live in [`baselines/official/`](./baselines/official/):

- `demo-classic-pack.json`
- `demo-robust-pack.json`

These demo packs are **synthetic** and intended only for offline UI/CLI testing.  
They are **not** real official model fingerprints.

The Web UI baseline manager can:

- import packs / arrays / single baselines
- load preset packs with one click
- export as `hlwy-baseline-pack/v1`

See [baselines/README.md](./baselines/README.md) for the full format.

### How it works

When asked to choose a random integer, models do not sample uniformly.  
After enough draws, those biases form a fingerprint that is hard to fully hide with a simple system prompt.

The checker compares:

- distribution similarity (cosine / JS divergence / Hellinger)
- mode agreement
- sample quality (parse failures vs transport failures)

This helps answer:

- does this channel look like the official model?
- do multiple relays behave consistently?
- is there a strong sign of substitution or routing drift?

### Screenshots

#### Separation

<img width="1463" height="599" alt="fingerprint separation" src="https://github.com/user-attachments/assets/2081fd7c-040d-4512-aff3-755926d893e8" />

<img width="1447" height="607" alt="match comparison" src="https://github.com/user-attachments/assets/0141405c-7d23-4cf0-bbe6-3e3b8a3e9fce" />

#### Consistency

<img width="1448" height="600" alt="consistency" src="https://github.com/user-attachments/assets/07b00a61-ee17-4d39-bb32-8e367d0d03cd" />

#### Low token cost

<img width="1663" height="290" alt="low token usage" src="https://github.com/user-attachments/assets/64e1f1a3-0796-4477-a1c0-1f3b004fdf4d" />

#### Calibrate, then test

<img width="1513" height="713" alt="calibrate then test" src="https://github.com/user-attachments/assets/2d2670b1-72ba-4cd1-9b5e-e3bf6a0d13b7" />

#### Calibration UI

<img width="1354" height="852" alt="calibration UI" src="https://github.com/user-attachments/assets/67ff8592-dcf3-407c-9e12-57991447d016" />

### Safety notes

- The local proxy binds to `127.0.0.1` by default
- Private / localhost targets are blocked to reduce SSRF risk
- Keep the proxy local; do not expose it publicly
- Legacy baselines only match the classic suite
- Protocol versions `2.3.0` and `2.4.0` accept each other for the same suite
- Demo packs must not be treated as real official fingerprints

### Development

```bash
python3 -m unittest discover -s tests -v
```

See [CHANGELOG-FORK.md](./CHANGELOG-FORK.md) for the full change list.

### Disclaimer

Results are for reference only.

Because model sampling is stochastic and channels may rate-limit, rewrite, or route inconsistently, this tool must **not** be used as the sole legal or commercial basis for refunds, disputes, or claims.

Upstream project by **hanlinwenyuan**, originally published on [LINUX DO](https://linux.do/).  
This fork only provides open-source improvements and does not mediate commercial disputes between users and API providers.

---

## Links

- Fork: [Yat-mo/hlwy-ai-checker](https://github.com/Yat-mo/hlwy-ai-checker)
- Upstream: [hanlinwenyuan/hlwy-ai-checker](https://github.com/hanlinwenyuan/hlwy-ai-checker)
- Community: [LINUX DO](https://linux.do/)
- Changes: [CHANGELOG-FORK.md](./CHANGELOG-FORK.md)
- Baseline packs: [baselines/README.md](./baselines/README.md)

## Star History

<a href="https://www.star-history.com/?repos=hanlinwenyuan%2Fhlwy-ai-checker&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=hanlinwenyuan/hlwy-ai-checker&type=date&theme=dark&legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=hanlinwenyuan/hlwy-ai-checker&type=date&legend=top-left" />
    <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=hanlinwenyuan/hlwy-ai-checker&type=date&legend=top-left" />
  </picture>
</a>
