# 架构说明

## 定位

本包是委派一次性桌面或文本任务、提供环境体检的 Host 工具插件，不提供 subagent provider。

## 注册

`name` 为 `tool-computer-use-codex`，`inject` 为 `['tools']`；`apply(ctx, config)` 经 `ctx.tools.register` 依次注册 `computer_use_codex_status` 和 `computer_use_codex`，有 `ctx.effect` 时由其托管，释放时注销两个工具。bundle 经 `cordis.patch.yml` 插入插件；运行时加载状态未在代码中确认。

## 调用链

任务调用：`computer_use_codex` → `run` → `validate` → 校验 `mode` 与覆盖参数 → `resolveCodexBin` → `probeCodexVersion`（`codex --version`）→ `onlineCheckEnabled` → `checkCodexUpdate`（开启时查询 npm 最新版，关闭时跳过网络查询）→ 合并版本 warning → 检查工作目录 → `mode` 分支 → 组装 argv → `spawn` → 读 `-o` → 截断 → 返回。

- `desktop`（默认）：创建截图目录，附加桌面操作、截图验证及 `.jpg` 保存指令。
- `text`：不创建截图目录，不附加桌面或截图指令，用于纯文本委派；不禁用 Codex 插件，不改变安全参数。

两条分支共用临时日志、覆盖参数、超时及输出处理。入口依次取配置、环境变量、PATH、profile；显式入口无效不回退。版本探测按路径缓存，失败仅告警。argv 含工作目录、安全参数、模型覆盖及最终消息路径。非 Windows 使用 detached，超时向进程组发送 SIGKILL；Windows 终止子进程。stdout/stderr 写日志，最终消息读取后删除。

体检调用：`computer_use_codex_status`（无参数，调用传 `{}`）→ `resolveCodexBin` → `inspectEnvironment` → `onlineCheckEnabled` → 按入口路径和在线检查开关查五分钟缓存；未命中则依次读取模型目录、`codex doctor --json`、本地 `$CODEX_HOME/auth.json` 的 JWT 声明 → `withUpdate` 复制来源结果 → `checkCodexUpdate`（使用 doctor 返回的本地版本）→ 补入 `latestCodexVersion`、`upToDate` 及升级 warning → 返回环境 JSON。命中五分钟缓存也经过 `withUpdate`，不会跳过版本比对。默认认证路径为 `~/.codex/auth.json`。每条来源单独捕获失败并追加 warning，保留其他来源结果；每次 CLI 子命令调用限时 15 秒。缓存保存结果 Promise，共享进行中的请求，返回时复制结果。该调用不执行任务、不创建截图目录。

模型目录分支：在线检查开启 → `codex debug models` 在线刷新 → 成功则使用结果；失败 → `codex debug models --bundled` → 成功则使用离线目录并追加回退 warning，两次均失败则保留空数组并告警。在线检查关闭 → 直接运行 `codex debug models --bundled`，成功时提示使用离线目录，失败时保留空数组并告警。

版本比对分支：`checkCodexUpdate` → 在线检查开启时调用 `fetchLatestCodexVersion` → 命中六小时缓存则复用，否则 `fetch('https://registry.npmjs.org/@openai/codex/latest')`（限时 6 秒）→ `compareVersions`。成功与失败结果均在当前进程内缓存 6 小时，并共享进行中的请求；失败返回 `null`，不产生升级告警、不阻断调用。仅本地版本低于 npm 最新时追加 warning，例如 `旧 CLI（0.153.4），npm 最新 0.167.2，建议升级。` 关闭在线检查时跳过 fetch，也不使用已缓存的 npm 版本，状态字段 `latestCodexVersion` / `upToDate` 均为 `null`。

任务本地版本探测单独限时五秒，按路径缓存到进程结束；环境三条来源缓存为五分钟，两者相互独立，任务执行不会自动调用 `inspectEnvironment`。npm 版本查询的六小时缓存由任务与状态工具共享。同路径升级后需重启插件所在进程刷新本地版本缓存。两种任务模式的日志留在系统临时目录，桌面模式截图留在指定目录，均需另行清理。

## 配置优先级

