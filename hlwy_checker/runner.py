"""Calibration / test runners for headless mode."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable

import requests

from .client import get_probe_sample
from .protocol import (
    allocate_probe_plan,
    build_baseline,
    match_baselines,
    pad_distribution_to_355,
    calculate_distribution,
    sample_quality,
    suite_probes,
)


ProgressCb = Callable[[dict[str, Any]], None]


def _run_plan(
    *,
    plan,
    api_type: str,
    base_url: str,
    api_key: str,
    model: str,
    header_preset: str,
    concurrency: int,
    timeout: int,
    on_progress: ProgressCb | None = None,
) -> dict[str, Any]:
    probes = {p.id for p in plan}
    results_by_probe: dict[str, list[int]] = {pid: [] for pid in probes}
    success = parse_fail = transport_fail = 0
    completed = 0
    total = len(plan)
    session = requests.Session()

    def one(probe):
        return probe, get_probe_sample(
            api_type=api_type,
            base_url=base_url,
            api_key=api_key,
            model=model,
            probe=probe,
            header_preset=header_preset,
            timeout=timeout,
            session=session,
        )

    workers = max(1, min(concurrency, total or 1))
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = [ex.submit(one, probe) for probe in plan]
        for fut in as_completed(futures):
            probe, sample = fut.result()
            completed += 1
            if sample["ok"]:
                results_by_probe[probe.id].append(sample["value"])
                success += 1
            elif sample["kind"] == "parse":
                parse_fail += 1
            else:
                transport_fail += 1
            if on_progress:
                on_progress(
                    {
                        "completed": completed,
                        "total": total,
                        "success": success,
                        "parse_fail": parse_fail,
                        "transport_fail": transport_fail,
                    }
                )

    return {
        "results_by_probe": results_by_probe,
        "success": success,
        "parse_fail": parse_fail,
        "transport_fail": transport_fail,
        "total": total,
    }


def calibrate(
    *,
    name: str,
    api_type: str,
    base_url: str,
    api_key: str,
    model: str,
    suite_id: str = "robust",
    iterations: int = 200,
    concurrency: int = 5,
    header_preset: str = "default",
    timeout: int = 60,
    min_samples: int = 40,
    source: str = "calibrated",
    notes: str | None = None,
    on_progress: ProgressCb | None = None,
) -> dict[str, Any]:
    if iterations < 50 or iterations > 2000:
        raise ValueError("iterations must be in 50..2000 for headless CLI")
    plan = allocate_probe_plan(suite_id, iterations)
    raw = _run_plan(
        plan=plan,
        api_type=api_type,
        base_url=base_url,
        api_key=api_key,
        model=model,
        header_preset=header_preset,
        concurrency=concurrency,
        timeout=timeout,
        on_progress=on_progress,
    )
    primary_id = suite_probes(suite_id)[0].id
    primary_results = raw["results_by_probe"].get(primary_id, [])
    if len(primary_results) < min_samples:
        raise RuntimeError(
            f"not enough primary samples: {len(primary_results)} < {min_samples} "
            f"(success={raw['success']} parse={raw['parse_fail']} transport={raw['transport_fail']})"
        )
    baseline = build_baseline(
        name=name,
        model=model,
        api_type=api_type,
        suite_id=suite_id,
        primary_results=primary_results,
        probe_results=raw["results_by_probe"],
        success_count=raw["success"],
        parse_fail_count=raw["parse_fail"],
        transport_fail_count=raw["transport_fail"],
        target_iterations=iterations,
        source=source,
        notes=notes,
    )
    return {"baseline": baseline, "run": raw}


def test_channel(
    *,
    api_type: str,
    base_url: str,
    api_key: str,
    model: str,
    baselines: list[dict[str, Any]],
    suite_id: str = "robust",
    iterations: int = 200,
    concurrency: int = 5,
    header_preset: str = "default",
    timeout: int = 60,
    min_samples: int = 40,
    on_progress: ProgressCb | None = None,
) -> dict[str, Any]:
    plan = allocate_probe_plan(suite_id, iterations)
    raw = _run_plan(
        plan=plan,
        api_type=api_type,
        base_url=base_url,
        api_key=api_key,
        model=model,
        header_preset=header_preset,
        concurrency=concurrency,
        timeout=timeout,
        on_progress=on_progress,
    )
    primary_id = suite_probes(suite_id)[0].id
    primary = suite_probes(suite_id)[0]
    primary_results = raw["results_by_probe"].get(primary_id, [])
    if len(primary_results) < min_samples:
        raise RuntimeError(
            f"not enough primary samples: {len(primary_results)} < {min_samples}"
        )
    quality = sample_quality(raw["success"], raw["parse_fail"], raw["transport_fail"], iterations)
    dist = pad_distribution_to_355(calculate_distribution(primary_results, primary.max))
    matches = match_baselines(dist, primary_results, baselines, suite_id, quality)
    return {
        "model": model,
        "suiteId": suite_id,
        "sampleQuality": quality,
        "primaryResults": primary_results,
        "distribution": dist,
        "matches": [
            {
                "name": m["baseline"].get("name"),
                "model": m["baseline"].get("model"),
                "score": m["score"],
                "modeMatch": m["modeMatch"],
                "similarity": m["similarity"],
                "baselineStats": m["baseline"].get("stats"),
                "testStats": m["testStats"],
            }
            for m in matches[:10]
        ],
        "run": {
            "success": raw["success"],
            "parse_fail": raw["parse_fail"],
            "transport_fail": raw["transport_fail"],
            "total": raw["total"],
        },
    }
