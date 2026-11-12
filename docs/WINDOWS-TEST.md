# Windows 首次安装与测试：dsh-tool-codex-computer-use 0.1.0

本指南配合 `dsh-tool-codex-computer-use-0.1.0.zip` 使用。下面的命令在 Windows PowerShell 中执行；DSH 工具调用则在 DSH 中执行。请先安装并启动过 DSH，确认使用的是 `desktop` profile。安装时只编辑该 profile 的配置，不修改插件代码。

请使用已补齐 status 工具 `output: { schema, render }` 的修复版文件；旧归档若仍缺少该声明，不适用于 DSH 0.2.2-rc.2。

## 已有 Windows 实测记录

以下为用户提供的事实，本轮未重跑真实 GUI。环境：**Windows + DSH 0.2.2-rc.2 + Codex CLI 0.167.2**；测试时临时补齐了 status 工具缺失的 `output` 声明，修复版已包含该改动。

| 项目 | 实测结果 |
| --- | --- |
| `computer_use_codex_status` | 10 个模型，`codexVersion: "0.167.2"`，`planType: "prolite"` |
| `mode=text` | `ok:true`，54.1 秒 |
| `mode=desktop` | `ok:true`，121.8 秒；记事本真实输入 `hello`，6 张截图，状态栏「5 个字符」可核验 |

原生 Windows smoke 尚未在本轮执行；上述真实工具结果与 smoke 验证分开记录。

## 0. 先决条件检查

打开 PowerShell，逐条执行：

```powershell
node -v          # >= 20
npm -v
codex --version  # 期望 0.167.x
codex login      # 未登录则先登录；已经登录可跳过
codex debug models   # 能列出模型
```

若没有 Node.js，先安装 Node.js 20 或更高版本（含 npm），再重新打开 PowerShell。若 `codex` 未安装，或已有版本不属于本次期望的 0.167.x，执行以下命令安装固定测试版本：

```powershell
npm i -g @openai/codex@0.167.2
```

安装后重新打开 PowerShell，再做上述检查。Windows 上的 GPT/ChatGPT/Codex 桌面应用与 Codex CLI 是两回事，CLI 仍需单独安装。这里固定使用 0.167.2 作为测试版本，不代表它始终是最新版本。模型是否可用以这台电脑登录后的模型列表和实际调用为准。

## 1. 解压放置

将 zip 解压到 `C:\dsh\plugins\dsh-tool-codex-computer-use`。下面假设 zip 已放在 Windows 桌面；若位置不同，替换 `-LiteralPath` 后的文件路径：

```powershell
$desktopDir = [Environment]::GetFolderPath('Desktop')
New-Item -ItemType Directory -Path 'C:\dsh\plugins' -Force | Out-Null
Expand-Archive -LiteralPath "$desktopDir\dsh-tool-codex-computer-use-0.1.0.zip" -DestinationPath 'C:\dsh\plugins\dsh-tool-codex-computer-use'
Test-Path 'C:\dsh\plugins\dsh-tool-codex-computer-use\package.json'
```

最后一条应返回 `True`。确保该目录下能直接看到 `package.json`、`index.js`、`docs`、`test`，不要多套一层同名文件夹。若目标目录已存在，先确认旧文件的用途，再决定另行备份或换目录。此插件没有运行时依赖，手动联接流程无需在插件目录执行 `npm install`。

## 2. 建目录联接（junction）

目录联接让 DSH profile 能找到解压后的插件。先完全退出 DSH，再在同一个 PowerShell 窗口执行以下命令；后续章节继续使用 `$profile` 变量：

```powershell
$profile = "$env:USERPROFILE\.dsh\profiles\desktop"
Test-Path "$profile\package.json"
```

应返回 `True`。若为 `False`，先确认 DSH 已初始化、正在使用的 profile 名称及路径；不要在错误位置新建一个空 profile。

若 `node_modules` 不存在，先创建，再建立联接：

```powershell
New-Item -ItemType Directory -Path "$profile\node_modules" -Force | Out-Null
New-Item -ItemType Junction -Path "$profile\node_modules\dsh-tool-codex-computer-use" -Target "C:\dsh\plugins\dsh-tool-codex-computer-use"
Get-Item -LiteralPath "$profile\node_modules\dsh-tool-codex-computer-use" | Format-List FullName,LinkType,Target
```

预期 `LinkType` 为 `Junction`，`Target` 指向解压目录。

若提示同名路径已存在，先用上面的 `Get-Item` 检查。仅在确认它是旧联接后删除，再重新建立。删除旧联接使用 CMD 的 `rmdir`，不会删除目标目录的内容；在 PowerShell 中这样调用：

```powershell
cmd /c rmdir "$profile\node_modules\dsh-tool-codex-computer-use"
```

