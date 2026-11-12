# dsh-tool-codex-computer-use

将一次性桌面或文本任务交给本机 Codex CLI 的 DSH Host 工具，不是 subagent provider。[English](README.md)。

![亚马逊收纳用品排行榜](docs/assets/amazon-ranking.jpg)

## 定位与取舍

这个工具在 DSH 内把一次性任务交给本机 Codex CLI，支持 `mode=desktop`（桌面操作）与 `mode=text`（纯文本委派）。它不是 Codex 的替代品，也不做多轮对话。

每次调用都会新起一个 `codex exec` 进程，比直接在 Codex 应用内使用多约 3–5 秒启动开销。单步任务中，这部分约占总耗时的 6%，多步任务占比更小；这些是近似参考值，不是固定耗时。

换来的是在 DSH 内编排任务、指定模型／推理档位／服务层，以及无人值守连续执行的能力。不适合需要连续追问、复用 Codex 内已有上下文，或对每次多几秒敏感的场景。无人值守执行仍需考虑下文「配置与风险」中的默认 `bypass` 风险。

通过 DSH profile 的 npm/包安装流程安装本包并加载 `cordis.patch.yml`。要求 Node >=20，无运行时依赖；正常 profile 安装本轮未验证。预先登录 Codex；桌面任务另需启用 computer-use/browser 插件；在 macOS 上须向相关 Codex/宿主应用授予**辅助功能、屏幕录制**权限。

调用 `computer_use_codex`：`{"task":"计算 7×8 并截图验证","cwd":"/path/to/workspace","timeoutSeconds":600}`。工作目录须存在；每次独立调用，**不可追问、不可续接会话**。

## 支持平台

| 平台 | `mode=text` | `mode=desktop` |
| --- | --- | --- |
| macOS | 支持 | 已实测：计算器 `7×8=56` |
| Windows | 已实测 | 已实测：记事本输入 `hello`，6 张截图，状态栏「5 个字符」可核验 |
| Linux | 支持 | 不保证 |

文本模式的前提是本机可运行 Codex CLI。Windows 实测环境为 **Windows + DSH 0.2.2-rc.2 + Codex CLI 0.167.2**，由用户提供，测试时临时补齐了 status 工具缺失的 `output` 声明；此修复已纳入代码，本轮未重跑真实 GUI。

## 与 DSH 自带 subagent_codex 的关系

- 官方 `@deepseek-ai/dsh-subagent-codex` 是 **subagent provider**，注册到 `ctx.subagents`，通过 Codex app-server 运行，内置依赖钉在 `@openai/codex@0.153.4`。
- 本插件是 **Host 工具**，注册到 `ctx.tools`，直接调用使用者指定的 Codex CLI，入口路径可通过 `codexBin` 配置，因此可使用较新的 CLI 及其可用模型。
- 两者**互不依赖、可同时安装**。需要子代理树或会话记录时用官方 provider；需要指定模型、指定 CLI，或通过 `mode=text` 进行一次性纯文本委派时用本工具。

已在 Codex CLI 0.167.2 + DSH 0.2.2-rc.2 上验证。此处沿用既有验证记录，本次文档更新未重跑。

## 调用参数

| 参数 | 含义 / 默认值 |
| --- | --- |
| `task` | 必填，非空任务描述。 |
| `mode` | `desktop`（默认）或 `text`；文本任务不操作桌面、不创建截图目录。 |
| `cwd` | 已存在的工作目录；默认 Host 进程当前目录。 |
| `timeoutSeconds` | 整数 30–3600；继承插件配置或环境变量，初始默认 600。 |
| `model` | 模型 ID；继承规则见下文。 |
| `reasoningEffort` | 推理档位；继承规则见下文。 |
| `serviceTier` | 服务层；继承规则见下文。 |

文本示例：以 `{"task":"用一句话解释 7×8 的含义","mode":"text"}` 调用 `computer_use_codex`。`mode` 仅为调用参数，没有对应的 config 或环境变量默认值。文本模式省略桌面/截图指令及截图目录创建，不改变 `securityMode`，也不禁用 Codex 插件。

## 配置与风险

`apply(ctx, config)` 显式配置优先于环境变量；环境变量须传入 Host 进程，仅设置 shell 工具环境可能无效。

