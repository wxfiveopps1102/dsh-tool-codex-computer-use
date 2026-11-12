# 发布收尾记录：dsh-tool-codex-computer-use 0.1.0

本包是通过本机 Codex CLI 执行一次性 macOS / Windows 桌面或文本任务的 DSH Host 工具，提供 `computer_use_codex` 和环境体检工具 `computer_use_codex_status`。

## 定位与差异

按 lead 提供的对比口径：官方 `@deepseek-ai/dsh-subagent-codex` 与社区 `mjylfz/dsh-subagent-codex` 属于 subagent provider，侧重文本委派；本包注册工具，不提供 subagent provider。本包已有真实 GUI 端到端证据（计算器 3×9=27），不只依赖文本委派结果。此处不推断其他项目是否拥有未提供的 GUI 能力或测试。

入口解析顺序为 config → `DSH_CODEX_BIN` → PATH 的 `codex` → `DSH_PROFILE_DIR`；支持 `bypass` / `workspace-write`，截图目录可配置。

## 本地安装只读核实

核实日期：2026-11-12。

- `~/.dsh/profiles/desktop/package.json` 的 dependencies 键与 `dsh.profile.bundles` 均为 `dsh-tool-codex-computer-use`；依赖值指向本工作区插件目录。
- `~/.dsh/profiles/desktop/node_modules/dsh-tool-codex-computer-use` 是有效符号链接，已由 lead 以绝对路径重建并核验：`readlink` 结果为 `/Users/wx5/Documents/deepseek-harness/dsh 生态适应/packages/dsh-tool-codex-computer-use`，`realpath` 正确解析到同一目录。此前链接失效的成因是链接建在 `node_modules/`（比原 `node_modules/@local/` 浅一层），原相对路径中的五级 `..` 多向上一级，指向了 `/Users/Documents/deepseek-harness/dsh 生态适应/packages/dsh-tool-codex-computer-use`。
- lead 已核验经该链接可读取 `package.json`，其 `name` 为 `dsh-tool-codex-computer-use`、`version` 为 `0.1.0`，无 `private` 字段；经该链接也可读取 `index.js`。
- 当前工具列表没有 `plugin_manager.list_bundles`，未调用，无法核实 bundle 运行时可见性及 enabled 状态。配置中列出 bundle 不等于运行时已加载。

上述链接修复与核验由 lead 实际执行；本轮仅更新记录，未重新探测链接或修改 profile。

## 收验矩阵

以下测试结果引用 lead 已核实的事实，本轮未重跑。命令中未知的信息明确保留，不补写历史调用。

| 项目 | 命令或调用 | 结果 | 证据路径 |
| --- | --- | --- | --- |
| 自测 | 包目录内 `node test/smoke.mjs`；README 另提供 `ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" test/smoke.mjs`。lead 未提供当次启动器原文。 | 全绿 `PASS`；假 CLI 测试，不操作桌面。 | `test/smoke.mjs` 为测试源；独立 PASS 输出文件路径未提供。 |
| 社区标准检查 | `dsh-standards` 1.6.9，带 `--no-exec`；完整命令、入口及其他参数未提供。 | blocking 0；hygiene 2 条 WARN：DSC-11 C-11.5、DSC-13 C-13.1；7 项 partial，缺 `--host` / `--runtime` 运行时检查。 | 独立检查报告路径未提供；结果引用 lead 核实记录。 |
| 真实 GUI 回归 | `computer_use_codex` 工具执行计算器 3×9 并截图；完整原始参数未提供。 | `{"ok":true,"exitCode":0,"durationMs":54626,...}`；lead 已核实计算器显示 27。 | 工作区根目录 `.codex-cu/calculator-result-27.jpg`，本轮只读确认文件存在，未重新调用 GUI。 |
| 模型/档位可配置 | `computer_use_codex` 执行计算器 `23×17` 三次；完整原始参数未提供。 | 三次均为 `23×17=391`；`controls` 中 `reasoningEffort` 依次为 `high` / `low` / `high`，对应耗时 `40.4s` / `42.1s` / `37.2s`。 | 引用任务提供的历史实测，本轮未重跑；完整 `controls` 原文、日志及截图路径未提供，不补写来源后缀。 |

## 跨平台验收记录

验证日期：macOS 为 **2026-11-12**（既有验收记录），Windows 为 **2026-11-12**（本次用户回传）。macOS 沿用仓库已记录的结果，Windows 引用用户提供的实测事实；本轮仅同步文档，未重跑测试或 GUI。

