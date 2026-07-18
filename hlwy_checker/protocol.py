"""Probe protocol, parsing, distribution stats, and similarity scoring.

Mirrors the Web UI probe protocol (v2.3+/2.4).
"""

from __future__ import annotations

import math
import re
from dataclasses import asdict, dataclass
from typing import Any

PROTOCOL_VERSION = "2.4.0"

# Keep classic probe text identical to the web UI so baselines remain comparable.
PROBE_SUITES: dict[str, dict[str, Any]] = {
    "classic": {
        "id": "classic",
        "name": "经典单探针 (兼容 v2.2)",
        "probes": [
            {
                "id": "rand_1_355_zh",
                "weight": 1.0,
                "min": 1,
                "max": 355,
                "temperature": 1.0,
                "max_tokens": 10,
                "prompt": "请从1到355之间随机选择一个数字，只输出这个数字，不要有任何其他内容。",
            }
        ],
    },
    "robust": {
        "id": "robust",
        "name": "稳健多探针 (推荐)",
        "probes": [
            {
                "id": "rand_1_355_zh",
                "weight": 0.4,
                "min": 1,
                "max": 355,
                "temperature": 1.0,
                "max_tokens": 10,
                "prompt": "请从1到355之间随机选择一个数字，只输出这个数字，不要有任何其他内容。",
            },
            {
                "id": "rand_1_100_zh",
                "weight": 0.25,
                "min": 1,
                "max": 100,
                "temperature": 1.0,
                "max_tokens": 10,
                "prompt": "请从1到100之间随机选择一个整数，只输出这个数字，不要有任何其他内容。",
            },
            {
                "id": "rand_1_355_en",
                "weight": 0.2,
                "min": 1,
                "max": 355,
                "temperature": 1.0,
                "max_tokens": 10,
                "prompt": "Pick a random integer from 1 to 355. Output only the number with no other text.",
            },
            {
                "id": "rand_1_50_zh",
                "weight": 0.15,
                "min": 1,
                "max": 50,
                "temperature": 1.0,
                "max_tokens": 10,
                "prompt": "请从1到50之间随机选择一个整数，只输出这个数字，不要有任何其他内容。",
            },
        ],
    },
}


@dataclass(frozen=True)
class Probe:
    id: str
    weight: float
    min: int
    max: int
    temperature: float
    max_tokens: int
    prompt: str


def list_suites() -> list[str]:
    return list(PROBE_SUITES.keys())


def get_suite(suite_id: str) -> dict[str, Any]:
    if suite_id not in PROBE_SUITES:
        raise ValueError(f"unknown suite: {suite_id}; choose from {list_suites()}")
    return PROBE_SUITES[suite_id]


def suite_probes(suite_id: str) -> list[Probe]:
    suite = get_suite(suite_id)
    return [Probe(**p) for p in suite["probes"]]


def protocol_meta(suite_id: str) -> dict[str, Any]:
    suite = get_suite(suite_id)
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "suiteId": suite["id"],
        "suiteName": suite["name"],
        "probes": [
            {
                "id": p["id"],
                "min": p["min"],
                "max": p["max"],
                "temperature": p["temperature"],
                "max_tokens": p["max_tokens"],
                "weight": p["weight"],
                "prompt": p["prompt"],
            }
            for p in suite["probes"]
        ],
    }


def protocol_compatible(baseline: dict[str, Any], suite_id: str) -> bool:
    if not baseline:
        return False
    # Legacy baselines without suite metadata are classic-only.
    if not baseline.get("protocolVersion") and not baseline.get("suiteId"):
        return suite_id == "classic"
    return baseline.get("suiteId") == suite_id and baseline.get("protocolVersion") in {
        PROTOCOL_VERSION,
        "2.3.0",  # accept previous fork protocol for robust/classic packs
    }


_STRICT_NUM = re.compile(
    r'^[`"\'“”‘’]?(\d{1,3})[`"\'“”‘’]?(?:[.。!！?？])?$'
)


