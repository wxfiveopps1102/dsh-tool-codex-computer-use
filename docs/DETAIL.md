# dsh-tool-codex-computer-use

将一次性桌面或文本任务交给本机 Codex CLI 的 DSH Host 工具，另提供环境体检工具，不是 subagent provider。[English](../README.md)。

通过 DSH profile 的 npm/包安装流程安装本包并加载 `cordis.patch.yml`。要求 Node >=20，无运行时依赖；正常 profile 安装本轮未验证。预先登录 Codex；桌面任务另需启用 computer-use/browser 插件；在 macOS 上须向相关 Codex/宿主应用授予**辅助功能、屏幕录制**权限。

调用 `computer_use_codex`：`{"task":"计算 7×8 并截图验证","cwd":"/path/to/workspace","timeoutSeconds":600}`。工作目录须存在；每次独立调用，**不可追问、不可续接会话**。

## 支持平台

`mode=text` 支持 macOS、Windows、Linux，前提是本机可运行 Codex CLI。`mode=desktop` 已在 macOS 验证；Windows 桌面操作尚未实测，需自行确认 Windows 环境中 computer-use 插件的可用性；不保证 Linux 桌面支持。

## 执行模式

调用参数 `mode` 仅接受 `desktop`（默认）或 `text`，返回结果也含 `mode`。`desktop` 创建截图目录并附加桌面操作、截图验证指令；`text` 用于不操作桌面的纯文本任务，不创建截图目录、不附加桌面或截图指令。例如：`{"task":"用一句话解释 7×8 的含义","mode":"text"}`。

