# TraceMark Baseline Packs

## Format

`hlwy-baseline-pack/v1`

```json
{
  "format": "hlwy-baseline-pack/v1",
  "name": "my-pack",
  "version": "1.0.0",
  "createdAt": "2026-07-18T00:00:00Z",
  "protocolVersion": "2.4.0",
  "suiteId": "robust",
  "source": "calibrated",
  "description": "optional",
  "baselines": [ /* baseline objects */ ]
}
```

Also accepted:
- bare array of baselines (web UI export)
- single baseline object

## Official / demo packs

Files under `baselines/official/`:

- `demo-classic-pack.json`
- `demo-robust-pack.json`

These demo packs are **synthetic** for offline CLI/UI testing. They are **not** real official API fingerprints.

To regenerate:

```bash
python3 hlwy_check.py gen-demo-packs
```

## Real official packs

Use headless calibrate against a real official endpoint, then publish the pack:

```bash
export HLWY_API_KEY=sk-...
python3 hlwy_check.py calibrate \
  --name "gpt-4o-official" \
  --api-type openai \
  --base-url https://api.openai.com/v1 \
  --model gpt-4o \
  --suite robust \
  --iterations 200 \
  --as-pack \
  -o baselines/official/gpt-4o-robust.json
```

Mark real packs with `"source": "calibrated"` and avoid mixing synthetic demos into production comparisons.
