# 项目级规范与架构配置 (fengheyuan-smart-home-3d)

## 1. 全局执行规范：分步思考与分步完成 (Step-by-Step Execution)

为避免单次思考或单次工具调用生成时间超过流式连接阈值而触发断流重连，所有任务必须遵循**分步思考、增量落盘**原则：
- **拆分任务、小步快跑**：单步思考控制在 60 秒以内，每完成一个小推理或小动作立即发起工具调用落盘。
- **禁止单次超大输出**：单次 `exec_command` 或 `apply_patch` 切勿一次性生成超过 150–200 行代码。
- **调研与验证分阶段推进**：每次聚焦 1–2 个明确目标。

## 2. 项目模块与配置约定

- **配置中心**：`/Users/xiwang/Documents/ChatGPT/home app/config.json` 定义家庭名称（`丰和园`）、服务监听地址（`127.0.0.1:8765`）及桥接房间列表。
- **户型与设备数据**：`/Users/xiwang/Documents/ChatGPT/home app/fengheyuan-data.js` 存储 1:1 CAD 毫米级墙体/门窗/房间坐标及 `Home.app` 配件映射。
- **3D 智控层**：`/Users/xiwang/Documents/ChatGPT/home app/smart-home.js` 与 `/Users/xiwang/Documents/ChatGPT/home app/smart-home.css` 负责独立 `PointLight`、3D 悬浮传感器胶囊、配件气泡与右侧控制面板。
- **macOS Home.app 桥接**：`/Users/xiwang/Documents/ChatGPT/home app/home_bridge.swift` 通过 `ApplicationServices` (`AXUIElement`) 读写 `Home.app`；`/Users/xiwang/Documents/ChatGPT/home app/server.py` 首次调用时若未发现二进制 `home_bridge` 会自动调用 `swiftc -O` 编译。
- **启动方式**：执行 `./start.sh` 或 `python3 server.py`。
