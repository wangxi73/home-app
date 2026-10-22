# 丰和园 · 3D 全屋智能控制中心 (Home.app 联动)

基于 `wy51ai/floorplan-3d` 渲染底座二次开发，结合「丰和园」1:1 CAD 毫米级户型图与 macOS `Home.app` 原生无障碍 (`AXUIElement`) 接口，实现 2D/3D 户型可视化与全屋智能设备双向控制。

## 目录结构与项目配置

- `config.json`：项目级配置文件（家庭名称、监听端口、桥接房间列表、默认视图与控制模式）
- `fengheyuan-data.js`：丰和园 1:1 毫米级墙体/门窗/房间多边形数据、默认家具布局及 27 路 `Home.app` 配件空间坐标映射
- `smart-home.js` / `smart-home.css`：3D 独立点光源系统、悬浮温湿度传感器胶囊、3D 配件交互气泡与右侧 HomeKit 控制面板
- `home_bridge.swift`：macOS `ApplicationServices` (`AXUIElement`) 原生桥接器，支持读取状态、触发配件开关与执行场景
- `server.py` / `start.sh`：本地无缓存静态托管与 `/api/status`、`/api/toggle`、`/api/scene`、`/api/config` 接口服务

## 快速启动

```bash
./start.sh
# 或直接运行（首次运行会自动编译 home_bridge.swift）：
python3 server.py
```

浏览器打开：`http://127.0.0.1:8765`
