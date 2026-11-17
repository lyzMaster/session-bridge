# Session Bridge

Take an ongoing agent task to another machine and another harness, and pick up right where you left off.

**English** · [简体中文](README.zh-CN.md) · [Homepage](https://lyzmaster.github.io/session-bridge/) · [Releases](https://github.com/lyzMaster/session-bridge/releases) · [Setup Guide](INSTALL.md) · [Commands](session-bridge/references/commands.md)

## For an Agent Receiving This GitHub URL

**Read [INSTALL.md](INSTALL.md) first.** Check whether a usable Session Bridge installation already exists in the current harness; reuse it if healthy, or download, verify, and install the standalone executable for this OS. The installer outputs the Skill directory—read `SKILL.md` inside it and continue with the user's current task. Do not ask again if the user has already provided a goal; if only the repository URL was given with no task, ask whether to export the current session or restore a continuation prompt.

One standalone executable each for Windows x64 and macOS 13+ (Intel / Apple Silicon)—no separate Bun, Node, Git, Python, age, or npm packages required. The target harness needs network access, file read/write, and command execution.

## One Prompt to Continue Your Work

1. The source side gathers available history, latest corrections, workspace files, attachments, and Skills that were actually used.
2. Everything is packaged and encrypted locally with age; only ciphertext is uploaded to a public temporary file relay, verified by readback, and turned into a short continuation prompt.
3. The target side pastes the prompt, downloads, verifies, and decrypts the bundle, restores the original evidence, workspace, and Skills into a new directory, and resumes the task.

The continuation prompt carries both the download capability and the decryption private key. Share it only with the recipient; the project homepage never receives task contents or keys. By default, the first encrypted chunk is probed against both Filebin and Temp.sh for upload and readback, selecting whichever passes verification first. Filebin retention follows the server response (typically ~7 days); Temp.sh uses an estimated 3-day policy.

## Install or Reuse

Send this prompt in your SOURCE session to package, encrypt, and upload by default, then generate a short prompt for TARGET:

```text
Use https://github.com/lyzMaster/session-bridge following INSTALL.md to install or reuse Session Bridge, upgrading older versions that lack multipart and checkpoint resume support.
Package the current session's context, attachments, workspace files, and Skills actually used, encrypt locally, automatically select a relay by live upload/readback probing, upload in parts with readback verification, and resume from the saved checkpoint if interrupted.
Once verified, output only a concise continuation prompt for TARGET: a line saying "Restore and continue this task", the project URL, and the complete transfer credential block (compacted onto one line), omitting install steps, commands, and format explanations.
```

You can also download the executable manually from [Releases](https://github.com/lyzMaster/session-bridge/releases/latest) and run `install`. Use `detect-harness` to preview directory selection, `--harness` or `--skills-dir` to override explicitly, and `--scope project --cwd <project-dir>` to install into a project. Healthy installations return `reused`; use `--replace` to explicitly upgrade. By default, only the current harness is targeted rather than installing into every detected product.

## Export and Restore

```text
Use Session Bridge to export the current task with attachments, workspace files, and Skills actually used.
Encrypt locally, probe and choose the fastest verified relay, upload in parts, and generate a single continuation prompt for another machine.
```

The target side uses the generated prompt directly. Because it includes the project URL, an unconfigured recipient can also read the setup guide. See [Commands](session-bridge/references/commands.md) for all flags and [Protocol](session-bridge/references/protocol.md) for coverage details.

"Cross-harness" works through portable files and handoff instructions. Actual export coverage depends on the history and file access provided by the source harness. Hidden reasoning, internal model state, active processes, and login credentials are not migrated. Carrying a Skill's files does not install its external interpreters, packages, or MCP servers; compatible JS/TS helpers can run through the main executable's `run-script` command.

## Development and Release

```sh
bun install --frozen-lockfile --ignore-scripts
bun run build
bun run test
bun run test:release
bun run build:standalone
```

Development uses Bun 1.3.6; distributed executables bundle the runtime. GitHub Actions builds and executes the standalone binaries on Windows and macOS, verifying checksums and native self-tests before publishing. Releases host the binaries and Pages hosts the static homepage. Release manifests, homepage download links, and bootstrap scripts all point to pinned versioned assets.

Source code is licensed under [MIT](LICENSE). View runtime and dependency notices via the `licenses` command; built with [age-encryption](https://github.com/FiloSottile/typage), [vercel-labs/skills](https://github.com/vercel-labs/skills), and the [Agent Skills specification](https://agentskills.io/specification).