在线检查默认开启；config `onlineCheck: false` 或环境变量 `DSH_CODEX_OFFLINE=1` 任一成立即关闭，显式 `onlineCheck: true` 不能覆盖该环境变量。关闭后在线检查不发任何网络请求，模型查询直接使用 `--bundled`；此开关不限制委派任务自身联网。

模型、推理档位、服务层按调用参数 > config > 环境变量 > Codex 本地配置解析。超时前三层相同，默认 600 秒；`cwd` 默认当前目录。`mode` 只取调用参数，默认 `desktop`，无配置或环境变量覆盖。`securityMode` 取配置、环境变量，默认 `bypass` 关闭审批和沙箱；另一档 `workspace-write` 请求文件沙箱，GUI 可能失败。截图目录仅在 `desktop` 模式使用，取配置、环境变量，默认 `<cwd>/.codex-cu`，相对路径基于 cwd；提示要求 JPG，不保证生成。

## 输出契约

`computer_use_codex` 返回：

- `ok`：CLI 是否正常退出；**`ok:true` ≠ GUI 目标达成**。
- `exitCode`：退出码；包装层错误为 -1。
- `mode`：执行模式 `desktop` / `text`；非法模式失败时回显字符串值，非字符串为 `invalid`。
- `codexVersion`：探测版本，无法取得为 `unknown`。
- `warnings`：非阻断告警；本地版本低于在线查询所得的 npm 最新版本时提示升级，无固定版本阈值。
- `securityMode`：请求的安全模式。
- `controls`：生效覆盖及来源，或继承本地配置的说明。
- `securityNotice`：安全风险说明。
- `durationMs`：校验后起算的毫秒耗时。
- `output`：最终回复或错误，含截断提示最多 8000 个 JavaScript 字符。
- `logPath`：日志创建成功后提供的路径。

`computer_use_codex_status` 直接返回环境对象，不含任务结果包装：`models`（对象数组，每项含 `slug`、`displayName`、`efforts`、`serviceTiers`）、`codexVersion`、`latestCodexVersion`、`upToDate`、`desktopAppVersion`、`authMode`、`planType`、`subscriptionActiveUntil`、`warnings`。模型默认 `[]`；CLI 版本、桌面版本和认证方式默认 `unknown`；套餐与到期时间默认 `null`；无告警时 `warnings: []`。`latestCodexVersion` 为 npm 最新版本字符串，关闭在线检查或查询失败时为 `null`；`upToDate` 在本地版本不低于 npm 最新时为 `true`，低于时为 `false`，无法比较时为 `null`。这两个新增字段仅由状态工具返回。模型目录来自 debug，本地版本与认证来自 doctor，套餐与到期时间来自本地 JWT 声明。插件只读并本地解码所需声明，不外发或输出 token；仅将提取的套餐字段返回调用方。可用模型随套餐与 CLI 版本变化，`planType` 应结合 `models` 判断。

## 失败路径

入口不存在、spawn 失败、超时返回失败及 -1；非零退出保留退出码，无退出码用 -1。`-o` 缺失回退日志末尾最多 8000 字节，仍按退出码判断成功。其他读取错误返回失败。最初的 `validate` 抛错，不走结果对象。

非法 `mode` 在启动 CLI 前返回 `ok:false`、`exitCode:-1`。体检工具入口解析失败会直接报错；进入 `inspectEnvironment` 后的三条来源失败仅产生固定 warning，不返回错误原文或凭据。

## 文件地图

- `index.js`：注册与执行实现。
- `package.json`：包元数据和分发白名单。
- `cordis.patch.yml`：bundle 插入声明。
- `README.zh.md`：中文使用说明。
- `README.md`：英文使用说明。
- `docs/DETAIL.md`：插件详情。
- `docs/ARCHITECTURE.md`：本架构说明。
- `RELEASE.md`：发布交接记录。
- `locale/zh.json`：中文展示元数据。
- `locale/en.json`：英文展示元数据。
- `icon.svg`：插件图标。
- `LICENSE`：MIT 许可证。
- `test/smoke.mjs`：假 CLI 冒烟测试。

## 边界

插件自身不做 GUI 自动化，操作交给 Codex；不处理 Safari 退出弹窗、表单未保存等应用侧状态，不做多轮追问或会话续接，也不撤销桌面影响。
