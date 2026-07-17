#!/usr/bin/env python3
"""Unit tests for hlwy-ai-checker proxy security helpers."""

from __future__ import annotations

import importlib.util
import socket
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
START_PY = ROOT / "start.py"


def load_start():
    spec = importlib.util.spec_from_file_location("hlwy_start", START_PY)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {START_PY}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class ValidateTargetBaseUrlTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_start()
        self.mod.CONFIG["allow_hosts"] = set()
        self.mod.CONFIG["allow_any_public"] = True

    def test_rejects_localhost(self):
        ok, err = self.mod.validate_target_base_url("http://localhost:8000/v1")
        self.assertFalse(ok)
        self.assertIn("禁止", err)

    def test_rejects_private_ip_literal(self):
        ok, err = self.mod.validate_target_base_url("http://127.0.0.1/v1")
        self.assertFalse(ok)

    def test_rejects_non_http_scheme(self):
        ok, err = self.mod.validate_target_base_url("file:///etc/passwd")
        self.assertFalse(ok)
        self.assertIn("http", err)

    def test_rejects_embedded_credentials(self):
        ok, err = self.mod.validate_target_base_url("https://user:pass@example.com/v1")
        self.assertFalse(ok)

    def test_allowlist_blocks_other_hosts(self):
        self.mod.CONFIG["allow_hosts"] = {"api.openai.com"}
        with patch.object(self.mod.socket, "getaddrinfo", return_value=[
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.2.3.4", 443))
        ]):
            ok, err = self.mod.validate_target_base_url("https://api.anthropic.com")
            self.assertFalse(ok)
            self.assertIn("allowlist", err)

            ok2, err2 = self.mod.validate_target_base_url("https://api.openai.com/v1")
            self.assertTrue(ok2, err2)

    def test_public_host_ok(self):
        with patch.object(self.mod.socket, "getaddrinfo", return_value=[
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.2.3.4", 443))
        ]):
            ok, err = self.mod.validate_target_base_url("https://api.openai.com/v1")
            self.assertTrue(ok, err)

    def test_resolve_target_url_appends_endpoint(self):
        with patch.object(self.mod.socket, "getaddrinfo", return_value=[
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.2.3.4", 443))
        ]):
            url, endpoint, err = self.mod.resolve_target_url(
                "/chat/completions",
                "https://api.openai.com/v1",
            )
            self.assertIsNone(err)
            self.assertEqual(endpoint, "/chat/completions")
            self.assertEqual(url, "https://api.openai.com/v1/chat/completions")


class ExtractNumberJsParityTests(unittest.TestCase):
    """Mirror frontend strict parse rules in Python for documentation/regression."""

    @staticmethod
    def extract_number(text, min_v=1, max_v=355):
        import re
        if text is None:
            return None
        s = str(text).strip()
        m = re.match(r'^[`"\'“”‘’]?(\d{1,3})[`"\'“”‘’]?(?:[.。!！?？])?$', s)
        if not m:
            return None
        num = int(m.group(1))
        if num < min_v or num > max_v:
            return None
        return num

    def test_accepts_pure_number(self):
        self.assertEqual(self.extract_number("27"), 27)
        self.assertEqual(self.extract_number(" 355 "), 355)
        self.assertEqual(self.extract_number("42。"), 42)

    def test_rejects_free_text(self):
        self.assertIsNone(self.extract_number("今天选 27 吧"))
        self.assertIsNone(self.extract_number("355 以内随便，比如 12"))
        self.assertIsNone(self.extract_number("seventy two"))


if __name__ == "__main__":
    unittest.main()
