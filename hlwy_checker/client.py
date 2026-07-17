"""Direct API client for headless checker (no local proxy required)."""

from __future__ import annotations

import time
from typing import Any

import requests

from .protocol import Probe, extract_number

DEFAULT_TIMEOUT = 60


class APIError(RuntimeError):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def _headers_for(
    api_type: str,
    api_key: str,
    header_preset: str = "default",
) -> dict[str, str]:
    if api_type == "anthropic":
        headers = {
            "content-type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "accept": "application/json",
        }
    else:
        headers = {
            "content-type": "application/json",
            "authorization": f"Bearer {api_key}",
            "accept": "application/json",
        }
    # Light spoofing presets for headless use
    if header_preset == "claude-code":
        headers["user-agent"] = "Anthropic/JS 0.109.0"
    elif header_preset == "codex":
        headers["user-agent"] = "OpenAI/JS 6.45.0"
    else:
        headers["user-agent"] = "hlwy-ai-checker-cli/2.4"
    return headers


def call_model_text(
    *,
    api_type: str,
    base_url: str,
    api_key: str,
    model: str,
    probe: Probe,
    header_preset: str = "default",
    timeout: int = DEFAULT_TIMEOUT,
    session: requests.Session | None = None,
) -> str:
    sess = session or requests.Session()
    base = base_url.rstrip("/")
    headers = _headers_for(api_type, api_key, header_preset)

    if api_type == "openai":
        url = f"{base}/chat/completions"
        body: dict[str, Any] = {
            "model": model,
            "messages": [{"role": "user", "content": probe.prompt}],
            "temperature": probe.temperature,
            "max_tokens": probe.max_tokens,
        }
        resp = sess.post(url, json=body, headers=headers, timeout=timeout)
        if not resp.ok:
            raise APIError(f"API错误: {resp.status_code} - {resp.text[:500]}", resp.status_code)
        data = resp.json()
        content = ((data.get("choices") or [{}])[0].get("message") or {}).get("content")
        if content is None:
            raise APIError("OpenAI 返回缺少 choices[0].message.content")
        return str(content).strip()

    if api_type == "openai-responses":
        url = f"{base}/responses"
        body = {
            "model": model,
            "input": [{"role": "user", "content": probe.prompt}],
            "temperature": probe.temperature,
            "max_output_tokens": probe.max_tokens,
        }
        resp = sess.post(url, json=body, headers=headers, timeout=timeout)
        if not resp.ok:
            raise APIError(f"API错误: {resp.status_code} - {resp.text[:500]}", resp.status_code)
        data = resp.json()
        if isinstance(data.get("output_text"), str) and data["output_text"].strip():
            return data["output_text"].strip()
        for item in data.get("output") or []:
            if item.get("type") == "message":
                for block in item.get("content") or []:
                    if block.get("type") in ("output_text", "text"):
                        text = block.get("text") or block.get("content")
                        if text is not None:
                            return str(text).strip()
        raise APIError("Responses API 返回数据中未找到文本内容")

    if api_type == "anthropic":
        url = f"{base}/messages"
        body = {
            "model": model,
            "max_tokens": probe.max_tokens,
            "messages": [{"role": "user", "content": probe.prompt}],
            "temperature": probe.temperature,
        }
        resp = sess.post(url, json=body, headers=headers, timeout=timeout)
        if not resp.ok:
            raise APIError(f"API错误: {resp.status_code} - {resp.text[:500]}", resp.status_code)
        data = resp.json()
        content = (data.get("content") or [{}])[0].get("text")
        if content is None:
            raise APIError("Anthropic 返回缺少 content[0].text")
        return str(content).strip()

    raise ValueError(f"unsupported api_type: {api_type}")


def get_probe_sample(
    *,
    api_type: str,
    base_url: str,
    api_key: str,
    model: str,
    probe: Probe,
    header_preset: str = "default",
    timeout: int = DEFAULT_TIMEOUT,
    max_attempts: int = 3,
    session: requests.Session | None = None,
) -> dict[str, Any]:
    last_err: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            text = call_model_text(
                api_type=api_type,
                base_url=base_url,
                api_key=api_key,
                model=model,
                probe=probe,
                header_preset=header_preset,
                timeout=timeout,
                session=session,
            )
            num = extract_number(text, probe.min, probe.max)
            if num is None:
                return {
                    "ok": False,
                    "kind": "parse",
                    "text": text,
                    "error": f"无法严格解析为 {probe.min}-{probe.max} 的纯数字: {text[:120]!r}",
                }
            return {"ok": True, "kind": "ok", "value": num, "text": text}
        except Exception as e:  # noqa: BLE001 - surface transport failures cleanly
            last_err = e
            status = getattr(e, "status", None)
            msg = str(e)
            retriable = (
                status in (429, 500, 502, 503, 504)
                or "timeout" in msg.lower()
                or "timed out" in msg.lower()
                or "connection" in msg.lower()
            )
            if not retriable or attempt == max_attempts:
                return {"ok": False, "kind": "transport", "error": str(e)}
            time.sleep(0.3 * attempt * attempt)
    return {"ok": False, "kind": "transport", "error": str(last_err or "unknown")}