| 平台 | 环境 | 四层结果 | SHA（`index.js` SHA256） |
| --- | --- | --- | --- |
| macOS | 系统具体版本未记录；DSH 0.2.2-rc.2；Codex CLI 0.167.2；Codex 桌面端 26.1106.51428；ChatGPT 登录，`planType: prolite` | smoke：PASS，exit 0；体检：10 模型，`codexVersion: "0.167.2"`，`warnings: []`；text：`ok:true`，34.776s；desktop：`ok:true`，54.626s，计算器 `3×9=27`，证据 `.codex-cu/calculator-result-27.jpg` | 历史实测未记录，不补推 |
| Windows | Windows 11 Pro；DSH Desktop 0.2.2-rc.2（`desktop` profile）；Node v24.14.0；npm 11.9.0；Codex CLI 0.167.2；ChatGPT 登录，`planType: prolite` | smoke：PASS，exit 0；体检：10 模型，`codexVersion: "0.167.2"`，`planType: "prolite"`，`warnings: []`，`platform: "win32"`，`platformLabel: "Windows"`，`osVersion: "Windows 11 Pro"`；text：`ok:true`，52.3s；desktop：`ok:true`，100.5s，记事本真实输入 `hello`，状态栏「5 个字符」，3 张截图 | `F0A27BB7FEAC76F9421870964B5653ED2CB973138FF7CFC6232BD85F54F8EDF3`，与仓库 commit `e99d5a4` 一致 |

Windows 文本任务的 `controls` 原文：

```text
model=gpt-6.1-sol(config) reasoningEffort=high(config) serviceTier=priority(config)
```

Windows 冷启动验收：手动重启 DSH 后，`computer_use_codex_status` 与 `computer_use_codex` 两个工具首次调用即成功，无 `must declare output` 告警；`application: applied`，`warnings: []`。本次结果对应上述 SHA 的仓库版本，无需临时补写 `output` 声明；本次 52.3s / 100.5s、3 张截图与早期临时修复测试的 54.1s / 121.8s、6 张截图属于不同轮次。

## 变更记录

- `mode` 参数：`computer_use_codex` 支持 `desktop`（默认）/`text`，结果含 `mode`。文本模式用于不操作桌面的纯文本任务，不创建截图目录、不附加桌面或截图指令；安全模式保持原配置，不禁用 Codex 插件。任务提供的本机文本实测：`ok:true`、`durationMs:34776`、`codexVersion: "0.167.2"`，`controls: "model=gpt-6.1-sol(config) reasoningEffort=high(config) serviceTier=priority(config)"`。本轮仅同步文档，未重跑。
- 环境体检工具：以 `{}` 调用无参数的 `computer_use_codex_status`，返回 `models`（每项含 `slug`、`displayName`、`efforts`、`serviceTiers`）、`codexVersion`、`latestCodexVersion`、`upToDate`、`desktopAppVersion`、`authMode`、`planType`、`subscriptionActiveUntil`、`warnings`。基础数据来自 `codex debug models`、`codex doctor --json`、`$CODEX_HOME/auth.json`（默认 `~/.codex/auth.json`）的 JWT 声明；只读并本地解码所需声明，不输出或外发 token。三条来源按 CLI 路径与在线检查开关缓存 5 分钟，来源失败只增加 warning；入口解析失败仍报错。每次返回时另补入在线版本比对结果。模型目录默认在线刷新，失败时回退 `codex debug models --bundled` 并给出 warning；关闭在线检查时直接使用离线目录并告警。可用模型随套餐与 CLI 版本变化，`planType` 需结合模型目录判断。本机实测快照为 `codexVersion: "0.167.2"`、`latestCodexVersion: "0.167.2"`、`upToDate: true`、桌面端 `26.1106.51428`、认证 `chatgpt`、`planType: "prolite"`、订阅有效期声明 `2026-12-04T12:17:59+00:00`、10 个模型、`warnings: []`（任务提供，本轮未重跑）。
- 在线版本比对，取代固定阈值：执行前探测 `codex --version`，按入口路径在进程内缓存；通过 `fetch('https://registry.npmjs.org/@openai/codex/latest')` 查询 npm 最新版，成功与失败结果均缓存 6 小时，由任务与状态工具共享。本地低于 npm 最新时提示，例如 `旧 CLI（0.153.4），npm 最新 0.167.2，建议升级。` 本地探测失败返回 `unknown` 并告警，继续执行；npm 查询失败不产生升级告警。状态工具新增 `latestCodexVersion`（`string` 或 `null`）与 `upToDate`（`boolean` 或 `null`），以 doctor 返回的本地版本比较：不低于 npm 最新为 `true`，低于为 `false`，无法比较为 `null`。可用 config `onlineCheck: false` 或 `DSH_CODEX_OFFLINE=1` 关闭在线检查；关闭后在线检查不发任何网络请求，两个新增字段均为 `null`，该开关不限制委派任务自身联网。本轮仅同步文档，未运行 Codex 或测试。
- 配置级默认值 + 来源回显：支持 `config.model` / `config.reasoningEffort` / `config.serviceTier` 与对应的 `DSH_CODEX_MODEL` / `DSH_CODEX_REASONING_EFFORT` / `DSH_CODEX_SERVICE_TIER`。各字段按调用参数 > config > 环境变量解析，均未设置则继承 Codex 本地配置。`controls` 回显覆盖值：调用参数无后缀，配置为 `(config)`，环境变量为 `(environment)`；无任何覆盖时为 `inherited from Codex config`。本轮仅同步文档，未修改代码或重跑测试。

## 发布形态与步骤

