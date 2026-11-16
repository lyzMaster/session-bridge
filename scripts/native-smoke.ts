import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { assert, ROOT, VERSION } from "./distribution.ts";

const target = process.platform === "win32" ? "windows-x64" : "macos-universal";
const output = path.join(ROOT, `dist/standalone-${VERSION}`), manifest = JSON.parse(fs.readFileSync(path.join(output, "manifest.json"), "utf8"));
const artifact = manifest.artifacts.find((a: any) => a.target === target); assert(artifact, "Native artifact not found");
const executable = path.join(output, artifact.file), temp = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-native-"));
const env = { ...process.env, PATH: path.join(temp, "no-external-tools"), AI_AGENT: "claude" };
delete env.BUN_BE_BUN;
const checks: string[] = [];
function run(args: string[], expected = 0) {
  const p = Bun.spawnSync([executable, ...args], { cwd: temp, env, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 180000 });
  assert(p.exitCode === expected, `Native command failed (${args[0]}): ${Buffer.from(p.stderr).toString().slice(0, 400)}`);
  return JSON.parse(Buffer.from(expected === 0 ? p.stdout : p.stderr).toString());
}
try {
  const doctor = run(["doctor"]); assert(doctor.ready && doctor.standalone && doctor.version === VERSION && !doctor.bun_install_required, "Native runtime is not self-contained"); checks.push("standalone_doctor");
  const targetInfo = run(["detect-harness", "--scope", "project"]); assert(targetInfo.harness === "claude-code", "Harness was not detected"); checks.push("current_harness_detected");
  const first = run(["install", "--scope", "project"]); assert(first.status === "installed" && first.harness === "claude-code", "Native installation failed");
  const installed = path.join(first.path, process.platform === "win32" ? "session-bridge.exe" : "session-bridge"), stat = fs.statSync(installed);
  const receipt = fs.readFileSync(path.join(first.path, "installation.json"));
  const second = run(["install", "--scope", "project"]); assert(second.status === "reused" && fs.statSync(installed).mtimeMs === stat.mtimeMs &&
    fs.readFileSync(path.join(first.path, "installation.json")).equals(receipt), "Healthy installation was changed"); checks.push("install_and_readonly_reuse");
  fs.appendFileSync(path.join(first.path, "references/commands.md"), "\nSynthetic modification\n");
  const repaired = run(["install", "--scope", "project"]); assert(repaired.status === "repaired" && fs.existsSync(repaired.backup), "Managed installation was not backed up and repaired"); checks.push("backup_and_repair");
  const explicit = run(["install", "--scope", "project", "--harness", "codex"]); assert(explicit.harness === "codex" && explicit.path.includes(".agents"), "Explicit harness override failed"); checks.push("explicit_harness");
  const restored = run(["self-test"]); assert(restored.status === "passed" && restored.installed_skill_reused && restored.recovered_skill_executed && !restored.network_used && restored.multipart_roundtrip && restored.multipart_upload_resume, "Native recovery self-test failed"); checks.push("encryption_recovery_and_carried_skill", "multipart_recovery_and_upload_resume");
  const report = { status: "passed", version: VERSION, platform: process.platform, arch: process.arch, standalone: true,
    external_runtime_required: false, checks, tested_at: new Date().toISOString() };
  fs.writeFileSync(path.join(output, "native-verification.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
