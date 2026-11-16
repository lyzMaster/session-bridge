# Standalone CLI commands

The normal distribution is one executable for the target OS/CPU. Bun, ZIP, HTTP, age-compatible encryption, Skill documents and the skills 1.9.0 API are embedded. No Bun, Node, Python, age.exe, Git, npm install or accompanying DLL is required to operate Session Bridge. Optional source distributions use `bun --no-install scripts/session-bridge.ts` instead and require Bun >=1.3.6.

## Install and verify

Windows PowerShell, in the downloaded executable's directory:

```powershell
.\session-bridge-windows-x64.exe doctor
.\session-bridge-windows-x64.exe self-test
.\session-bridge-windows-x64.exe install
```

macOS 13 or later, on either Apple Silicon or Intel:

```sh
chmod +x ./session-bridge-macos-universal
./session-bridge-macos-universal doctor
./session-bridge-macos-universal self-test
./session-bridge-macos-universal install
```

The release contains just this universal Mac executable and the Windows x64 executable; download the one for your OS. `install` detects the current harness using @vercel/detect-agent 1.2.7 and uses skills 1.9.0's installation directory rules. User/global scope is the default: current upstream examples are Codex → `~/.agents/skills/session-bridge`, Claude Code → `~/.claude/skills/session-bridge`, Cursor → `~/.cursor/skills/session-bridge`. Existing healthy Codex installs in `$CODEX_HOME/skills` or `~/.codex/skills` can also be reused. Installed executable names are `session-bridge` on macOS and `session-bridge.exe` on Windows.

Explicit directory takes precedence over harness detection. An explicit harness takes precedence over the running-agent signal. AI_AGENT is an explicit host hint; without it, conflicting strong signals (for example inherited Claude and Gemini markers) require an explicit target. With no running signal, a single installed candidate may be selected; multiple/unknown candidates cause `HARNESS_SELECTION` instead of defaulting to Codex. Preview or override:

```sh
./session-bridge-macos-universal detect-harness
./session-bridge-macos-universal install --harness claude-code
./session-bridge-macos-universal install --harness codex --scope project --cwd /project
./session-bridge-macos-universal install --skills-dir /custom/skills
./session-bridge-macos-universal install --replace
./session-bridge-macos-universal install --require-transfer-version 2
```

`install` returns `reused` when an existing compatible executable passes a local doctor check and its managed files match the integrity receipt; it does not rewrite files. A legacy native v0.3 install without a receipt can be reused after a health check. A damaged managed install is backed up and repaired. `--replace` explicitly upgrades even a healthy version. The candidate is copied/validated through the embedded skills API before touching the existing directory; replacement preserves a sibling `skill-backups/session-bridge-...` backup. A failed candidate keeps the old version. Healthy shared Skills reached through a registry link can be reused, but replacement/repair through a link and unrelated Skill folders are refused. Library operations are local-only, copy mode, telemetry disabled, with no package manager, Git or upstream lock writes.

Multipart transfers require doctor.compatibility.transfer_versions to include 2. `install --require-transfer-version 2` backs up and upgrades a healthy older installation that lacks that capability; compatible versions are still reused. Installing creates SKILL.md, references, license notices, one executable and an `installation.json` receipt. Refresh the catalog if needed, or read installed SKILL.md directly. Reuse makes no network request.

The remaining POSIX examples run inside the installed Skill folder. In PowerShell replace `./session-bridge` with `& '.\session-bridge.exe'`; pass the same arguments on one line and use Windows paths. From elsewhere use the absolute executable path. Explicitly installing creates Skill files; the executable itself needs no sidecar files.

## Prepare with automatic used-Skill collection

Minimal state: `{"goal":"Desired outcome","next_action":"Concrete next step","provenance":"source_agent_summary"}`.

```sh
./session-bridge prepare \
  --harness generic --source-session stable-session-id \
  --handoff /transfer/HANDOFF.md --state /transfer/state.json \
  --history /transfer/history.jsonl \
  --root /project --attachment /references/design.png \
  --out /transfer/staging
./session-bridge pack --staging /transfer/staging --out /transfer/task.session.zip
```

Paths are placeholders. `--root`, `--attachment`, `--skill-root` and `--skill` repeat. Use `--capture-method agent-context` for visible context only. History may be JSON/JSONL, nested tool-call arguments or a text transcript; original bytes are preserved. An arbitrary harness still needs to expose its history/files or have the agent supply them; a portable executable does not grant private-history access.

`prepare` discovers used Skills from actual reads, structured events and explicit invocations; catalogs only resolve references. Defaults search `CODEX_HOME/skills`, `~/.agents/skills`, `~/.claude/skills`, plus `.agents/skills`, `.codex/skills`, `.claude/skills` in declared projects. Repeated `--skill-root` overrides default registries. Absolute SKILL.md reads and source catalog aliases can resolve plugin Skills outside those registries.

```sh
./session-bridge discover-skills --history /transfer/history.jsonl --skill-root /path/to/host/skills
./session-bridge prepare --handoff /transfer/HANDOFF.md --state /transfer/state.json \
  --history /transfer/history.jsonl --skill-root /custom/skills \
  --skill /another/known-skill/SKILL.md --strict-skills --out /transfer/staging
```

Selected folders include SKILL.md, scripts, assets, references, agent metadata and declared cross-Skill dependencies. Recognized credentials, caches and symlinks are excluded with records; oversized/unsafe input fails. Missing/ambiguous references are reported, or fail with `--strict-skills`. Export executes no dependency/hook. Native binaries carried inside a Skill retain the source OS/CPU; use the target's installed Session Bridge executable to operate the bridge after transfer.

