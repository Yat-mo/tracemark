"""Baseline pack load/save/validation for official and local packs."""

from __future__ import annotations

import json
import math
import random
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .protocol import (
    PROTOCOL_VERSION,
    build_baseline,
    calculate_distribution,
    calculate_stats,
    pad_distribution_to_355,
    protocol_compatible,
    protocol_meta,
    suite_probes,
)

PACK_FORMAT = "hlwy-baseline-pack/v1"
ROOT = Path(__file__).resolve().parents[1]
OFFICIAL_DIR = ROOT / "baselines" / "official"


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def validate_baseline(b: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if not isinstance(b, dict):
        return ["baseline is not an object"]
    for key in ("name", "model", "distribution", "stats"):
        if key not in b:
            errors.append(f"missing field: {key}")
    dist = b.get("distribution")
    if not isinstance(dist, list) or len(dist) != 355:
        errors.append("distribution must be length 355")
    elif any(not isinstance(x, (int, float)) or math.isnan(float(x)) for x in dist):
        errors.append("distribution contains non-numeric values")
    stats = b.get("stats")
    if not isinstance(stats, dict):
        errors.append("stats must be object")
    else:
        for k in ("mean", "stdDev", "median"):
            if k not in stats:
                errors.append(f"stats missing {k}")
    return errors


def validate_pack(pack: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if pack.get("format") != PACK_FORMAT:
        errors.append(f"format must be {PACK_FORMAT}")
    baselines = pack.get("baselines")
    if not isinstance(baselines, list) or not baselines:
        errors.append("baselines must be a non-empty array")
        return errors
    for i, b in enumerate(baselines):
        for err in validate_baseline(b):
            errors.append(f"baselines[{i}]: {err}")
    return errors


def load_pack(path: str | Path) -> dict[str, Any]:
    p = Path(path)
    data = json.loads(p.read_text(encoding="utf-8"))
    # Accept bare baseline arrays for web UI export compatibility
    if isinstance(data, list):
        pack = {
            "format": PACK_FORMAT,
            "name": p.stem,
            "version": "imported",
            "createdAt": _utc_now(),
            "protocolVersion": PROTOCOL_VERSION,
            "baselines": data,
            "source": "imported-array",
        }
    elif isinstance(data, dict) and "baselines" in data:
        pack = data
        pack.setdefault("format", PACK_FORMAT)
    elif isinstance(data, dict) and "distribution" in data:
        pack = {
            "format": PACK_FORMAT,
            "name": data.get("name") or p.stem,
            "version": "imported",
            "createdAt": _utc_now(),
            "protocolVersion": data.get("protocolVersion") or PROTOCOL_VERSION,
            "baselines": [data],
            "source": "imported-single",
        }
    else:
        raise ValueError(f"unsupported baseline file: {p}")

    errs = validate_pack(pack)
    if errs:
        raise ValueError("invalid pack:\n- " + "\n- ".join(errs))
    return pack


def save_pack(path: str | Path, pack: dict[str, Any]) -> Path:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    errs = validate_pack(pack)
    if errs:
        raise ValueError("invalid pack:\n- " + "\n- ".join(errs))
    p.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return p


def load_baselines_from_paths(paths: list[str | Path]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for path in paths:
        pack = load_pack(path)
        out.extend(pack["baselines"])
    return out


def list_official_packs() -> list[Path]:
    if not OFFICIAL_DIR.exists():
        return []
    return sorted(OFFICIAL_DIR.glob("*.json"))


def filter_compatible(baselines: list[dict[str, Any]], suite_id: str) -> list[dict[str, Any]]:
    return [b for b in baselines if protocol_compatible(b, suite_id)]


def make_synthetic_baseline(
    *,
    name: str,
    model: str,
    suite_id: str,
    mode: int,
    samples: int = 200,
    seed: int = 42,
    spread: float = 18.0,
    api_type: str = "openai",
) -> dict[str, Any]:
    """Create a synthetic baseline for offline demo / CI.

    Not a real model fingerprint. Marked source=synthetic-demo.
    """
    rng = random.Random(seed)
    probes = suite_probes(suite_id)
    probe_results: dict[str, list[int]] = {}
    for probe in probes:
        vals: list[int] = []
        # Bias toward mode within probe range.
        local_mode = min(max(mode, probe.min), probe.max)
        for _ in range(max(20, int(samples * probe.weight) if probe.weight < 1 else samples)):
            # Mixture: peaked around mode + uniform noise
            if rng.random() < 0.55:
                v = int(round(rng.gauss(local_mode, spread * (probe.max - probe.min) / 355.0 + 2)))
            else:
                v = rng.randint(probe.min, probe.max)
            v = min(max(v, probe.min), probe.max)
            vals.append(v)
        probe_results[probe.id] = vals

    primary = probes[0]
    primary_results = probe_results[primary.id]
    return build_baseline(
        name=name,
        model=model,
        api_type=api_type,
        suite_id=suite_id,
        primary_results=primary_results,
        probe_results=probe_results,
        success_count=sum(len(v) for v in probe_results.values()),
        parse_fail_count=0,
        transport_fail_count=0,
        target_iterations=samples,
        source="synthetic-demo",
        notes=(
            "SYNTHETIC DEMO ONLY. Not measured from any real official API. "
            "Replace with real calibrate output before production use."
        ),
    )


def write_official_demo_packs(out_dir: str | Path | None = None) -> list[Path]:
    """Write demo official-style packs into baselines/official/."""
    target = Path(out_dir) if out_dir else OFFICIAL_DIR
    target.mkdir(parents=True, exist_ok=True)

    classic_models = [
        ("demo-gpt-like-classic", "demo-gpt-like", 27, 7),
        ("demo-claude-like-classic", "demo-claude-like", 42, 11),
        ("demo-deepseek-like-classic", "demo-deepseek-like", 88, 13),
    ]
    robust_models = [
        ("demo-gpt-like-robust", "demo-gpt-like", 27, 7),
        ("demo-claude-like-robust", "demo-claude-like", 42, 11),
        ("demo-deepseek-like-robust", "demo-deepseek-like", 88, 13),
    ]

    written: list[Path] = []
    classic_baselines = [
        make_synthetic_baseline(name=n, model=m, suite_id="classic", mode=mode, seed=seed)
        for n, m, mode, seed in classic_models
    ]
    robust_baselines = [
        make_synthetic_baseline(name=n, model=m, suite_id="robust", mode=mode, seed=seed)
        for n, m, mode, seed in robust_models
    ]

    packs = [
        (
            target / "demo-classic-pack.json",
            {
                "format": PACK_FORMAT,
                "name": "demo-classic-pack",
                "version": "2.4.0-demo",
                "createdAt": _utc_now(),
                "protocolVersion": PROTOCOL_VERSION,
                "suiteId": "classic",
                "source": "synthetic-demo",
                "description": (
                    "Synthetic classic-suite baselines for offline CLI/UI testing. "
                    "NOT real official fingerprints."
                ),
                "baselines": classic_baselines,
            },
        ),
        (
            target / "demo-robust-pack.json",
            {
                "format": PACK_FORMAT,
                "name": "demo-robust-pack",
                "version": "2.4.0-demo",
                "createdAt": _utc_now(),
                "protocolVersion": PROTOCOL_VERSION,
                "suiteId": "robust",
                "source": "synthetic-demo",
                "description": (
                    "Synthetic robust-suite baselines for offline CLI/UI testing. "
                    "NOT real official fingerprints."
                ),
                "baselines": robust_baselines,
            },
        ),
    ]
    for path, pack in packs:
        written.append(save_pack(path, pack))
    return written
