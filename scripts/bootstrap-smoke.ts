import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { assert, PROJECT, VERSION } from "./distribution.ts";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-public-install-")), registry = path.join(temp, "isolated-skills");
const windows = process.platform === "win32", filename = windows ? "install.ps1" : "install.sh";
const url = `https://raw.githubusercontent.com/${PROJECT.repository}/main/bootstrap/${filename}`;
const response = await fetch(url, { signal: AbortSignal.timeout(60000) }); assert(response.ok, "Public bootstrap script unavailable");
const script = path.join(temp, filename); fs.writeFileSync(script, await response.text());
const shell = windows ? path.join(process.env.SystemRoot || "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe") : "/bin/bash";
assert(fs.existsSync(shell), "The OS-provided bootstrap shell is unavailable");
const env = { ...process.env, PATH: path.join(temp, "no-external-runtimes"), AI_AGENT: "claude" }; delete env.BUN_BE_BUN;
function invoke(offline: boolean) {
  const args = windows ? ["-NoProfile", "-File", script, "-SkillsDir", registry, "-Cwd", temp, "-Release", "v" + VERSION, ...(offline ? ["-Offline"] : [])] :
    [script, "--skills-dir", registry, "--cwd", temp, "--release", "v" + VERSION, ...(offline ? ["--offline"] : [])];
  const child = Bun.spawnSync([shell, ...args], { env, cwd: temp, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 600000 });
  assert(child.exitCode === 0, "Public bootstrap failed: " + Buffer.from(child.stderr).toString().slice(0, 1200));
  return JSON.parse(Buffer.from(child.stdout).toString());
}
try {
  const coldStarted = Date.now();
  const first = invoke(false); assert(first.status === "installed" && first.standalone && first.version === VERSION, "First public installation did not complete");
  const coldInstallMs = Date.now() - coldStarted;
  const installed = path.join(registry, "session-bridge"), receipt = fs.readFileSync(path.join(installed, "installation.json"));
  const reuseStarted = Date.now();
  const second = invoke(true); assert(second.status === "reused" && fs.readFileSync(path.join(installed, "installation.json")).equals(receipt), "Offline reuse changed the installation");
  const report = { status: "passed", version: VERSION, platform: process.platform, arch: process.arch, cold_public_install: true,
    offline_reuse: true, installation_unchanged: true, external_runtime_required: false, system_shell: windows ? "Windows PowerShell" : "Bash",
    cold_install_ms: coldInstallMs, offline_reuse_ms: Date.now() - reuseStarted };
  console.log(JSON.stringify(report));
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
