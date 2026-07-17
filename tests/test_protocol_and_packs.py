#!/usr/bin/env python3
"""Tests for protocol math, packs, and headless CLI helpers."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from hlwy_checker.baselines import (
    load_pack,
    make_synthetic_baseline,
    save_pack,
    validate_baseline,
    write_official_demo_packs,
)
from hlwy_checker.protocol import (
    allocate_probe_plan,
    calculate_similarity,
    extract_number,
    match_baselines,
    pad_distribution_to_355,
    calculate_distribution,
    protocol_compatible,
)


class ExtractNumberTests(unittest.TestCase):
    def test_accepts_pure(self):
        self.assertEqual(extract_number("27"), 27)
        self.assertEqual(extract_number("355。"), 355)

    def test_rejects_free_text(self):
        self.assertIsNone(extract_number("今天选 27 吧"))
        self.assertIsNone(extract_number("355 以内随便，比如 12"))


class ProtocolTests(unittest.TestCase):
    def test_allocate_plan_weights(self):
        plan = allocate_probe_plan("robust", 100)
        self.assertEqual(len(plan), 100)
        ids = [p.id for p in plan]
        self.assertIn("rand_1_355_zh", ids)
        self.assertIn("rand_1_100_zh", ids)

    def test_similarity_self_match(self):
        nums = [27] * 80 + [28] * 20 + list(range(1, 41))
        dist = pad_distribution_to_355(calculate_distribution(nums, 355))
        stats = {"mode": 27, "min": 1, "max": 355, "mean": 30, "median": 27, "stdDev": 10}
        sim = calculate_similarity(dist, dist, stats, stats, 1.0)
        self.assertGreater(sim["overallScore"], 0.9)
        self.assertGreater(sim["confidence"], 0.8)

    def test_protocol_compatible_legacy(self):
        legacy = {"name": "x", "stats": {"mode": 1}, "distribution": [0.0] * 355}
        self.assertTrue(protocol_compatible(legacy, "classic"))
        self.assertFalse(protocol_compatible(legacy, "robust"))


class PackTests(unittest.TestCase):
    def test_synthetic_pack_roundtrip(self):
        b = make_synthetic_baseline(
            name="demo",
            model="demo-model",
            suite_id="classic",
            mode=27,
            samples=120,
            seed=1,
        )
        self.assertEqual(validate_baseline(b), [])
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "pack.json"
            pack = {
                "format": "hlwy-baseline-pack/v1",
                "name": "t",
                "version": "test",
                "baselines": [b],
            }
            save_pack(path, pack)
            loaded = load_pack(path)
            self.assertEqual(len(loaded["baselines"]), 1)
            matches = match_baselines(
                b["distribution"],
                b["rawData"],
                loaded["baselines"],
                "classic",
                1.0,
            )
            self.assertEqual(matches[0]["baseline"]["name"], "demo")
            self.assertGreater(matches[0]["score"], 0.85)

    def test_write_demo_packs(self):
        with tempfile.TemporaryDirectory() as td:
            written = write_official_demo_packs(td)
            self.assertEqual(len(written), 2)
            for p in written:
                pack = load_pack(p)
                self.assertGreaterEqual(len(pack["baselines"]), 1)
                self.assertEqual(pack["source"], "synthetic-demo")


class ImportWebArrayTests(unittest.TestCase):
    def test_import_array(self):
        b = make_synthetic_baseline(
            name="arr",
            model="m",
            suite_id="robust",
            mode=42,
            samples=100,
            seed=3,
        )
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "arr.json"
            path.write_text(json.dumps([b]), encoding="utf-8")
            pack = load_pack(path)
            self.assertEqual(pack["source"], "imported-array")
            self.assertEqual(pack["baselines"][0]["name"], "arr")


if __name__ == "__main__":
    unittest.main()