| 配置 | 环境变量 | 默认值 |
| --- | --- | --- |
| `codexBin` | `DSH_CODEX_BIN` | PATH 可执行 `codex`，然后 `$DSH_PROFILE_DIR/node_modules/@openai/codex/bin/codex.js` |
| `securityMode` | `DSH_CODEX_SECURITY_MODE` | `bypass` |
| `timeoutSeconds` | `DSH_CODEX_TIMEOUT_SECONDS` | `600`，整数 30–3600 |
| `terminateGraceMs` | `DSH_CODEX_TERMINATE_GRACE_MS` | `5000` 毫秒，整数 0–30000；`0` 跳过优雅终止 |
| `screenshotDir` | `DSH_CODEX_SCREENSHOT_DIR` | `<cwd>/.codex-cu/` |
| `model` | `DSH_CODEX_MODEL` | 继承 Codex 本地配置 |
| `reasoningEffort` | `DSH_CODEX_REASONING_EFFORT` | 继承 Codex 本地配置 |
| `serviceTier` | `DSH_CODEX_SERVICE_TIER` | 继承 Codex 本地配置 |

入口顺序为配置 → 环境变量 → PATH → profile 推导。显式入口必须为文件路径；无效时直接返回可读 `ok:false`，不偷偷回退。`.js` 入口用 `DSH_NODE_EXECUTABLE` 或当前运行时执行，并设置 `ELECTRON_RUN_AS_NODE=1`。相对截图目录基于 `cwd`。

`bypass` 使用 `--dangerously-bypass-approvals-and-sandbox`，关闭审批和 CLI 沙箱，可直接操作本机桌面及文件；为兼容现有 GUI 行为保留为默认。`workspace-write` 改传 `--sandbox workspace-write`，不传 bypass，GUI 操作可能失败。输出 `securityMode`、`securityNotice` 说明请求模式与风险；文件沙箱不保证约束外部 GUI 插件，也不能撤销桌面操作。

保留环境变量，不导出 schemastery `Config`：workspace 链接导入已失败，profile 安装解析未确认，本次不新增运行时依赖；不承诺自动配置界面。

## 选择模型 / 推理档位 / 服务层

`computer_use_codex` 支持调用参数 `model`、`reasoningEffort`、`serviceTier`；也可通过 `config.model`、`config.reasoningEffort`、`config.serviceTier` 设置插件默认值，或使用上表的环境变量。每个字段独立按三级覆盖优先级解析：**调用参数 > config > 环境变量**；三级均未设置时，继承 Codex 本地配置（`~/.codex/config.toml`）。仅省略调用参数，仍会使用 config 或环境变量中的默认值。

`cordis.patch.yml` 中的插件配置示例：

```yaml
- insert:
    - id: tool-computer-use-codex
      name: 'dsh-tool-codex-computer-use'
      config:
        model: gpt-6-astra
        reasoningEffort: high
        serviceTier: priority
```

可用模型随套餐与 CLI 版本变化。调用 `computer_use_codex_status` 获取当前目录，结合 `planType` 判断套餐下的可用模型。任务提供的本机快照共 10 个模型，包含 `gpt-6.1-sol`、`gpt-6-astra`；其中 `gpt-6.1-sol` 支持 `low` / `medium` / `high` / `xhigh` / `max` / `ultra`。Fast 服务层 ID 为 `priority`，选择前应查看对应模型返回的 `serviceTiers`。

返回的 `controls` 是以空格分隔的字符串，回显生效的覆盖值及其来源。使用上面的配置且无调用参数覆盖时为：

```text
model=gpt-6-astra(config) reasoningEffort=high(config) serviceTier=priority(config)
```

`reasoningEffort=high(config)` 表示来自插件配置；`reasoningEffort=low(environment)` 表示来自环境变量；无后缀的 `reasoningEffort=low` 表示来自调用参数。未列出的字段继承 Codex 本地配置；三个字段均无覆盖时，整个字符串为 `inherited from Codex config`，不会展开继承到的具体值。

## 环境体检

体检返回平台与系统版本，便于排查。

以 `{}` 调用 `computer_use_codex_status`（无参数），直接返回环境 JSON，不套用任务结果的 `ok`/`output` 包装：

