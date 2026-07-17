"""Headless CLI for hlwy-ai-checker."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

from . import __version__
from .baselines import (
    OFFICIAL_DIR,
    filter_compatible,
    list_official_packs,
    load_baselines_from_paths,
    load_pack,
    save_pack,
    write_official_demo_packs,
    PACK_FORMAT,
)
from .protocol import PROTOCOL_VERSION, list_suites, protocol_meta
from .runner import calibrate, test_channel


def _eprint(msg: str) -> None:
    print(msg, file=sys.stderr)


def _progress_cb(quiet: bool):
    if quiet:
        return None

    def cb(info: dict[str, Any]) -> None:
        done = info["completed"] >= info["total"]
        line = (
            f"progress {info['completed']}/{info['total']} "
            f"ok={info['success']} parse={info['parse_fail']} transport={info['transport_fail']}"
        )
        if done:
            print(line, file=sys.stderr)
        else:
            print("\r" + line, end="", file=sys.stderr, flush=True)

    return cb


def _add_common_api_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--api-type", choices=["openai", "openai-responses", "anthropic"], default="openai")
    p.add_argument("--base-url", required=True, help="API base URL, e.g. https://api.openai.com/v1")
    p.add_argument("--api-key", default=os.environ.get("HLWY_API_KEY") or os.environ.get("OPENAI_API_KEY") or "")
    p.add_argument("--model", required=True)
    p.add_argument("--suite", choices=list_suites(), default="robust")
    p.add_argument("--iterations", type=int, default=200)
    p.add_argument("--concurrency", type=int, default=5)
    p.add_argument("--header-preset", choices=["default", "claude-code", "codex"], default="default")
    p.add_argument("--timeout", type=int, default=60)
    p.add_argument("--quiet", action="store_true")


def cmd_suites(_: argparse.Namespace) -> int:
    print(json.dumps({"protocolVersion": PROTOCOL_VERSION, "suites": list_suites(), "meta": {s: protocol_meta(s) for s in list_suites()}}, ensure_ascii=False, indent=2))
    return 0


def cmd_list_packs(_: argparse.Namespace) -> int:
    packs = list_official_packs()
    out = []
    for p in packs:
        try:
            pack = load_pack(p)
            out.append(
                {
                    "path": str(p),
                    "name": pack.get("name"),
                    "version": pack.get("version"),
                    "suiteId": pack.get("suiteId"),
                    "source": pack.get("source"),
                    "baselines": len(pack.get("baselines") or []),
                    "description": pack.get("description"),
                }
            )
        except Exception as e:  # noqa: BLE001
            out.append({"path": str(p), "error": str(e)})
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


def cmd_gen_demo_packs(args: argparse.Namespace) -> int:
    written = write_official_demo_packs(args.out_dir)
    print(json.dumps({"written": [str(p) for p in written]}, ensure_ascii=False, indent=2))
    return 0


def cmd_calibrate(args: argparse.Namespace) -> int:
    if not args.api_key:
        _eprint("missing --api-key (or HLWY_API_KEY / OPENAI_API_KEY)")
        return 2
    try:
        result = calibrate(
            name=args.name,
            api_type=args.api_type,
            base_url=args.base_url,
            api_key=args.api_key,
            model=args.model,
            suite_id=args.suite,
            iterations=args.iterations,
            concurrency=args.concurrency,
            header_preset=args.header_preset,
            timeout=args.timeout,
            source="calibrated",
            notes=args.notes,
            on_progress=_progress_cb(args.quiet),
        )
    except Exception as e:  # noqa: BLE001
        _eprint(f"calibrate failed: {e}")
        return 1

    baseline = result["baseline"]
    if args.output:
        if args.as_pack or str(args.output).endswith(".json"):
            pack = {
                "format": PACK_FORMAT,
                "name": args.pack_name or args.name,
                "version": args.pack_version or "local",
                "createdAt": baseline["timestamp"],
                "protocolVersion": PROTOCOL_VERSION,
                "suiteId": args.suite,
                "source": "calibrated",
                "baselines": [baseline],
            }
            path = save_pack(args.output, pack)
            _eprint(f"wrote pack {path}")
        else:
            Path(args.output).write_text(json.dumps(baseline, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            _eprint(f"wrote baseline {args.output}")

    if args.json or not args.output:
        # avoid dumping full raw samples unless asked
        view = dict(baseline)
        if not args.include_raw:
            view.pop("rawData", None)
            pr = view.get("probeResults") or {}
            view["probeResults"] = {
                k: {kk: vv for kk, vv in v.items() if kk != "rawData"} for k, v in pr.items()
            }
        print(json.dumps(view, ensure_ascii=False, indent=2))
    return 0


def cmd_test(args: argparse.Namespace) -> int:
    if not args.api_key:
        _eprint("missing --api-key (or HLWY_API_KEY / OPENAI_API_KEY)")
        return 2
    paths = list(args.baseline or [])
    if args.use_official:
        paths.extend(str(p) for p in list_official_packs())
    if not paths:
        _eprint("provide --baseline PATH (repeatable) and/or --use-official")
        return 2
    try:
        baselines = load_baselines_from_paths(paths)
        baselines = filter_compatible(baselines, args.suite)
        if not baselines:
            _eprint(f"no baselines compatible with suite={args.suite}")
            return 1
        result = test_channel(
            api_type=args.api_type,
            base_url=args.base_url,
            api_key=args.api_key,
            model=args.model,
            baselines=baselines,
            suite_id=args.suite,
            iterations=args.iterations,
            concurrency=args.concurrency,
            header_preset=args.header_preset,
            timeout=args.timeout,
            on_progress=_progress_cb(args.quiet),
        )
    except Exception as e:  # noqa: BLE001
        _eprint(f"test failed: {e}")
        return 1

    if args.output:
        Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        _eprint(f"wrote {args.output}")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


def cmd_compare(args: argparse.Namespace) -> int:
    """Compare multiple channels against one baseline pack.

    Channels file JSON:
    [
      {"name":"A","api_type":"openai","base_url":"...","api_key":"...","model":"..."},
      ...
    ]
    """
    channels = json.loads(Path(args.channels).read_text(encoding="utf-8"))
    if not isinstance(channels, list) or not channels:
        _eprint("channels file must be a non-empty JSON array")
        return 2
    paths = list(args.baseline or [])
    if args.use_official:
        paths.extend(str(p) for p in list_official_packs())
    baselines = filter_compatible(load_baselines_from_paths(paths), args.suite)
    if not baselines:
        _eprint("no compatible baselines")
        return 1
    # Prefer named baseline if provided
    if args.baseline_name:
        baselines = [b for b in baselines if b.get("name") == args.baseline_name]
        if not baselines:
            _eprint(f"baseline name not found: {args.baseline_name}")
            return 1

    ranked = []
    for ch in channels:
        name = ch.get("name") or ch.get("model") or "channel"
        _eprint(f"testing channel {name} ...")
        try:
            res = test_channel(
                api_type=ch.get("api_type") or ch.get("apiType") or args.api_type,
                base_url=ch["base_url"] if "base_url" in ch else ch["baseUrl"],
                api_key=ch.get("api_key") or ch.get("apiKey") or "",
                model=ch["model"],
                baselines=baselines,
                suite_id=args.suite,
                iterations=args.iterations,
                concurrency=ch.get("concurrency") or args.concurrency,
                header_preset=ch.get("header_preset") or ch.get("headerPreset") or "default",
                timeout=args.timeout,
                on_progress=_progress_cb(args.quiet),
            )
            top = (res.get("matches") or [{}])[0]
            ranked.append(
                {
                    "channel": name,
                    "model": ch["model"],
                    "score": top.get("score"),
                    "matchName": top.get("name"),
                    "modeMatch": top.get("modeMatch"),
                    "confidence": (top.get("similarity") or {}).get("confidence"),
                    "run": res.get("run"),
                }
            )
        except Exception as e:  # noqa: BLE001
            ranked.append({"channel": name, "error": str(e)})

    ranked_ok = [r for r in ranked if "score" in r and r["score"] is not None]
    ranked_ok.sort(key=lambda r: r["score"], reverse=True)
    out = {"suiteId": args.suite, "ranking": ranked_ok, "failed": [r for r in ranked if "error" in r]}
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


def cmd_inspect_pack(args: argparse.Namespace) -> int:
    pack = load_pack(args.path)
    summary = {
        "name": pack.get("name"),
        "version": pack.get("version"),
        "format": pack.get("format"),
        "suiteId": pack.get("suiteId"),
        "source": pack.get("source"),
        "description": pack.get("description"),
        "baselines": [
            {
                "name": b.get("name"),
                "model": b.get("model"),
                "suiteId": b.get("suiteId"),
                "protocolVersion": b.get("protocolVersion"),
                "iterations": b.get("iterations"),
                "source": b.get("source"),
                "mode": (b.get("stats") or {}).get("mode"),
                "sampleQuality": b.get("sampleQuality"),
            }
            for b in pack.get("baselines") or []
        ],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="hlwy-check",
        description=f"hlwy-ai-checker headless CLI v{__version__} (protocol {PROTOCOL_VERSION})",
    )
    parser.add_argument("--version", action="version", version=f"hlwy-check {__version__}")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("suites", help="list probe suites / protocol metadata")
    p.set_defaults(func=cmd_suites)

    p = sub.add_parser("list-packs", help="list packs under baselines/official")
    p.set_defaults(func=cmd_list_packs)

    p = sub.add_parser("gen-demo-packs", help="generate synthetic demo official packs")
    p.add_argument("--out-dir", default=str(OFFICIAL_DIR))
    p.set_defaults(func=cmd_gen_demo_packs)

    p = sub.add_parser("inspect-pack", help="summarize a baseline pack")
    p.add_argument("path")
    p.set_defaults(func=cmd_inspect_pack)

    p = sub.add_parser("calibrate", help="calibrate a baseline from a real API")
    _add_common_api_args(p)
    p.add_argument("--name", required=True, help="baseline name")
    p.add_argument("--output", "-o", help="write baseline/pack JSON")
    p.add_argument("--as-pack", action="store_true", help="wrap as baseline pack")
    p.add_argument("--pack-name")
    p.add_argument("--pack-version")
    p.add_argument("--notes")
    p.add_argument("--json", action="store_true", help="print JSON even when writing file")
    p.add_argument("--include-raw", action="store_true")
    p.set_defaults(func=cmd_calibrate)

    p = sub.add_parser("test", help="test one channel against baseline packs")
    _add_common_api_args(p)
    p.add_argument("--baseline", action="append", help="baseline pack/json path (repeatable)")
    p.add_argument("--use-official", action="store_true", help="include baselines/official/*.json")
    p.add_argument("--output", "-o")
    p.set_defaults(func=cmd_test)

    p = sub.add_parser("compare", help="rank channels from a channels JSON file")
    p.add_argument("--channels", required=True, help="path to channels JSON array")
    p.add_argument("--baseline", action="append")
    p.add_argument("--use-official", action="store_true")
    p.add_argument("--baseline-name", help="select one baseline by name")
    p.add_argument("--suite", choices=list_suites(), default="robust")
    p.add_argument("--api-type", choices=["openai", "openai-responses", "anthropic"], default="openai")
    p.add_argument("--iterations", type=int, default=200)
    p.add_argument("--concurrency", type=int, default=5)
    p.add_argument("--timeout", type=int, default=60)
    p.add_argument("--quiet", action="store_true")
    p.set_defaults(func=cmd_compare)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