def extract_number(text: Any, min_v: int = 1, max_v: int = 355) -> int | None:
    """Strict parse: only pure integer responses in [min_v, max_v]."""
    if text is None:
        return None
    s = str(text).strip()
    m = _STRICT_NUM.match(s)
    if not m:
        return None
    num = int(m.group(1))
    if num < min_v or num > max_v:
        return None
    return num


def allocate_probe_plan(suite_id: str, iterations: int) -> list[Probe]:
    probes = suite_probes(suite_id)
    if iterations < 1:
        return []
    plan: list[Probe] = []
    assigned = 0
    for idx, probe in enumerate(probes):
        if idx == len(probes) - 1:
            n = max(0, iterations - assigned)
        else:
            n = int(math.floor(iterations * probe.weight))
        assigned += n
        plan.extend([probe] * n)
    primary = probes[0]
    while len(plan) < iterations:
        plan.append(primary)
    return plan


def calculate_distribution(numbers: list[int], max_value: int = 355) -> list[float]:
    counts = [0] * max_value
    for num in numbers:
        if 1 <= num <= max_value:
            counts[num - 1] += 1
    total = len(numbers) or 1
    return [c / total for c in counts]


def pad_distribution_to_355(dist: list[float]) -> list[float]:
    if len(dist) == 355:
        return dist
    arr = [0.0] * 355
    for i in range(min(355, len(dist))):
        arr[i] = dist[i]
    s = sum(arr) or 1.0
    return [x / s for x in arr]