| 字段 | 含义 |
| --- | --- |
| `codexVersion` | `codex doctor --json` 返回的 CLI 版本，无法取得时为 `unknown`。 |
| `latestCodexVersion` | `string` 或 `null`：npm 最新版本；关闭在线检查或查询失败时为 `null`。 |
| `upToDate` | `boolean` 或 `null`：本地版本不低于 npm 最新时为 `true`，低于时为 `false`，无法比较时为 `null`。 |
| `desktopAppVersion` | doctor 返回的桌面应用版本，无法取得时为 `unknown`。 |
| `authMode` | doctor 返回的已保存认证方式，无法取得时为 `unknown`。 |
| `planType` | 本地 JWT 的 `chatgpt_plan_type` 声明，缺失为 `null`；辅助判断套餐下的模型可用性。 |
| `subscriptionActiveUntil` | 本地 JWT 的 `chatgpt_subscription_active_until` 声明，缺失为 `null`。 |
| `models` | 来自 `codex debug models` 的对象数组，每项含 `slug`、`displayName`、`efforts`（推理档位）、`serviceTiers`（服务层 ID）；默认 `[]`。 |
| `warnings` | 数据来源失败、使用离线模型目录或建议升级时的非阻断告警；无告警为 `[]`。 |

第三条来源为 `$CODEX_HOME/auth.json`（默认 `~/.codex/auth.json`）。插件仅在本地解码所需 JWT 声明，不输出或外发 token。套餐信息是本地声明快照，不是实时权益查询；`planType` 需结合 `models` 使用，最终模型选择仍由 Codex 校验。

三条来源的结果在当前进程内按解析后的 CLI 路径及在线检查开关缓存 5 分钟。来源失败仅增加 warning，保留其他来源的结果；CLI 入口解析须先成功，入口错误不属于上述来源告警。此工具不执行桌面任务，也不创建截图目录。

在线检查默认开启，通过 `fetch('https://registry.npmjs.org/@openai/codex/latest')` 访问 `registry.npmjs.org`；成功和失败结果均在当前进程内缓存 6 小时，每次体检返回时将版本比对结果补入来源结果副本。可用 config `onlineCheck: false` 或环境变量 `DSH_CODEX_OFFLINE=1` 关闭；关闭后在线检查不发任何网络请求，`latestCodexVersion` / `upToDate` 均为 `null`。`codex debug models` 默认在线刷新，失败时回退 `codex debug models --bundled` 并给出 warning；关闭在线检查时直接使用 `--bundled`，并提示使用离线目录。该开关控制体检，不限制委派任务自身联网。

任务提供的本机实测快照（本轮未重跑）：`codexVersion: "0.167.2"`、`latestCodexVersion: "0.167.2"`、`upToDate: true`、`desktopAppVersion: "26.1106.51428"`、`authMode: "chatgpt"`、`planType: "prolite"`、`subscriptionActiveUntil: "2026-12-04T12:17:59+00:00"`，共 10 个模型，`warnings: []`。这些是观测值，不是固定默认值或通用套餐模型映射。

旧 CLI 不识别较新模型目录时，应升级 `codexBin` / `DSH_CODEX_BIN` / PATH / profile 实际选中的安装。profile 内 npm 安装的已实测版本示例：`npm install --prefix ~/.dsh/profiles/desktop @openai/codex@0.167.2`；按实际 profile 调整路径。此命令仅供手动执行，不自动升级；显式路径或 PATH 入口可能优先于该 profile 安装。升级后重启加载插件的进程，再调用体检工具。

## 前置体检

执行任务前会探测所选入口的 `codex --version`，结果在当前进程内按入口路径缓存（包括探测失败）。插件将该版本与 npm 最新版本在线比对，使用上述共享的 6 小时查询缓存，不再使用固定版本阈值。本地版本较旧时，`warnings` 例如：`旧 CLI（0.153.4），npm 最新 0.167.2，建议升级。` 本地探测失败时 `codexVersion` 为 `unknown`，记录告警并继续执行；npm 查询失败时无法比较，不产生升级告警，也不阻断执行。`latestCodexVersion` 和 `upToDate` 是 `computer_use_codex_status` 的字段；任务结果返回 `codexVersion` 和 `warnings`。升级同一路径的 CLI 后需重启加载插件的进程以刷新本地版本缓存。注册、调用链与完整输出契约见[架构说明](docs/ARCHITECTURE.md)。

## 返回与真实证据

