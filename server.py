#!/usr/bin/env python3
"""
丰和园 3D 全屋智能控制中心 · 本地 Home.app 桥接服务
启动方式: python3 server.py (默认监听 http://127.0.0.1:8765)
"""

import json
import os
import subprocess
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG_FILE = ROOT / "config.json"
CONFIG = json.loads(CONFIG_FILE.read_text(encoding="utf-8")) if CONFIG_FILE.exists() else {}
BRIDGE_SRC = ROOT / CONFIG.get("bridge", {}).get("source", "home_bridge.swift")
BRIDGE_BIN = ROOT / CONFIG.get("bridge", {}).get("binary", "home_bridge")
HOST = os.environ.get("HOST", CONFIG.get("server", {}).get("host", "127.0.0.1"))
PORT = int(os.environ.get("PORT", str(CONFIG.get("server", {}).get("port", 8765))))


def ensure_bridge_compiled():
    if not BRIDGE_BIN.exists() and BRIDGE_SRC.exists():
        subprocess.run(["swiftc", "-O", str(BRIDGE_SRC), "-o", str(BRIDGE_BIN)], cwd=str(ROOT), check=False)


def run_bridge(args):
    try:
        ensure_bridge_compiled()
        res = subprocess.run(
            [str(BRIDGE_BIN)] + args,
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=12,
        )
        out = res.stdout.strip()
        return json.loads(out) if out else {"ok": False, "error": "empty output"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


class SmartHomeHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        super().end_headers()

    def _send_json(self, data, status=200):
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path.startswith("/api/config"):
            return self._send_json(CONFIG)
        if self.path.startswith("/api/status"):
            data = run_bridge(["status"])
            # 提取实时传感器数据
            sensors = {}
            room_map = {"客厅": "living", "儿童房": "kid", "书房": "study", "主卧": "master", "卫生间": "bath", "厨房": "kitchen"}
            for item in data.get("devices", []):
                rm = room_map.get(item.get("room"), "")
                if not rm:
                    continue
                sensors.setdefault(rm, {})
                nm = item.get("name", "")
                st = item.get("statusText", "")
                if nm == "Temperature":
                    sensors[rm]["temp"] = st + ("C" if st.endswith("°") else "")
                elif nm == "Humidity":
                    sensors[rm]["humidity"] = st
                elif nm == "Light":
                    sensors[rm]["lux"] = st.replace("lux", "lx")
                elif nm == "Air Quality":
                    sensors[rm]["air"] = st
            data["sensors"] = sensors
            return self._send_json(data)
        return super().do_GET()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length).decode("utf-8") or "{}") if length > 0 else {}

        if self.path == "/api/toggle":
            room = body.get("room", "")
            name = body.get("name", "")
            res = run_bridge(["toggle", room, name])
            return self._send_json(res)

        if self.path == "/api/scene":
            scene = body.get("scene", "")
            res = run_bridge(["scene", scene])
            return self._send_json(res)

        return self._send_json({"ok": False, "error": "Unknown endpoint"}, status=404)


if __name__ == "__main__":
    print(f"🏠 丰和园 3D 全屋智能控制中心已启动: http://127.0.0.1:{PORT}")
    server = ThreadingHTTPServer((HOST, PORT), SmartHomeHandler)
    server.serve_forever()