采用独立、unscoped npm 包 `dsh-tool-codex-computer-use@0.1.0`，配套 GitHub 仓库与社区市场目录条目。以下为 npm 发布与市场提交的待执行步骤；验收文档的提交与推送不代表已完成 npm 发布或市场收录。

1. 核对下节已填写的身份与仓库信息，补齐徽章；由 lead 验收链接问题、检查结果及风险接受记录，并确认 npm 包名可用性与账号发布权限。
2. 在 `packages/dsh-tool-codex-computer-use/` 目录执行 `npm publish --access public`。
3. 为实际 GitHub 仓库添加 `dsh-plugin` topic。
4. 按社区市场的实际收录流程提交 npm 包名、GitHub 仓库、说明与验证证据，进入社区市场目录。当前未提供目录地址或提交入口，不虚构链接，也不将添加 topic 等同于已经收录。
5. 发布后本地验证命令：`dsh plugin --profile desktop add dsh-tool-codex-computer-use`。随后核对依赖、有效链接或安装目录，以及 bundle 的 enabled 状态。当前 profile 的 link 依赖已由 lead 通过绝对路径重建符号链接处理并核验；此命令本轮未执行，不代表 npm 安装已验证。

当前 `package.json.files` 未包含 `RELEASE.md`，本记录作为仓库交接文档，不会按现有白名单随 npm 包分发。

## 发布身份与待补信息

- 作者名：`wx5`；`package.json` 的 `author` 字段已填写。
- GitHub owner/repo：`wxfiveopps1102/dsh-tool-codex-computer-use`；`package.json` 的 `repository` 字段已填写，仓库地址为 `https://github.com/wxfiveopps1102/dsh-tool-codex-computer-use`。
- LICENSE 署名：已替换为 `Copyright (c) 2026 wx5`。
- README 徽章：待补真实 npm 版本、许可证及仓库相关徽章，目标 URL 必须使用确认后的包与仓库信息。

## 已知风险与限制

- 测试脚本曾因 `DSH_NODE_EXECUTABLE=process.execPath` 误写应用二进制，已改为临时目录运行时副本（历史事件由任务提供；本轮只读确认副本逻辑，未重跑）。
- macOS 需要为相关 Codex/宿主应用授予辅助功能和屏幕录制权限；须有已登录的 Codex CLI 及所需 computer-use/browser 插件。
- `securityMode` 默认 `bypass`，传入 `--dangerously-bypass-approvals-and-sandbox`，关闭 CLI 审批和沙箱，可直接影响桌面与文件。`workspace-write` 使用文件沙箱，但真实 GUI 行为未验证，且不保证约束外部 GUI 插件。
- DSC-11 C-11.5：声明了 `subprocess` / `fs:write`，静态扫描未观察到对应使用；这是声明与静态观察的差异，不证明没有这些行为。是否接受：待 lead 明确，本记录不代为接受或删除声明。
- DSC-13 C-13.1：未声明 `dsh.labels`。是否接受：待 lead 明确，本轮不补字段。blocking 0 不等于 WARN 已获接受。
- 7 项 partial 未覆盖运行时检查，不视作通过；本次也未核实 bundle enabled 状态。
- 每次调用独立，不可追问、不可续接会话。
- `ok:true` 仅表示 CLI 正常退出，不等于 GUI 目标达成；应结合截图核验。提示词请求截图不保证生成截图。
- 超时终止不能撤销已有桌面影响；脱离进程组的后代可能继续运行。日志、截图可能含敏感信息，需要手动清理。

## 回滚：从 profile 移除

以下仅记录操作方法，本轮不执行：先停用使用该 profile 的 Host，备份 `~/.dsh/profiles/desktop/package.json`；从 dependencies 删除 `dsh-tool-codex-computer-use`，并从 `dsh.profile.bundles` 删除同名条目。删除 `~/.dsh/profiles/desktop/node_modules/dsh-tool-codex-computer-use` 这一符号链接本身，不递归删除工作区插件源码。若后续经包管理器正式安装，还应使用实际安装工具同步移除该依赖及锁文件记录；当前未核实 CLI 卸载子命令，不编造命令。

重载 profile 后确认依赖和 bundle 条目已移除，工具不再注册。移除插件不撤销历史 GUI 操作；截图与日志按需单独清理。

## 交接中的不一致与缺项

- profile 依赖和 bundle 名称正确，node_modules 符号链接已由 lead 通过绝对路径重建修复，本地链接解析及经链接读取包文件均已核验成功。
- README、README.zh.md 与 DETAIL 保留旧的 7×8=56 历史证据及安装未验证描述；本记录另载优化后的 3×9=27 证据与历史只读检查结果。本轮已同步这些文档的 `mode`、环境体检及文本实测说明，未重新验证安装或 GUI。
- 作者、仓库元数据与 LICENSE 署名已填写，README 徽章仍待补齐；自测和标准检查的独立输出路径、标准检查完整命令、GUI 原始调用参数未提供。

本文件记录事实、待执行步骤与待验收事项；最终发布判断由 lead 作出。
