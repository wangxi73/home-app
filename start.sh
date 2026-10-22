#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f "./home_bridge" ] || [ "./home_bridge.swift" -nt "./home_bridge" ]; then
  echo "🔨 编译 macOS Home.app 无障碍桥接程序 home_bridge..."
  swiftc -O ./home_bridge.swift -o ./home_bridge
fi

PORT="${PORT:-8765}"
echo "🚀 启动丰和园 3D 全屋智能控制中心: http://127.0.0.1:${PORT}"
exec python3 ./server.py