def calculate_stats(numbers: list[int]) -> dict[str, Any]:
    if not numbers:
        return {
            "mean": 0.0,
            "median": 0,
            "stdDev": 0.0,
            "min": 0,
            "max": 0,
            "unique": 0,
            "mode": None,
            "modeCount": 0,
        }
    sorted_nums = sorted(numbers)
    mean = sum(numbers) / len(numbers)
    variance = sum((x - mean) ** 2 for x in numbers) / len(numbers)
    freq: dict[int, int] = {}
    for n in numbers:
        freq[n] = freq.get(n, 0) + 1
    mode_val, mode_count = numbers[0], 0
    for k, v in freq.items():
        if v > mode_count:
            mode_val, mode_count = k, v
    return {
        "mean": mean,
        "median": sorted_nums[len(sorted_nums) // 2],
        "stdDev": math.sqrt(variance),
        "min": sorted_nums[0],
        "max": sorted_nums[-1],
        "unique": len(set(numbers)),
        "mode": mode_val,
        "modeCount": mode_count,
    }


def hellinger_distance(dist1: list[float], dist2: list[float]) -> float:
    n = min(len(dist1), len(dist2))
    s = 0.0
    for i in range(n):
        a = math.sqrt(max(0.0, dist1[i]))
        b = math.sqrt(max(0.0, dist2[i]))
        s += (a - b) ** 2
    return math.sqrt(s / 2.0)


def sample_quality(
    success_count: int,
    parse_fail_count: int,
    transport_fail_count: int,
    target_iterations: int,
) -> float:
    total = success_count + parse_fail_count + transport_fail_count
    if total == 0:
        return 0.0
    success_rate = success_count / max(target_iterations, total)
    parse_rate = parse_fail_count / total
    return max(0.0, min(1.0, success_rate * (1.0 - 0.7 * parse_rate)))


def calculate_similarity(
    dist1: list[float],
    dist2: list[float],
    stats1: dict[str, Any] | None = None,
    stats2: dict[str, Any] | None = None,
    sample_quality_value: float = 1.0,
) -> dict[str, float]:
    n = min(len(dist1), len(dist2))
    dot = norm1 = norm2 = 0.0
    for i in range(n):
        dot += dist1[i] * dist2[i]
        norm1 += dist1[i] * dist1[i]
        norm2 += dist2[i] * dist2[i]
    denom = math.sqrt(norm1) * math.sqrt(norm2)
    cosine = (dot / denom) if denom > 0 else 0.0

    js_div = 0.0
    eps = 1e-10
    for i in range(n):
        p = dist1[i] + eps
        q = dist2[i] + eps
        m = (p + q) / 2.0
        js_div += (p * math.log(p / m) + q * math.log(q / m)) / 2.0

    hellinger = hellinger_distance(dist1, dist2)
    distrib_score = max(0.0, min(1.0, cosine * math.exp(-js_div) * (1.0 - hellinger)))

    mode_score = 0.0
    if stats1 and stats2 and stats1.get("mode") is not None and stats2.get("mode") is not None:
        mode1 = stats1["mode"]
        mode2 = stats2["mode"]
        if mode1 == mode2:
            mode_score = 1.0
        else:
            range_v = max(
                1,
                max(stats1.get("max") or 355, stats2.get("max") or 355)
                - min(stats1.get("min") or 1, stats2.get("min") or 1),
            )
            diff = abs(mode1 - mode2)
            mode_score = max(0.0, 1.0 - diff / max(20.0, range_v * 0.15))

    quality = max(0.2, min(1.0, sample_quality_value))
    overall = (mode_score * 0.25 + distrib_score * 0.75) * quality
    confidence = max(0.0, min(1.0, (1.0 - abs(mode_score - distrib_score)) * quality))
    return {
        "cosineSimilarity": cosine,
        "jsDivergence": js_div,
        "hellinger": hellinger,
        "modeScore": mode_score,
        "distribScore": distrib_score,
        "overallScore": overall,
        "confidence": confidence,
    }


def match_baselines(
    test_distribution: list[float],
    test_results: list[int],
    baselines: list[dict[str, Any]],
    suite_id: str,
    quality: float = 1.0,
) -> list[dict[str, Any]]:
    test_stats = calculate_stats(test_results)
    matches: list[dict[str, Any]] = []
    for baseline in baselines:
        if not protocol_compatible(baseline, suite_id):
            continue
        similarity = calculate_similarity(
            test_distribution,
            baseline["distribution"],
            test_stats,
            baseline.get("stats"),
            quality,
        )
        matches.append(
            {
                "baseline": baseline,
                "similarity": similarity,
                "testStats": test_stats,
                "score": similarity["overallScore"],
                "modeMatch": test_stats.get("mode") == (baseline.get("stats") or {}).get("mode"),
            }
        )
    matches.sort(key=lambda m: m["score"], reverse=True)
    return matches


def build_baseline(
    *,
    name: str,
    model: str,
    api_type: str,
    suite_id: str,
    primary_results: list[int],
    probe_results: dict[str, list[int]],
    success_count: int,
    parse_fail_count: int,
    transport_fail_count: int,
    target_iterations: int,
    source: str = "calibrated",
    notes: str | None = None,
) -> dict[str, Any]:
    probes = suite_probes(suite_id)
    primary = probes[0]
    dist = pad_distribution_to_355(calculate_distribution(primary_results, primary.max))
    stats = calculate_stats(primary_results)
    quality = sample_quality(success_count, parse_fail_count, transport_fail_count, target_iterations)
    meta = protocol_meta(suite_id)
    baseline: dict[str, Any] = {
        "name": name,
        "model": model,
        "apiType": api_type,
        "timestamp": _utc_now(),
        "iterations": len(primary_results),
        "distribution": dist,
        "stats": stats,
        "rawData": primary_results,
        **meta,
        "sampleQuality": quality,
        "parseFailCount": parse_fail_count,
        "transportFailCount": transport_fail_count,
        "probeResults": {
            pid: {
                "count": len(vals),
                "stats": calculate_stats(vals),
                "rawData": vals,
            }
            for pid, vals in probe_results.items()
        },
        "source": source,
    }
    if notes:
        baseline["notes"] = notes
    return baseline


def _utc_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
