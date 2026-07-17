# CHANGES in this fork (v2.3.0)

Fork: https://github.com/Yat-mo/hlwy-ai-checker  
Upstream: https://github.com/hanlinwenyuan/hlwy-ai-checker

## What changed

### Proxy safety (`start.py`)
- Default bind: `127.0.0.1` (not just `localhost` alias messaging)
- SSRF checks for `X-Target-Base-URL` (scheme, credentials, private/link-local IPs, localhost)
- Body size limit (256KB)
- Upstream timeout default 60s
- `/health` endpoint
- CLI flags:
  - `--host`
  - `--port`
  - `--allow-host` (repeatable; when set, only listed hosts allowed)
  - `--timeout`
  - `--no-open`
- HTML path resolved relative to script directory

### Detection robustness (`hlwy-ai-checker.html`)
- Probe protocol version `2.3.0`
- Probe suites:
  - **稳健多探针 (robust)** recommended
  - **经典单探针 (classic)** for old baseline compatibility
- Strict number parse: only pure integer replies accepted
- Transport failures vs parse failures separated
- Retry with backoff for 429 / 5xx / timeout
- Abort cancels in-flight fetch via `AbortController`
- Scoring: distribution-first (75%) + mode auxiliary (25%), plus Hellinger and confidence proxy
- Baselines store protocol metadata (`protocolVersion`, `suiteId`, prompts, sample quality)
- Cross-suite comparison is blocked

### Engineering
- `requirements.txt`
- `tests/test_proxy_security.py`
- This changelog

## Compatibility notes
- Old baselines (no suite metadata) only match **classic** suite.
- Re-calibrate with **robust** suite for new comparisons.
- Matching still primarily uses the primary probe (`1..355` ZH) distribution for chart compatibility.

## Run
```bash
python3 -m pip install -r requirements.txt
python3 start.py --no-open
# open http://127.0.0.1:8000

python3 -m unittest discover -s tests -v
```
