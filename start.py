#!/usr/bin/env python3
"""
AI模型识别器后端代理服务器
解决浏览器 CORS 限制，代理所有 API 请求

v2.3 security notes:
- default bind 127.0.0.1
- SSRF protections for target base URL
- path/body size limits
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import os
import platform
import socket
import threading
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from urllib.parse import urlparse

import requests as req_lib

# ========================================
#  请求头伪装预设 (全小写 key，匹配真实 Node.js SDK)
# ========================================
_STAINLESS_OS = {
    'Darwin': 'MacOS', 'Linux': 'Linux', 'Windows': 'Windows'
}.get(platform.system(), f'Other:{platform.system()}')

_STAINLESS_ARCH = {
    'x86_64': 'x64', 'AMD64': 'x64', 'aarch64': 'arm64', 'arm64': 'arm64',
    'x86': 'x32', 'i386': 'x32', 'i686': 'x32',
}.get(platform.machine(), f'other:{platform.machine()}')

# Codex 安装 ID — 进程生命周期内固定
_CODEX_INSTALLATION_ID = str(uuid.uuid4())

HEADER_PRESETS = {
    'claude-code': {
        'accept': 'application/json',
        'accept-encoding': 'gzip, deflate, br',
        'connection': 'keep-alive',
        'user-agent': 'Anthropic/JS 0.109.0',
        'x-stainless-lang': 'js',
        'x-stainless-package-version': '0.109.0',
        'x-stainless-os': _STAINLESS_OS,
        'x-stainless-arch': _STAINLESS_ARCH,
        'x-stainless-runtime': 'node',
        'x-stainless-runtime-version': 'v22.13.1',
        'x-stainless-retry-count': '0',
    },
    'codex': {
        'accept': 'application/json',
        'accept-encoding': 'gzip, deflate, br',
        'connection': 'keep-alive',
        'user-agent': 'OpenAI/JS 6.45.0',
        'x-stainless-lang': 'js',
        'x-stainless-package-version': '6.45.0',
        'x-stainless-os': _STAINLESS_OS,
        'x-stainless-arch': _STAINLESS_ARCH,
        'x-stainless-runtime': 'node',
        'x-stainless-runtime-version': 'v22.13.1',
        'x-stainless-retry-count': '0',
        'openai-beta': 'responses_websockets=2026-02-06',
        'x-codex-installation-id': _CODEX_INSTALLATION_ID,
    },
}

# 默认浏览器伪装头
DEFAULT_BROWSER_HEADERS = {
    'accept': 'application/json, text/plain, */*',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'en-US,en;q=0.9',
    'connection': 'keep-alive',
    'user-agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
        '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    ),
}

ALLOWED_API_SUFFIXES = (
    '/chat/completions',
    '/messages',
    '/responses',
)

MAX_BODY_BYTES = 256 * 1024
DEFAULT_TIMEOUT = 60
VERSION = '2.3.0'

# 创建全局 Session，清除默认头，避免泄漏 python-requests 指纹
_session = req_lib.Session()
_session.headers.clear()

# Runtime config set in main()
CONFIG = {
    'allow_hosts': set(),  # empty = allow any public host
    'allow_any_public': True,
    'timeout': DEFAULT_TIMEOUT,
    'root_dir': os.path.dirname(os.path.abspath(__file__)),
}


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return any((
        ip.is_private,
        ip.is_loopback,
        ip.is_link_local,
        ip.is_multicast,
        ip.is_reserved,
        ip.is_unspecified,
    ))


def validate_target_base_url(base_url: str) -> tuple[bool, str]:
    """Validate X-Target-Base-URL against SSRF rules.

    Returns (ok, error_message).
    """
    if not base_url or not isinstance(base_url, str):
        return False, '缺少 X-Target-Base-URL'

    raw = base_url.strip()
    if any(ch.isspace() for ch in raw):
        return False, '目标 URL 含非法空白字符'

    parsed = urlparse(raw)
    if parsed.scheme not in ('http', 'https'):
        return False, '仅允许 http/https 目标'
    if not parsed.hostname:
        return False, '目标 URL 缺少 hostname'
    if parsed.username or parsed.password:
        return False, '目标 URL 不允许内嵌凭据'
    if parsed.query or parsed.fragment:
        return False, '目标 Base URL 不允许 query/fragment'

    host = parsed.hostname.lower().rstrip('.')
    if host in {'localhost', 'metadata', 'metadata.google.internal'}:
        return False, f'禁止访问主机: {host}'

    # Optional host allowlist (exact or suffix match for subdomains)
    allow_hosts = CONFIG.get('allow_hosts') or set()
    if allow_hosts:
        allowed = False
        for item in allow_hosts:
            item = item.lower().lstrip('.')
            if host == item or host.endswith('.' + item):
                allowed = True
                break
        if not allowed:
            return False, f'主机不在 allowlist: {host}'

    # Resolve and block private ranges (SSRF)
    try:
        infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == 'https' else 80), type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False, f'无法解析主机: {host}'

    if not infos:
        return False, f'无法解析主机: {host}'

    for info in infos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            return False, f'非法 IP: {ip_str}'
        if _is_blocked_ip(ip):
            return False, f'禁止访问非公网地址: {ip_str}'

    return True, ''


def resolve_target_url(path: str, base_url: str) -> tuple[str | None, str | None, str | None]:
    """Return (target_url, endpoint_name, error)."""
    path = path.split('?', 1)[0]
    endpoint = None
    for suffix in ALLOWED_API_SUFFIXES:
        if path.endswith(suffix) or suffix in path:
            endpoint = suffix
            break
    if not endpoint:
        return None, None, '不支持的 API 端点'

    ok, err = validate_target_base_url(base_url)
    if not ok:
        return None, None, err

    target_url = f"{base_url.rstrip('/')}{endpoint}"
    return target_url, endpoint, None


class ProxyHandler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def do_OPTIONS(self):
        """处理 CORS 预检请求"""
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        """处理 GET 请求 - 提供 HTML 文件和静态资源"""
        path = self.path.split('?', 1)[0]
        if path in ('/', '/index.html'):
            self.serve_html()
        elif path == '/health':
            self.send_json_response(200, {
                'ok': True,
                'version': VERSION,
                'allow_any_public': CONFIG.get('allow_any_public', True),
                'allow_hosts': sorted(CONFIG.get('allow_hosts') or []),
            })
        else:
            self.send_error(404, 'File not found')

    def do_POST(self):
        """处理 POST 请求 - 代理 API 调用"""
        path = self.path.split('?', 1)[0]
        if any(suffix in path for suffix in ALLOWED_API_SUFFIXES):
            self.proxy_api_request()
        else:
            self.send_error(404, 'Endpoint not found')

    def _html_path(self) -> str:
        return os.path.join(CONFIG['root_dir'], 'hlwy-ai-checker.html')

    def serve_html(self):
        """返回 HTML 文件"""
        try:
            with open(self._html_path(), 'r', encoding='utf-8') as f:
                content = f.read()

            body = content.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(body)
        except FileNotFoundError:
            self.send_error(404, 'hlwy-ai-checker.html not found')

    def proxy_api_request(self):
        """代理 API 请求到真实的 API 端点"""
        try:
            content_length = int(self.headers.get('Content-Length', 0) or 0)
            if content_length < 0:
                self.send_json_response(400, {'error': '非法 Content-Length'})
                return
            if content_length > MAX_BODY_BYTES:
                self.send_json_response(413, {'error': f'请求体过大（上限 {MAX_BODY_BYTES} bytes）'})
                return

            body = self.rfile.read(content_length) if content_length else b''

            if '/chat/completions' in self.path:
                default_base = 'https://api.openai.com/v1'
            elif '/responses' in self.path:
                default_base = 'https://api.openai.com/v1'
            elif '/messages' in self.path:
                default_base = 'https://api.anthropic.com/v1'
            else:
                self.send_json_response(400, {'error': '不支持的 API 端点'})
                return

            base_url = self.headers.get('X-Target-Base-URL', default_base)
            target_url, endpoint, err = resolve_target_url(self.path, base_url)
            if err or not target_url:
                self.send_json_response(400, {'error': f'目标校验失败: {err or "unknown"}'})
                return

            header_preset = self.headers.get('X-Header-Preset', 'default')
            if header_preset in HEADER_PRESETS:
                headers = dict(HEADER_PRESETS[header_preset])
                headers['x-request-id'] = f'req_{uuid.uuid4().hex}'
            else:
                headers = dict(DEFAULT_BROWSER_HEADERS)

            header_map = {
                'Content-Type': 'content-type',
                'Authorization': 'authorization',
                'anthropic-version': 'anthropic-version',
                'x-api-key': 'x-api-key',
            }
            for src_key, dst_key in header_map.items():
                val = self.headers.get(src_key)
                if val:
                    headers[dst_key] = val

            # 移除 accept-encoding 避免收到压缩响应后原样转发导致浏览器解析失败
            headers.pop('accept-encoding', None)

            try:
                resp = _session.post(
                    target_url,
                    data=body,
                    headers=headers,
                    timeout=CONFIG.get('timeout', DEFAULT_TIMEOUT),
                    allow_redirects=False,
                )

                payload = resp.content
                content_type = resp.headers.get('Content-Type') or 'application/json'
                self.send_response(resp.status_code)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(payload)))
                self.send_header('X-Proxy-Target', target_url)
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(payload)

            except req_lib.exceptions.ConnectionError as e:
                self.send_json_response(500, {'error': f'网络错误: {str(e)}'})
            except req_lib.exceptions.Timeout as e:
                self.send_json_response(504, {'error': f'请求超时: {str(e)}'})

        except Exception as e:
            self.send_json_response(500, {'error': f'服务器错误: {str(e)}'})

    def send_json_response(self, status_code, data):
        """发送 JSON 响应"""
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def send_cors_headers(self):
        """添加 CORS 头（本机工具默认仅本机访问）"""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header(
            'Access-Control-Allow-Headers',
            'Content-Type, Authorization, anthropic-version, x-api-key, X-Target-Base-URL, X-Header-Preset',
        )

    def log_message(self, format, *args):
        """自定义日志格式"""
        print(f'[{self.log_date_time_string()}] {format % args}')


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description='hlwy-ai-checker local proxy')
    parser.add_argument('--host', default='127.0.0.1', help='bind host (default 127.0.0.1)')
    parser.add_argument('--port', type=int, default=8000, help='bind port (default 8000)')
    parser.add_argument(
        '--allow-host',
        action='append',
        default=[],
        dest='allow_hosts',
        help='optional allowlisted target host (repeatable). If set, only these hosts are allowed.',
    )
    parser.add_argument('--timeout', type=int, default=DEFAULT_TIMEOUT, help='upstream timeout seconds')
    parser.add_argument('--no-open', action='store_true', help='do not open browser')
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)

    root_dir = os.path.dirname(os.path.abspath(__file__))
    html_path = os.path.join(root_dir, 'hlwy-ai-checker.html')
    if not os.path.exists(html_path):
        print('错误: 找不到 hlwy-ai-checker.html 文件')
        print(f'期望路径: {html_path}')
        return 1

    CONFIG['root_dir'] = root_dir
    CONFIG['timeout'] = max(5, int(args.timeout))
    CONFIG['allow_hosts'] = {h.strip().lower() for h in args.allow_hosts if h and h.strip()}
    CONFIG['allow_any_public'] = not CONFIG['allow_hosts']

    host = args.host
    port = args.port

    server = ThreadingHTTPServer((host, port), ProxyHandler)
    url = f'http://{host}:{port}'
    allow_desc = 'any public host' if CONFIG['allow_any_public'] else ', '.join(sorted(CONFIG['allow_hosts']))
    print(f"""
╔════════════════════════════════════════════════════════╗
║      hlwy-ai-checker v{VERSION} - AI模型识别器              ║
╚════════════════════════════════════════════════════════╝
本项目 github: https://github.com/hanlinwenyuan/hlwy-ai-checker
fork 改进版:   https://github.com/Yat-mo/hlwy-ai-checker

🌐 前端访问地址: {url}
🔒 bind: {host}:{port}
🛡️  target hosts: {allow_desc}
⏱  timeout: {CONFIG['timeout']}s

按 Ctrl+C 停止
""")

    if not args.no_open:
        threading.Timer(0.5, webbrowser.open, args=[url]).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n\n已停止')
        server.shutdown()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