用户提供的 Windows 实测（DSH 0.2.2-rc.2 + Codex CLI 0.167.2，临时补齐 status `output` 后，本轮未重跑）：体检返回 10 个模型、`codexVersion: "0.167.2"`、`planType: "prolite"`；`mode=text` 为 `ok:true`，耗时 54.1 秒；`mode=desktop` 为 `ok:true`，耗时 121.8 秒。记事本真实输入 `hello`，6 张截图，状态栏「5 个字符」可核验。操作说明见 [Windows 测试指南](docs/WINDOWS-TEST.md)。

`computer_use_codex` 返回 `ok`、`exitCode`、`mode`、`codexVersion`、`warnings`、`durationMs`、`output`、`controls`（生效的覆盖值及来源）、安全模式说明，日志创建成功时附 `logPath`。**`ok:true` 仅表示 CLI 正常退出，不等于任务目标达成**；桌面任务结合截图复核，文本任务核对返回文本。输出最多 8000 个 JavaScript 字符；两种模式的完整日志均保存在私有临时目录，最终消息文件自动删除。日志和截图可能包含敏感信息，需要手动清理。桌面模式截图默认保留 `<cwd>/.codex-cu/`，也可配置；提示词不保证截图生成。文本模式不创建该目录。

任务提供的本机文本模式实测（本轮未重跑）：`ok: true`、`durationMs: 34776`、`codexVersion: "0.167.2"`，`controls: "model=gpt-6.1-sol(config) reasoningEffort=high(config) serviceTier=priority(config)"`。

已核实的历史实测（任务提供，本轮未重跑）：`{"ok":true,"exitCode":0,"durationMs":47537,...}`。截图 `<workspace>/.codex-cu/calculator-7x8-56.png` 证明计算器 `7×8=56`；历史 `.png` 实为 JPEG，本次未改名，后续提示要求 `.jpg`。证据不随 npm 包分发。

## 已知限制

- `subscriptionActiveUntil` 只是 JWT 声明快照；时间已过期不代表套餐失效或权益终止。
- Windows 截图路径可能显示为正斜杠形式，这是跨平台显示差异；以返回的绝对路径为准。
- Windows `.codex-cu/` 中历史 `.png` 文件实为 JPEG 字节；新版本提示词已要求 `.jpg`，不自动重命名历史文件。

更多安全说明与限制见[详细文档](docs/DETAIL.md)。

任务超时后，先请求优雅终止，等待最多 `terminateGraceMs`，仍未退出时再升级为强制终止，为 Codex 清理 computer-use 会话留出时间，减少会话残留。`terminateGraceMs` 仅为插件配置，不是调用参数；config 优先于环境变量 `DSH_CODEX_TERMINATE_GRACE_MS`，默认 `5000` 毫秒，须为 0–30000 的整数。设为 `0` 时跳过优雅终止，直接 KILL。

Windows 先通过 spawn 执行 `taskkill /pid PID /T`，强制终止时追加 `/F`；POSIX 平台以子进程的负 PID 向进程组先发送 SIGTERM，再发送 SIGKILL。进程树／进程组终止失败时，回退 `child.kill(signal)`，使用该阶段对应的信号。目标树或组之外的后代可能继续运行，已发生的桌面修改无法撤销。暂不接入 `execute` 的 `exec` 取消信号：Host 契约未确认，先保留已验证的有界超时，取消集成为后续项。

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

仅运行假 CLI：Windows 使用 `.js` 文件，由插件通过 Node 启动；其他平台保留 shell 假 CLI。Windows 可运行 `node test/smoke.mjs`。覆盖注册失败保护、JS 假 CLI 各命令和三类真实 30 秒超时；POSIX 验证 TERM 处理、升级 KILL、直接 KILL，Windows 验证有界超时与 taskkill 终止请求，不依赖 POSIX 信号处理器。不操作桌面；本轮未在原生 Windows 执行 smoke，未验证真实保守模式 GUI、profile 安装、npm 发布。

同意独立 unscoped npm 包与仓库 `dsh-plugin` topic：Host 工具与文本委派 provider 职责不同，不向现有 provider 强塞桌面能力；维护、安全审查由发布者承担。

作者与 MIT 版权人为 `wx5`。仓库元数据使用 `https://github.com/wxfiveopps1102/dsh-tool-codex-computer-use`，GitHub 用户名为 `wxfiveopps1102`，仓库尚未创建；发布前须确认 npm 包名可用和发布权限。许可证 MIT。