`mode` 没有 config 或环境变量默认值，与 `securityMode` 独立。两种模式共用入口解析、版本探测、覆盖参数、日志、超时及输出处理；文本模式不禁用 Codex 插件，也不构成桌面权限隔离。完整调用参数表见 [中文 README](../README.zh.md#调用参数)。

`desktop` 提示词读取模块级 `PLATFORM = process.platform`，通过 `platformLabel(p)` 将 `darwin`、`win32`、`linux` 分别映射为 `macOS`、`Windows`、`Linux`；`text` 提示词保持原样。任务子进程在 Windows 上使用 `detached: false`，其他平台使用 `detached: true`。

## 选择模型 / 推理档位 / 服务层

支持调用参数 `model`、`reasoningEffort`、`serviceTier`，配置级默认值 `config.model`、`config.reasoningEffort`、`config.serviceTier`，以及下表中的对应环境变量。每个字段独立按三级覆盖优先级解析：**调用参数 > config > 环境变量**；三级均未设置时，继承 Codex 本地配置（`~/.codex/config.toml`）。仅省略调用参数，仍会使用 config 或环境变量中的默认值。

可用模型随套餐与 CLI 版本变化，应以 `computer_use_codex_status` 的 `models` 结合 `planType` 判断，不把历史列表当作固定支持清单。本机快照共 10 个模型，包含 `gpt-6.1-sol`、`gpt-6-astra`；其中 `gpt-6.1-sol` 支持 `low` / `medium` / `high` / `xhigh` / `max` / `ultra`。Fast 服务层 ID 为 `priority`，需核对具体模型的 `serviceTiers`。例如可将配置默认值设为 `model: gpt-6-astra`、`reasoningEffort: high`、`serviceTier: priority`，完整 `cordis.patch.yml` 示例见 [中文 README](../README.zh.md#选择模型--推理档位--服务层)。

解析后的覆盖分别翻译为 `-m <model>`、`-c model_reasoning_effort="…"`、`-c service_tier="…"`，不会修改 Codex 本地配置。插件先校验生效值的字符串格式，支持的模型、档位与服务层由 Codex 校验；不支持的值会显式失败，不会被静默丢弃。

返回的 `controls` 是以空格分隔的字符串，说明生效的覆盖值及来源：调用参数不带后缀（如 `reasoningEffort=low`），配置标为 `(config)`（如 `reasoningEffort=high(config)`），环境变量标为 `(environment)`（如 `reasoningEffort=low(environment)`）。上述三个配置默认值在没有调用参数覆盖时返回：

```text
model=gpt-6-astra(config) reasoningEffort=high(config) serviceTier=priority(config)
```

未列出的字段继承 Codex 本地配置；三个字段均无覆盖时，整个字符串为 `inherited from Codex config`，不会展开继承到的具体值。

## 环境体检

`computer_use_codex_status` 无参数，以 `{}` 调用；经 `resolveCodexBin` 解析入口后调用 `inspectEnvironment`，直接返回环境 JSON，不包含任务结果的 `ok`/`output` 包装。它不运行桌面任务或创建截图目录，先读取以下三条来源，再补入在线版本比对结果：

| 来源 | 返回字段与处理 |
| --- | --- |
| `codex debug models` | `models` 对象数组；每项含 `slug`、`displayName`、`efforts`、`serviceTiers`，分别表示模型 ID、显示名、推理档位、服务层 ID。默认空数组。 |
| `codex doctor --json` | `codexVersion`、`desktopAppVersion`、`authMode`，分别表示 CLI 版本、桌面应用版本、已保存认证方式；无法取得时为 `unknown`。 |
| `$CODEX_HOME/auth.json`，默认 `~/.codex/auth.json` | 本地解码 `tokens.id_token` 的 JWT payload，从 `https://api.openai.com/auth` 下读取 `chatgpt_plan_type` → `planType`、`chatgpt_subscription_active_until` → `subscriptionActiveUntil`；缺失时为 `null`。 |

`codex debug models` 默认在线刷新，失败时回退 `codex debug models --bundled` 并追加 warning；两次均失败时保留 `models: []` 并告警。关闭在线检查时直接使用 `--bundled`，成功时也会提示使用离线目录。`warnings` 为非阻断告警数组，无告警时为 `[]`。三条来源依次读取，各自失败保留其他来源结果；CLI 入口解析失败发生在体检前，会直接报错。每次 CLI 子命令调用（含回退）限时 15 秒。三条来源的结果（包括 warning）在当前进程内按 `codexBin` 路径与在线检查开关缓存 5 分钟，并共享进行中的请求；每次返回结果副本。该缓存与执行任务时的 `--version` 进程级缓存相互独立。

在线版本比对通过 `fetch('https://registry.npmjs.org/@openai/codex/latest')` 访问 `registry.npmjs.org`，读取最新版并与本地 CLI 版本比较，不使用固定阈值。请求限时 6 秒，成功及失败结果均在当前进程内缓存 6 小时，并共享进行中的请求；任务前置体检与状态工具共用此缓存。状态工具每次返回时（含命中 5 分钟缓存）补入 `latestCodexVersion`（`string` 或 `null`）及 `upToDate`（`boolean` 或 `null`）：本地版本不低于 npm 最新时为 `true`，低于时为 `false`，无法比较时为 `null`。npm 查询失败时 `latestCodexVersion` 为 `null`，不产生升级告警，也不阻断调用。本地版本较旧时，warning 例如：`旧 CLI（0.153.4），npm 最新 0.167.2，建议升级。`

在线检查默认开启；config `onlineCheck: false` 或环境变量 `DSH_CODEX_OFFLINE=1` 任一成立即可关闭。关闭后在线检查不发任何网络请求，模型直接使用离线目录，`latestCodexVersion` 和 `upToDate` 均为 `null`，即使已有在线查询缓存也不返回其版本。这是体检开关，不限制委派任务自身联网。

隐私：插件只读本地 JWT 声明，不修改认证文件、不输出或外发 token，不把 token 或完整 payload 传给子进程；warning 不含解析错误原文、命令输出或凭据。提取的套餐和到期字段会随体检 JSON 返回调用方。该步骤仅解码声明，不验证签名、不联网查询套餐权益；不代表整个 Codex CLI 离线。`planType` 用于辅助判断可用模型，应结合 `models`，不能单凭套餐名保证模型可调用。

任务提供的本机实测（本轮未重跑）：`codexVersion: "0.167.2"`、`latestCodexVersion: "0.167.2"`、`upToDate: true`、`desktopAppVersion: "26.1106.51428"`、`authMode: "chatgpt"`、`planType: "prolite"`、`subscriptionActiveUntil: "2026-12-04T12:17:59+00:00"`，共 10 个模型，`warnings: []`。这些是本机快照，不是固定默认值。

## 配置与风险

`apply(ctx, config)` 显式配置通常优先于环境变量；在线检查例外，`onlineCheck: false` 或 `DSH_CODEX_OFFLINE=1` 任一成立均关闭检查。环境变量须传入 Host 进程，仅设置 shell 工具环境可能无效。

| 配置 | 环境变量 | 默认值 |
| --- | --- | --- |
| `codexBin` | `DSH_CODEX_BIN` | PATH 可执行 `codex`，然后 `$DSH_PROFILE_DIR/node_modules/@openai/codex/bin/codex.js` |
| `onlineCheck` | `DSH_CODEX_OFFLINE` | 默认开启；config 为 `false` 或环境变量为 `1` 时关闭 |
| `securityMode` | `DSH_CODEX_SECURITY_MODE` | `bypass` |
| `timeoutSeconds` | `DSH_CODEX_TIMEOUT_SECONDS` | `600`，整数 30–3600 |
| `terminateGraceMs` | `DSH_CODEX_TERMINATE_GRACE_MS` | `5000` 毫秒，整数 0–30000；`0` 跳过优雅终止 |
| `screenshotDir` | `DSH_CODEX_SCREENSHOT_DIR` | `<cwd>/.codex-cu/` |
| `model` | `DSH_CODEX_MODEL` | 继承 Codex 本地配置 |
| `reasoningEffort` | `DSH_CODEX_REASONING_EFFORT` | 继承 Codex 本地配置 |
| `serviceTier` | `DSH_CODEX_SERVICE_TIER` | 继承 Codex 本地配置 |

入口顺序为配置 → 环境变量 → PATH → profile 推导。显式入口必须为文件路径；无效时直接返回可读 `ok:false`，不偷偷回退。`.js` 入口用 `DSH_NODE_EXECUTABLE` 或当前运行时执行，并设置 `ELECTRON_RUN_AS_NODE=1`。相对截图目录基于 `cwd`。

**前置体检**：解析 CLI 入口后，插件通过 `codex --version` 探测版本，并在当前进程内按 `codexBin` 路径缓存结果（包括失败结果）；随后按在线检查开关调用共享版本比对逻辑，本地版本低于 npm 最新时建议升级。任务结果返回 `codexVersion` 和 `warnings`；`latestCodexVersion` / `upToDate` 仅由状态工具返回，其本地版本来自 doctor。升级告警不代表指定模型一定不可用。本地探测失败时版本为 `unknown`，仅写入告警并继续执行。升级命令示例：`npm install --prefix ~/.dsh/profiles/desktop @openai/codex@0.167.2`（仅示例，不自动执行；升级同一路径的 CLI 后需重启加载插件的进程以刷新缓存）。应升级入口解析实际选中的安装；显式路径或 PATH 可能优先于 profile 安装，按实际 profile 调整路径。重启后再调用 `computer_use_codex_status` 核对。

`bypass` 使用 `--dangerously-bypass-approvals-and-sandbox`，关闭审批和 CLI 沙箱，可直接操作本机桌面及文件；为兼容现有 GUI 行为保留为默认。`workspace-write` 改传 `--sandbox workspace-write`，不传 bypass，GUI 操作可能失败。输出 `securityMode`、`securityNotice` 说明请求模式与风险；文件沙箱不保证约束外部 GUI 插件，也不能撤销桌面操作。

不导出 schemastery `Config`，也不 import 任何 `@deepseek-ai/*`：本包以 `link:` 安装在工作区之外，bare specifier 从该真实路径解析不到（首次安装正是因此失败，见历史）。工具定义在包内自行构造，配置只走 `apply(ctx, config)` 与环境变量，当前 profile 已在用。

## 返回与真实证据

`computer_use_codex` 返回 `ok`、`exitCode`、`mode`、`codexVersion`、`warnings`、`durationMs`、`output`、`securityMode`/`securityNotice`、`controls`（生效的覆盖值及来源），日志创建成功时附 `logPath`。**`ok:true` 仅表示 CLI 正常退出，不等于任务目标达成**；桌面任务结合截图复核，文本任务核对返回文本。输出最多 8000 个 JavaScript 字符；两种模式的完整日志均保存在私有临时目录，最终消息文件自动删除。日志和截图可能包含敏感信息，需要手动清理。桌面模式截图默认保留 `<cwd>/.codex-cu/`，也可配置；提示词不保证截图生成。文本模式不创建该目录。

任务提供的本机文本模式实测（本轮未重跑）：`ok: true`、`durationMs: 34776`、`codexVersion: "0.167.2"`，`controls: "model=gpt-6.1-sol(config) reasoningEffort=high(config) serviceTier=priority(config)"`。

已核实的历史实测（任务提供，本轮未重跑）：`{"ok":true,"exitCode":0,"durationMs":47537,...}`。截图 `<workspace>/.codex-cu/calculator-7x8-56.png` 证明计算器 `7×8=56`；历史 `.png` 实为 JPEG，本次未改名，后续提示要求 `.jpg`。证据不随 npm 包分发。

## 已知限制

任务超时后，采用 TERM → 宽限期 → KILL：先请求优雅终止，等待最多 `terminateGraceMs`，仍未退出时再升级为强制终止，为 Codex 清理 computer-use 会话留出时间，减少会话残留。`terminateGraceMs` 仅为插件配置，不是调用参数；config 优先于环境变量 `DSH_CODEX_TERMINATE_GRACE_MS`，默认 `5000` 毫秒，须为 0–30000 的整数。设为 `0` 时跳过 TERM 和宽限期，直接 KILL。

Windows 先通过 spawn 执行 `taskkill /pid PID /T`，强制终止时执行 `taskkill /pid PID /T /F`；POSIX 平台以子进程的负 PID 向进程组先发送 SIGTERM，再发送 SIGKILL。进程树／进程组终止失败时，回退 `child.kill(signal)`，使用该阶段对应的信号。目标树或组之外的后代可能继续运行，已发生的桌面修改无法撤销。暂不接入 `execute` 的 `exec` 取消信号：Host 契约未确认，先保留已验证的有界超时，取消集成为后续项。

macOS 上仍残留的虚拟鼠标或共享指示器属于 ChatGPT/Codex 桌面端状态问题，任务进程退出后也可能继续显示。可手动运行以下命令清理：

```sh
pkill -f SkyComputerUseClient; killall SkyComputerUseService 2>/dev/null
```

**此命令会影响正在进行的 Codex computer-use 会话，请谨慎使用。** 插件不会自动执行该命令。

## 自测与发布

在包目录执行：

```sh
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" test/smoke.mjs
```

仅运行假 CLI，包含三类真实 30 秒任务超时：收到 TERM 后自行退出（约 30 秒）、忽略 TERM 后等待 1000 毫秒宽限期再升级 KILL（约 31 秒）、0 宽限期直接 KILL（约 30 秒）；不操作桌面。未验证真实保守模式 GUI、profile 安装、npm 发布。

同意独立 unscoped npm 包与仓库 `dsh-plugin` topic：Host 工具与文本委派 provider 职责不同，不向现有 provider 强塞桌面能力；维护、安全审查由发布者承担。

作者及 MIT 版权人已填写为 `wx5`，GitHub owner 为 `wxfiveopps1102`，仓库名为 `dsh-tool-codex-computer-use`，author/repository 元数据已填写，仓库地址为 `https://github.com/wxfiveopps1102/dsh-tool-codex-computer-use`。发布前仍须确认 npm 包名可用和发布权限；身份信息补齐不代表已经发布。许可证 MIT。

## 按次覆盖的实测（2026-11-12，本机，同一冷启动任务）

同一任务（打开计算器 → 23×17 → 截图 → 报告），仅改 `reasoningEffort`，每次先退出计算器保证冷启动：

| `reasoningEffort` | 结果 | `durationMs` | 说明 |
| --- | --- | --- | --- |
| `low` | 正确 391 | 42063 | 与上一轮热启动 56231 对照，热/冷状态差异远大于档位差异 |
| `high` | 正确 391 | 37244 | 简单任务上档位差约 11%，接近噪声 |

结论：简单的一步式 GUI 任务，档位主要影响 token 成本而非时延；时延由 Codex 进程启动、模型步数与 GUI 等待主导。复杂多步任务才有明显差距。
