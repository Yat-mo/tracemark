# TraceMark Changes

Repo: https://github.com/Yat-mo/hlwy-ai-checker  
Inspired by: https://github.com/hanlinwenyuan/hlwy-ai-checker

## v2.4.0 — TraceMark branding + headless CLI + baseline packs

### Brand
- Product name: **TraceMark**
- Tagline: Behavioral Model Fingerprinting / 模型行為指紋探測

### Headless CLI
- Package: `hlwy_checker/`
- Entry: `python3 hlwy_check.py ...` or `python3 -m hlwy_checker ...`
- Commands:
  - `suites`
  - `calibrate`
  - `test`
  - `compare`
  - `list-packs` / `inspect-pack` / `gen-demo-packs`
- Direct API calls (no browser / local proxy required for CLI)
- Shared protocol with the web UI: strict parse, multi-probe suites, scoring

### Baseline packs
- Format: `hlwy-baseline-pack/v1`
- Directory: `baselines/official/`
- Demo packs included (synthetic, for offline testing only)
- Web UI: import pack / load official packs button
- Local server serves:
  - `/baselines/official/index.json`
  - `/baselines/official/*.json`

## v2.3.0 — hardening

### Proxy safety (`start.py`)
- Default bind: `127.0.0.1`
- SSRF checks for `X-Target-Base-URL`
- Body size limit (256KB)
- Upstream timeout default 60s
- `/health`
- CLI flags: `--host --port --allow-host --timeout --no-open`

### Detection robustness (`hlwy-ai-checker.html`)
- Probe protocol versioned suites: classic / robust
- Strict number parse
- Transport vs parse failure buckets
- Retry + AbortController
- Distribution-first scoring + confidence

### Engineering
- `requirements.txt`
- unit tests
- this changelog

## Compatibility
- Old baselines (no suite metadata) only match **classic**
- Protocol `2.3.0` and `2.4.0` baselines are mutually accepted for same suite
- Demo packs are synthetic; recalibrate real official keys before production claims

## Run
```bash
python3 -m pip install -r requirements.txt
python3 start.py --no-open
# http://127.0.0.1:8000

# headless
python3 hlwy_check.py suites
python3 hlwy_check.py list-packs
python3 hlwy_check.py calibrate --name my-baseline --base-url https://api.openai.com/v1 --model gpt-4o --suite robust -o out.json --as-pack

python3 -m unittest discover -s tests -v
```
