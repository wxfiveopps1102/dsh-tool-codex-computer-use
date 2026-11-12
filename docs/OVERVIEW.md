# 插件概览

## 1. 一句话介绍

`dsh-tool-codex-computer-use` 为需要桌面自动化或文本委派的 DSH 用户提供本机 Codex CLI 工具。

## 2. 解决什么问题

本插件直接调用使用者指定的 Codex CLI，提供 `desktop`（computer use）和 `text`（纯文本委派）两种模式，支持指定模型与 CLI 入口。

### 与官方 subagent provider 的区别

- 官方 `@deepseek-ai/dsh-subagent-codex` 是 **subagent provider**，注册到 `ctx.subagents`，通过 Codex app-server 运行，内置依赖钉在 `@openai/codex@0.153.4`。
- 本插件是 **Host 工具**，注册到 `ctx.tools`，直接调用使用者指定的 Codex CLI，入口路径可通过 `codexBin` 配置，因此可使用较新的 CLI 及其可用模型。
- 两者**互不依赖、可同时安装**。需要子代理树或会话记录时用官方 provider；需要指定模型、指定 CLI，或一次性纯文本委派时用本工具。`mode=text` 适合只需返回文本的独立任务，省略桌面/截图指令及截图目录创建，不续接会话，也不改变 `securityMode` 或禁用 Codex 插件。

已在 Codex CLI 0.167.2 + DSH 0.2.2-rc.2 上验证。此处沿用既有验证记录，本次文档更新未重跑。

## 3. 快速上手

安装入口为 `dsh plugin --profile desktop add dsh-tool-codex-computer-use`；这是发布后待验证步骤，当前仅有本地链接记录。预先登录 Codex；桌面模式需插件及 macOS 辅助功能、屏幕录制权限。

在插件配置中设置 `codexBin` 为实际 CLI 文件路径，按可用目录选择 `model`、`reasoningEffort`、`serviceTier`；示例见[中文 README](../README.zh.md)。`mode` 仅在调用时设置，默认 `desktop`。

先向 `computer_use_codex_status` 传 `{}` 检查环境，再向 `computer_use_codex` 传：

```json
{"task":"用一句话解释 7×8","mode":"text"}
```

## 4. 框架

bundle patch 插入插件；`apply` 注入 `tools`，注册两个工具，由 effect 托管注销。任务经校验、解析入口、版本探测，再 spawn `codex exec`，读取最终消息并返回。

入口按 config → 环境变量 → PATH → profile；模型三项按调用参数 → config → 环境变量 → Codex 配置。返回含 `ok`、退出码、模式、版本、告警、耗时、覆盖来源、安全提示、至多 8000 字符输出及可用日志路径；体检直接返回模型、版本、认证与套餐信息。

初始参数校验抛错；入口、启动或超时错误返回失败及 -1，非零退出保留退出码。最终消息缺失回退日志尾部；体检来源失败仅告警，入口失败仍抛错。详见[架构说明](ARCHITECTURE.md)。

## 5. 能力边界

不处理退出弹窗等应用侧状态，不做多轮追问，不替代 DSH 子代理树。`ok:true` 仅表示正常退出，GUI 成功以截图为准；截图生成不保证。文本模式不禁用插件，默认 `bypass` 仍关闭审批和沙箱；超时不能撤销操作。

## 6. 验收现状

据 [RELEASE](../RELEASE.md)：smoke PASS；`dsh-standards` blocking 0、2 条 advisory WARN，另有 7 项 partial。真实 GUI（3×9=27）与文本委派各有一次成功记录。本轮仅只读审查，未重跑；缺独立检查报告及完整原始调用。

## 7. 未完善清单

版本核对：`package.json` 与 RELEASE 均为 0.1.0。以下保留 12 项跟踪记录，其中 profile 兜底已修复，发布身份与包元数据已补齐，其余 9 项待完善；严重度按发布与运行影响评估。

| 项 | 严重度 | 说明 |
| --- | --- | --- |
| 发布身份 | 已补齐 | 作者与 LICENSE 版权人为 `wx5`；GitHub owner/repo 为 `wxfiveopps1102/dsh-tool-codex-computer-use`。身份已确定，不代表已经发布。 |
| profile 兜底 | 已修复 | `index.js` 已移除硬编码路径；未显式配置且 PATH 无入口时，仅按 `DSH_PROFILE_DIR` 推导兜底入口。 |
| 取消与超时 | 高 | 未接 Host 取消信号；smoke 有真实 30 秒超时，但未断言后代清理，脱组进程可能继续。 |
| 包元数据 | 已补齐 | `author` 为 `wx5`，`repository`、`homepage`、`bugs` 已使用 `https://github.com/wxfiveopps1102/dsh-tool-codex-computer-use` 对应地址。 |
| GUI 回归 | 中 | 只有假 CLI 自动测试；缺真实 GUI 自动回归及保守模式验证。 |
| 安装验收 | 中 | 未验证干净 profile 的 `dsh plugin add`、运行时加载与 enabled 状态。 |
| CLI 兼容 | 中 | 无最低版本门槛，仅在线比对最新版；离线或查询失败不提示升级、不阻断。离线模型走 `--bundled`，版本比较字段为 null。 |
| 验收证据 | 中 | 缺独立 PASS/标准报告；WARN 未确认接受，partial 未完成。 |
| 文档同步 | 低 | 双语核心说明一致；README 保留 7×8 旧证据，RELEASE 另载 3×9；新概览仅中文。 |
| 示例可复制性 | 低 | 文本 JSON 可用；`/path/to/workspace` 需替换，安装与升级示例缺无 node 的完整路径。 |
| 文档分发 | 低 | 已核对 `package.json.files`，仍未包含 `RELEASE.md` 与 `docs/OVERVIEW.md`，保留为待完善项；新增的 `docs/PUBLISHING.md` 也未纳入白名单。 |
| 安全说明 | 低 | bypass 提示充分；已有 npm 查询、在线模型刷新及离线开关说明，未明确关联 `network:egress`。关闭检查不限制任务联网。 |