这里实际执行的是 `rmdir "$profile\node_modules\dsh-tool-codex-computer-use"`。PowerShell 中直接输入 `rmdir` 会使用 `Remove-Item` 别名，因此请复制上面的 `cmd /c` 写法，不加 `/s` 或 `-Recurse`。若该路径是普通目录而非联接，先保留并确认其内容，不执行这条删除命令。

## 3. 改 profile 的 package.json

编辑的是 `$profile\package.json`，不是解压目录内插件自己的 `package.json`。先备份：

```powershell
$backupTag = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item -LiteralPath "$profile\package.json" -Destination "$profile\package.json.$backupTag.bak"
notepad "$profile\package.json"
```

在现有 `dependencies` 对象中加入以下属性，保留其他依赖：

```json
"dsh-tool-codex-computer-use": "link:C:\\dsh\\plugins\\dsh-tool-codex-computer-use"
```

在现有 `dsh.profile.bundles` 数组末尾加入以下字符串，保留其他 bundle：

```json
"dsh-tool-codex-computer-use"
```

`dsh.profile.bundles` 表示依次进入 `dsh` 对象、`profile` 对象，再找到 `bundles` 数组，不是新建一个名字带点号的属性。若已经有同名依赖或数组项，更新或保留该项即可，不重复添加。注意相邻属性/数组项之间需要逗号，最后一项后不能有逗号；JSON 中不写注释。

保存为 UTF-8，然后检查 JSON 能否解析：

```powershell
Get-Content -LiteralPath "$profile\package.json" -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null
```

没有报错表示 JSON 语法通过；这一步不替代后面的 DSH 加载检查。

## 4. 改 cordis.patch.yml

编辑的是 profile 中的 `$profile\cordis.patch.yml`，不是插件包内的同名文件。先备份现有文件：

```powershell
if (Test-Path "$profile\cordis.patch.yml") {
    Copy-Item -LiteralPath "$profile\cordis.patch.yml" -Destination "$profile\cordis.patch.yml.$backupTag.bak"
}
notepad "$profile\cordis.patch.yml"
```

在现有插件列表末尾追加以下条目，路径使用正斜杠，避免 YAML 转义问题：

```yaml
- id: tool-computer-use-codex
  name: "dsh-tool-codex-computer-use"
  config:
    codexBin: "C:/Users/<你的用户名>/AppData/Roaming/npm/node_modules/@openai/codex/bin/codex.js"
    model: gpt-6.1-sol
    reasoningEffort: high
    serviceTier: priority
```

保留文件原有结构：若现有条目放在 `- insert:` 下，上述条目也放入该 `insert` 列表，与其他插件条目缩进对齐。若已经存在 `id: tool-computer-use-codex`，修改它的 `config`，不要重复追加同一 ID。使用空格缩进，不用 Tab。

若该 patch 文件原先不存在或为空，应使用下面包含 `insert` 的完整结构，而不是仅保存上面的插件条目：

```yaml
- insert:
    - id: tool-computer-use-codex
      name: "dsh-tool-codex-computer-use"
      config:
        codexBin: "C:/Users/<你的用户名>/AppData/Roaming/npm/node_modules/@openai/codex/bin/codex.js"
        model: gpt-6.1-sol
        reasoningEffort: high
        serviceTier: priority
```

不要原样保留 `<你的用户名>`。查找本机实际 CLI 入口：

```powershell
Join-Path (npm root -g) "@openai\codex\bin\codex.js"
```

也可以一次检查文件是否存在，并输出适合粘贴到 YAML 的正斜杠路径：

```powershell
$codexEntry = Join-Path (npm root -g) '@openai\codex\bin\codex.js'
Test-Path -LiteralPath $codexEntry
$codexEntry.Replace('\', '/')
```

`Test-Path` 应返回 `True`。将最后输出的完整路径填到 `codexBin`，保留外层引号。该值是 `codex.js` 文件路径，不是 `codex.cmd`、`node.exe`，也不是 `node ...` 命令字符串。插件会通过 Node 运行这个 `.js` 入口。

若 `gpt-6.1-sol` 调用返回 400（如 `model_not_found`），把 `model` 改为 `gpt-6-astra` 后保存、重启 DSH 再试；同时核对 `codex debug models` 的列表。

## 5. 重启 DSH

保存两个 profile 配置文件，完全退出 DSH（包括托盘或后台进程），再重新启动并打开 `desktop` profile。确认能看到 `computer_use_codex_status` 和 `computer_use_codex` 两个工具。每次修改配置或升级实际使用的 CLI 后，都重新启动 DSH 再测试。

## 6. 四层测试

按顺序执行并保存每一步结果。下表的“期望”是验收目标，不代表已在你的 Windows 机器上验证通过。

