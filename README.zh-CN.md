# Session Bridge

把一件正在进行的 agent 任务，带到另一台电脑、另一个 harness，继续做下去。

[English](README.md) · **简体中文** · [项目主页](https://lyzmaster.github.io/session-bridge/) · [下载与版本](https://github.com/lyzMaster/session-bridge/releases) · [安装引导](INSTALL.md) · [使用命令](session-bridge/references/commands.md)

## 给收到这个 GitHub 地址的 agent

**请先读取 [INSTALL.md](INSTALL.md)。** 检查当前 harness 中是否已有可用的 Session Bridge；可用则复用，缺失时下载、校验对应系统的单文件程序并安装。安装结果会给出 Skill 目录，读取该目录下的 `SKILL.md`，然后继续用户当前的任务。用户已给出目标时无需再次询问；仅收到地址且没有具体任务时，询问是导出当前任务还是恢复交接提示词。

Windows x64、macOS 13+（Intel / Apple Silicon）每个平台只需一个可执行文件，运行无需另装 Bun、Node、Git、Python、age 或 npm 包。目标 harness 需要具备联网、文件读写和命令执行能力。

## 一段提示词，接着工作

1. 源端整理可获得的历史、最新修正、工作文件、附件和使用过的 Skill。
2. 本地打包与 age 加密，只将密文上传到公共临时文件中转站，回读校验后生成交接提示词。
3. 目标端粘贴提示词，下载、校验、解密，在新目录恢复原始证据、工作区和 Skill，再继续任务。

交接提示词同时携带下载能力与解密私钥。请只交给接收方；主页不接收任务内容或密钥。默认用首片加密数据对 Filebin 和 Temp.sh 实测上传、回读，选择先通过校验的站点。Filebin 期限以服务响应为准，通常约七天；Temp.sh 的三天策略按估计标注。

## 安装或复用

在 SOURCE 当前会话中发送下面这段话，默认完成打包和加密上传，再生成发给 TARGET 的短提示词：

```text
请使用 https://github.com/lyzMaster/session-bridge ，按 INSTALL.md 安装或复用，缺少分片和断点恢复能力的旧版先升级。
将当前 session 的上下文、附件、工作文件和实际用过的 Skill 打包，本地加密后按当前网络实测自动选择中转站，分片上传并回读校验；中断后从原检查点继续。
成功后只输出一段发给 TARGET 的简短接续提示词：一句“恢复并继续这个任务”、项目地址和完整交接凭证（压成一行），省略安装步骤、命令和格式说明。
```

也可以从 [Releases](https://github.com/lyzMaster/session-bridge/releases/latest) 手动下载对应程序，执行 `install`。`detect-harness` 可预览目录选择，`--harness`、`--skills-dir` 可显式指定；`--scope project --cwd <项目目录>` 安装到项目。可用版本返回 `reused`，明确升级使用 `--replace`。默认选择当前 harness，不会向检测到的所有产品安装。

## 导出与恢复

```text
用 Session Bridge 导出当前任务，带上附件、工作文件和实际用过的 Skill。
本地加密后实测选择中转站、分片上传，生成可在另一台电脑继续任务的一段提示词。
```

目标端直接使用生成的提示词。它包含项目地址，因此未安装的接收方也能读取安装引导。完整参数见 [命令说明](session-bridge/references/commands.md)，覆盖范围见 [协议说明](session-bridge/references/protocol.md)。

“跨 harness”表示使用通用文件和接续说明。实际可导出内容取决于源端提供的历史与文件访问能力。隐藏推理、模型状态、活动进程和登录权限不会迁移。携带 Skill 的文件不等于安装其外部解释器、包或 MCP 服务；兼容的 JS/TS helper 可用主程序的 `run-script` 执行。

## 开发与发布

```sh
bun install --frozen-lockfile --ignore-scripts
bun run build
bun run test
bun run test:release
bun run build:standalone
```

开发使用 Bun 1.3.6；分发程序包含运行时。GitHub Actions 在 Windows 和 macOS 上构建并直接运行成品，发布前校验哈希和原生自测结果。Releases 承载程序，Pages 承载静态主页。版本清单、主页下载信息和引导脚本都指向固定版本资源。

源码采用 [MIT](LICENSE)。运行时和依赖许可通过 `licenses` 命令查看；使用了 [age-encryption](https://github.com/FiloSottile/typage)、[vercel-labs/skills](https://github.com/vercel-labs/skills) 与 [Agent Skills 格式](https://agentskills.io/specification)。
