# TraceMark Web UI

Vite + React + TypeScript front end for TraceMark.

## Develop

```bash
# terminal 1 — local proxy
python3 start.py --no-open

# terminal 2 — HMR (proxies API/baselines to :8000)
npm install
npm run dev
```

## Build

```bash
npm ci
npm run build
```

`start.py` serves `dist/` at `http://127.0.0.1:8000`.

## Test

```bash
npm test
```
