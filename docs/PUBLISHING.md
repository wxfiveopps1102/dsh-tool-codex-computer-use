# 首次发布指南

面向首次发布 `dsh-tool-codex-computer-use` 的维护者。以下是待执行步骤；本文不代表已经发布或完成安装验收。已有验证记录见 [RELEASE.md](../RELEASE.md)。

## 1. 发布前核对身份与版本

- `package.json` 的 `author` 已填写为 `wx5`，`repository`、`homepage`、`bugs` 已使用 `https://github.com/wxfiveopps1102/dsh-tool-codex-computer-use` 对应地址；发布前仍须确认仓库、主页和问题反馈地址可访问。
- LICENSE 版权人已替换为 `wx5`。
- 两份 README 的作者已填写为 `wx5`，GitHub owner 已填写为 `wxfiveopps1102`，仓库名已替换为 `dsh-tool-codex-computer-use`；相关仓库地址为 `https://github.com/wxfiveopps1102/dsh-tool-codex-computer-use`。
- 确认 `package.json` 版本号与 `RELEASE.md` 一致，首次发布前均保持 `0.1.0`。
- 核对 npm 分发文件清单。当前 `files` 未包含 `RELEASE.md`、`docs/OVERVIEW.md` 和本指南；若要随包分发，需在发布前另行调整。

身份元数据与署名已补齐，其余核对事项仍须在发布前完成；不代表已经发布或完成安装验收。

## 2. 发布到 npm 与版本规则

先确认 npm 包名可用、已登录有发布权限的账号，并完成第 1 节的信息核对。在本包目录执行：

```sh
npm publish --access public
```

未发布前保持 `0.1.0`，不因文档修订提前升级版本。首次发布后按语义化版本管理：补丁版本用于兼容性修复，次版本用于兼容的新功能，稳定版本的破坏性变更提升主版本。`0.x` 阶段仍处于早期开发，应在 Release 中明确兼容性变化，并用次版本区分破坏性调整；每次发布都同步 `RELEASE.md`。

发布后再验证实际 npm 安装与加载情况；本地链接成功不能代替正式安装验收。

## 3. 建立 GitHub 仓库与 Release

按已确定的地址 `https://github.com/wxfiveopps1102/dsh-tool-codex-computer-use` 创建实际维护仓库，放入源码、双语 README、LICENSE 和发布记录，并核对已填写的包元数据。为仓库添加 `dsh-plugin` topic。

为首次发布创建对应 `0.1.0` 的版本标签与 GitHub Release。Release 说明需写清功能、已知限制及「已验证环境」：macOS 的实际版本、Codex CLI 版本、DSH 版本。macOS 具体版本应按已有验证记录填写，未记录时明确注明，不猜测。

## 4. 提交社区市场

**打 `dsh-plugin` topic ≠ 已收录。** Topic 便于发现仓库，还需按社区市场的实际流程提交 npm 包名、GitHub 仓库、功能说明和验证证据，并等待收录结果。

当前记录未提供市场地址或提交入口，提交前向市场维护方确认；不要把添加 topic 写成市场收录成功。

## 5. README 必备项清单

发布前逐项检查中英文 README；下面是要求清单，不表示当前已全部完成。

- [ ] 一句定位：在 DSH 内将一次性桌面或文本任务交给本机 Codex CLI。
- [ ] 真实截图：展示实际完成的桌面任务，使用读者可访问的图片，并清理敏感信息；仅写本机截图路径不够。
- [ ] 安装命令：提供 `dsh plugin --profile desktop add dsh-tool-codex-computer-use`，说明按实际 profile 调整；正式安装验收前明确标为待验证。
- [ ] 运行要求：macOS、Node >=20、已登录的 Codex CLI；桌面任务所需的 computer-use/browser 插件，以及相关 Codex/宿主应用的辅助功能与屏幕录制授权。
- [ ] 安全警告：默认 `securityMode=bypass`，会关闭 CLI 审批与沙箱，可直接影响桌面和文件。
- [ ] 已知限制：一次性调用、不可追问或续接会话；`ok:true` 只表示 CLI 正常退出，截图不保证生成，超时不能撤销已经发生的操作。

## 6. 首次发布建议与验证口径

先发布 `0.1.0`，只承诺 macOS。基于已有验证记录，明确写明：

> 已在 Codex CLI 0.167.2 + DSH 0.2.2-rc.2 上验证。

将这句话与实际 macOS 环境、已完成的验证项目一起列出；它不表示所有安装方式、安全模式或功能都已验证。不要写「兼容所有版本」。干净 profile 安装、保守模式 GUI 等未验证项继续如实列出，不把历史成功记录扩大为通用兼容承诺。

## 7. 常见踩坑

- **把 `bypass` 误认为安全默认。** 它是为兼容 GUI 行为保留的默认值，实际会传入 `--dangerously-bypass-approvals-and-sandbox`，关闭审批与 CLI 沙箱。无人值守时同样存在这些风险。
- **找错截图位置。** 桌面任务默认请求把截图保存在工作目录 `<cwd>/.codex-cu/`，不是固定放在插件安装目录。截图可能含敏感内容，需手动清理；提示词不保证生成截图，文本模式不创建此目录。
- **旧 CLI 不识别新模型，返回 400。** 先核对实际选中的 CLI 入口与模型目录，升级该入口对应的安装，或改用它支持的模型。只升级另一处 Codex 安装可能无效；升级后重启加载插件的进程以刷新缓存。