| 层 | 命令/操作 | 期望 |
|---|---|---|
| 自测 | `cd C:\dsh\plugins\dsh-tool-codex-computer-use; node test\smoke.mjs` | `PASS`，exit 0 |
| 体检 | DSH 里调 `computer_use_codex_status`，参数 `{}` | 返回 `codexVersion`、`models`、`planType` |
| 文本 | 调 `computer_use_codex`，参数 `{"mode":"text","task":"用两句话说明 DSH 是什么"}` | `ok:true` |
| 桌面 | 调 `computer_use_codex`，参数 `{"mode":"desktop","task":"打开记事本，输入 hello，截图保存到工作目录 .codex-cu/，报告截图路径"}` | `ok:true` 且有截图 |

自测后立即在 PowerShell 查看退出码：

```powershell
$LASTEXITCODE
```

**修复版自测的跨平台行为：** `win32` 使用 `.js` 假 CLI，由插件通过 Node 启动，支持 `--version`、`debug models`、`doctor --json`、`exec` 的输出文件、等待和退出码；非 Windows 保留 shell 假 CLI。Windows 超时断言验证有界超时与 taskkill 终止请求，不依赖 POSIX SIGTERM 处理器。自测仅使用临时夹具，不操作真实桌面或用户 profile。本轮已在 macOS 用指定 Electron 运行时验证 `PASS`、`EXIT:0`，并覆盖 JS 假 CLI 生成器；这不替代原生 Windows 的运行验证。

后面三项要在 DSH 中触发真实工具调用，不能把工具名称直接当作 PowerShell 命令。可要求 DSH：“请调用指定工具，使用以下 JSON 参数，并返回完整工具结果。”

体检中应有 CLI 版本和模型列表；`planType` 在无法读取套餐声明时可能为 `null`，请连同 `warnings` 原样回传。`ok:true` 只表示 CLI 正常退出；文本测试还要核对返回内容，桌面测试还要确认记事本里出现 `hello`，并能打开实际生成的截图。

`.codex-cu/` 相对于工具执行时的工作目录，不一定在插件目录。Windows 桌面已在文首所列环境实测；其他环境仍需通过截图核验实际效果。

### 已知限制

- `subscriptionActiveUntil` 只是 JWT 声明快照；时间已过期不代表套餐失效或权益终止，应结合模型列表和实际调用判断。
- 截图路径可能显示为正斜杠形式，这是跨平台显示差异；以返回的绝对路径为准。
- Windows `.codex-cu/` 中历史 `.png` 文件实为 JPEG 字节；新版本提示词已要求 `.jpg`，不自动重命名历史文件。

## 7. 回传清单

- 四步的输出：自测终端输出及退出码；体检、文本、桌面三项的完整工具 JSON，原样保留字段。
- 若任务返回 `logPath`，保留 JSON 中该路径；对应日志文件的内容可以只附最后 20 行。
- 桌面测试生成的截图文件，以及工具报告的截图路径。
- `codex --version` 输出与 `computer_use_codex_status` 全文（包括 `warnings`）。
- `computer_use_codex_status` 里应看到 `platform: "win32"`、`platformLabel: "Windows"`。

读取日志末尾 20 行的 PowerShell 示例：

```powershell
Get-Content -LiteralPath '把这里替换成返回的实际 logPath' -Tail 20
```

没有生成截图或没有返回 `logPath` 时，直接注明“未生成”或“未返回”，并保留错误结果。

## 8. 常见错误

- `output` / `schema` 相关注册错误：DSH 0.2.2-rc.2 要求每个工具声明 `output: { schema, render }`。若旧插件的 status 工具缺少该项，注册会抛错，旧顺序还会导致两个工具都不出现。请换用修复版并重启 DSH；修复版先注册主工具，再注册 status，status 失败仅记错误，不阻断主工具。
- `spawn ENOENT` / 找不到 codex：先检查 `codexBin` 路径，用第 4 节命令重新取值并确认 `Test-Path` 为 `True`。若 Windows 自测仍尝试运行 shell `fake-codex` 或 `/bin/sh`，确认已换用含 `.js` 假 CLI 分支的修复版。
- 模型 400 `model_not_found`：换成 `gpt-6-astra`，或升级 CLI；升级的是第 4 节 `codexBin` 实际指向的那份 CLI，之后重启 DSH，并重新核对模型列表。
- 桌面模式失败：核对本机 Codex 桌面能力是否可用及权限是否正常，回传完整结果、`logPath` 及日志末尾 20 行；同时记录文本模式是否成功，并与文首已实测环境对照。
- DSH 重启后工具没出现：检查 junction 是否指向正确目录、profile 的 `package.json` 中 `dependencies` 和 `dsh.profile.bundles` 两处是否都已修改，以及 `cordis.patch.yml` 的路径、缩进与条目是否正确。确认重启的是同一 `desktop` profile。
- 自测没有 `PASS`：先保存输出与退出码，区分脚本兼容性问题和真实 CLI 调用错误，再按第 6 节继续分层测试。