## Share and receive

```sh
./session-bridge share /transfer/task.session.zip \
  --provider auto --ttl provider-default --out /transfer/shared
./session-bridge receive --transfer-file /transfer/continuation-prompt.txt \
  --dest /new/recovery --skills-dir /path/to/target-harness/skills
```

Windows import example:

```powershell
& "$env:USERPROFILE\.codex\skills\session-bridge\session-bridge.exe" receive --transfer-file 'C:\handoff\continuation-prompt.txt' --dest 'C:\work\recovered'
```

Auto measures actual encrypted upload/readback to Filebin and Temp.sh from the current network, selects the first verified route, and reuses that upload. Pin a site with `--provider filebin` or `--provider tempsh`. The first part is at most 256 KiB; later parts default to at most 8 MiB with 3 workers, adapting down to 256 KiB and up to 6 workers on slow measured links. `--part-mib 1..16` and `--concurrency 1..6` override those bounds. Every part and the small manifest are age-encrypted and independently verified; only `prompt_ready` means success. Stdout omits the private identity; stderr reports safe progress without keys or URLs.

Keep the ZIP, identity and checkpoint outside future snapshots. After interruption repeat the same share command/output, or run:

```sh
./session-bridge resume-share --out /transfer/shared
./session-bridge receive --transfer-file /transfer/continuation-prompt.txt --dest /new/recovery
```

Source resume skips verified uploads and finishes accepted-but-unverified readbacks. It can also finish readback of an older `payload.session.zip.age` using its existing receipt/key without re-uploading it. Target v2 retains verified encrypted parts in `/new/recovery.session-bridge-cache` after failure and skips them next time. `--cache <private-directory>` chooses another separate cache. Success removes the managed cache; failure creates no partial recovery directory. Legacy v1 Filebin downloads also gain 256 KiB Range caches; servers without range support use the bounded, hash-checked full-object path.

Use asynchronous command execution/polling when the harness supports it. If its overall deadline kills the process, resume the same checkpoint; do not re-export, regenerate keys or edit the installed code. Native HTTP retries transient failures up to 4 times with backoff. Active reads reset a 45-second idle timer, with a separate size-aware total deadline. HTTPS, hashes and age authentication remain required.

Receive accepts `--transfer-file -` for stdin; never put the identity in process arguments. Filebin reports its expiry, commonly about seven days; Temp.sh's three-day policy is an estimate. The earliest primary-object expiry bounds a multipart transfer. Expiry/deletion cannot retract downloaded copies.

Import creates separate original evidence, editable projects and usable Skills:

```text
recovered/
  START_HERE.md
  SKILL_INDEX.md
  bundle/                         # original evidence
  workspace/r001/                 # editable project
  skills/<name>/                  # carried Skill folders
  recovery/skills.json            # requirements, provenance, hashes, links, omissions
  recovery/skills-installation.json
  recovery/path-map.json
  recovery/import-report.json
  recovery/original.session.zip
```

`--skills-dir` is optional. Without native registration the recovered Skill files/index remain usable. Registration reuses matching snapshots; conflicting installed versions stay intact and the imported set remains portable. Register later with `install-skills --dest /new/recovery`; it detects the current harness and selects its registry. The same `--harness`, `--scope`, `--cwd` or `--skills-dir` overrides apply. Providing `--skills-dir` to receive/unpack continues to register as part of import.

## Continue using carried helpers

Session Bridge can explicitly run local JavaScript/TypeScript helpers with its own embedded Bun; it does not fetch dependencies or install packages:

```sh
./session-bridge run-script /new/recovery/skills/example/scripts/helper.ts /new/recovery/workspace/r001/input.json
```

Script arguments pass through, including `--options`. Restore itself never runs scripts. Helpers importing absent packages or requiring other runtimes/native tools/MCP credentials still need those capabilities. This is not a promise to implement every carried Skill's environment.

## Inspect, revoke and test

```sh
./session-bridge verify /transfer/task.session.zip
./session-bridge unpack /transfer/task.session.zip --dest /new/recovery
./session-bridge revoke --receipt /transfer/shared/upload-receipt.json
./session-bridge revoke --receipt /transfer/shared/checkpoint.json
./session-bridge self-test
./session-bridge self-test --out /new/offline-test
./session-bridge smoke-test --live --provider auto --ttl provider-default --fixture-mib 95 --out /new/live-test
./session-bridge licenses
./session-bridge package --out /release/session-bridge-native-skill.zip
```

`self-test` checks authenticated encryption, tamper rejection, byte-preserving restore in a new process with source paths unavailable, used-Skill discovery/registration, execution of the carried helper and installation from embedded documents. It needs no network and cleans its temporary files unless `--out` is supplied. `smoke-test --live` additionally tests upload, generated prompt and fresh-process download using synthetic history/image/binary/Skills. Delete its owned test entry using the receipt. Neither test proves a transfer across two physical machines.

`package` creates an optional Skill ZIP containing this executable and embedded documents for the same OS/CPU; transferring the single executable and running `install` is sufficient. Build/test tooling and node_modules are not needed on receiving machines. Development checks: `bun run test` from the source repository.

Limits: 512 MiB ZIP, 512 MiB per expanded file, 1 GiB aggregate expansion, 10,000 entries, 8 MiB metadata and 2,048 parts. Large ZIPs automatically split into bounded encrypted objects; local ZIP building still has explicit memory/expansion limits. Empty directories, symlinks, Git index/history and ownership/ACLs are not preserved. Files/executable bits are preserved where supported; POSIX permissions are not a Windows ACL guarantee.
