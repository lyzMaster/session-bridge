import { afterEach, beforeEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import path from "node:path";
import { installSkill, inspectInstallation, temporary, remove, readJSON, readBytes, writeNew, VERSION } from "../scripts/session-bridge.ts";

let root: string;
const source = path.resolve(import.meta.dir, "..");
const cli = path.join(source, "scripts/session-bridge.ts");
beforeEach(() => { root = fs.realpathSync(temporary(undefined, "bridge-installer-test-")); });
afterEach(() => remove(root));
function command(args: string[], markers: Record<string, string> = {}) {
  const env = { ...process.env, PATH: path.join(root, "no-system-tools") };
  for (const key of ["AI_AGENT", "CURSOR_TRACE_ID", "CURSOR_AGENT", "CURSOR_EXTENSION_HOST_ROLE", "GEMINI_CLI", "CODEX_SANDBOX", "CODEX_CI", "CODEX_THREAD_ID",
    "ANTIGRAVITY_AGENT", "AUGMENT_AGENT", "OPENCODE", "OPENCODE_CLIENT", "CLAUDECODE", "CLAUDE_CODE", "CLAUDE_CODE_IS_COWORK", "REPL_ID", "COPILOT_MODEL", "COPILOT_ALLOW_ALL", "COPILOT_GITHUB_TOKEN", "BUN_BE_BUN"]) delete env[key];
  Object.assign(env, markers);
  const p = Bun.spawnSync([process.execPath, "--no-install", cli, ...args], { cwd: root, env, stdout: "pipe", stderr: "pipe", timeout: 30000 });
  return { exit: p.exitCode, output: JSON.parse(Buffer.from(p.exitCode === 0 ? p.stdout : p.stderr).toString()) };
}

test("running harness selects its upstream project directory with no PATH tools", () => {
  for (const [markers, id, dir] of [
    [{ CODEX_THREAD_ID: "synthetic-thread" }, "codex", ".agents/skills"],
    [{ CLAUDECODE: "1" }, "claude-code", ".claude/skills"],
    [{ CURSOR_AGENT: "1" }, "cursor", ".agents/skills"],
    [{ GEMINI_CLI: "1" }, "gemini-cli", ".agents/skills"],
  ] as const) {
    const p = command(["detect-harness", "--scope", "project"], markers);
    expect(p.exit).toBe(0); expect(p.output.harness).toBe(id); expect(p.output.selection_basis).toBe("running-harness");
    expect(p.output.skills_directory).toBe(path.join(root, dir)); expect(p.output.engine.version).toBe("1.9.0");
  }
});
test("explicit harness and directory take precedence, unknown hosts do not default to Codex", () => {
  const forced = command(["detect-harness", "--scope", "project", "--harness", "claude-code"], { CODEX_THREAD_ID: "synthetic-thread" });
  expect(forced.output.harness).toBe("claude-code"); expect(forced.output.skills_directory).toBe(path.join(root, ".claude/skills"));
  const custom = command(["detect-harness", "--skills-dir", "custom-skills"], { AI_AGENT: "unknown-fixture" });
  expect(custom.output.skills_directory).toBe(path.join(root, "custom-skills"));
  const unknown = command(["install", "--scope", "project"], { AI_AGENT: "unknown-fixture" });
  expect(unknown.exit).toBe(2); expect(unknown.output.code).toBe("HARNESS_SELECTION"); expect(fs.existsSync(path.join(root, ".codex"))).toBe(false);
});
test("Cursor terminal trace alone is not evidence of a running agent", () => {
  const p = command(["detect-harness", "--scope", "project"], { CURSOR_TRACE_ID: "synthetic-terminal" });
  expect(p.output.running_harness).toBe(null);
});
test("conflicting running signals require a target, while explicit selection wins", () => {
  const markers = { GEMINI_CLI: "1", CLAUDECODE: "1" };
  const ambiguous = command(["detect-harness", "--scope", "project"], markers);
  expect(ambiguous.output.status).toBe("selection_required"); expect(ambiguous.output.selection_basis).toBe("conflicting-running-signals");
  expect(new Set(ambiguous.output.conflicting_running_harnesses)).toEqual(new Set(["gemini-cli", "claude-code"]));
  const refused = command(["install", "--scope", "project"], markers); expect(refused.output.code).toBe("HARNESS_SELECTION");
  const explicit = command(["detect-harness", "--scope", "project", "--harness", "claude-code"], markers); expect(explicit.output.harness).toBe("claude-code");
  const nested = command(["detect-harness", "--scope", "project"], { CURSOR_TRACE_ID: "synthetic-terminal", CODEX_THREAD_ID: "synthetic-thread" });
  expect(nested.output.harness).toBe("codex"); expect(nested.output.selection_basis).toBe("running-harness");
});
test("installation help succeeds without installing or selecting a harness", () => {
  const p = Bun.spawnSync([process.execPath, "--no-install", cli, "install", "--help"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  expect(p.exitCode).toBe(0); expect(Buffer.from(p.stdout).toString()).toContain("--harness"); expect(fs.readdirSync(root)).toEqual([]);
});
test("real library installs locally without fetch, then reuses without changing installed files", async () => {
  const registry = path.join(root, "skills"), fetch = globalThis.fetch; let requests = 0;
  globalThis.fetch = (() => { requests++; throw new Error("Network forbidden during local install"); }) as typeof fetch;
  try {
    const result = await installSkill(source, registry), entry = path.join(result.path, "scripts/session-bridge.ts");
    const before = fs.statSync(entry), receipt = readBytes(path.join(result.path, "installation.json"));
    const reuse = await installSkill(source, registry);
    expect(result.status).toBe("installed"); expect(reuse.status).toBe("reused"); expect(reuse.version).toBe(VERSION);
    expect(fs.statSync(entry).mtimeMs).toBe(before.mtimeMs); expect(fs.statSync(entry).ino).toBe(before.ino);
    expect(readBytes(path.join(result.path, "installation.json"))).toEqual(receipt); expect(requests).toBe(0);
    expect(readJSON(path.join(result.path, "installation.json")).engine.telemetry).toBe(false);
  } finally { globalThis.fetch = fetch; }
});
test("corrupted managed installation is backed up and repaired", async () => {
  const registry = path.join(root, "skills"), first = await installSkill(source, registry), entry = path.join(first.path, "scripts/session-bridge.ts");
  fs.appendFileSync(entry, "\nthrow new Error('synthetic corruption');\n");
  expect(inspectInstallation(first.path).usable).toBe(false);
  const repaired = await installSkill(source, registry);
  expect(repaired.status).toBe("repaired"); expect(repaired.backup).toBeTruthy();
  expect(readBytes(path.join(repaired.backup!, "scripts/session-bridge.ts")).toString()).toContain("synthetic corruption");
  expect(inspectInstallation(repaired.path).usable).toBe(true);
  fs.rmSync(path.join(repaired.path, "SKILL.md"));
  const restoredEntry = await installSkill(source, registry);
  expect(restoredEntry.status).toBe("repaired"); expect(inspectInstallation(restoredEntry.path).usable).toBe(true);
});
test("failed candidate validation preserves the healthy installation before replacement", async () => {
  const registry = path.join(root, "skills"), first = await installSkill(source, registry), candidate = path.join(root, "candidate");
  fs.cpSync(source, candidate, { recursive: true });
  fs.writeFileSync(path.join(candidate, "scripts/session-bridge.ts"), "process.exitCode=19;\n");
  const before = readBytes(path.join(first.path, "installation.json"));
  await expect(installSkill(candidate, registry, true)).rejects.toThrow();
  expect(readBytes(path.join(first.path, "installation.json"))).toEqual(before); expect(inspectInstallation(first.path).usable).toBe(true);
});
test("unrelated and linked Skill destinations remain untouched", async () => {
  const registry = path.join(root, "skills"), target = path.join(registry, "session-bridge");
  writeNew(path.join(target, "SKILL.md"), "---\nname: unrelated\ndescription: Preserve this fixture.\n---\n");
  await expect(installSkill(source, registry, true)).rejects.toThrow(); expect(readBytes(path.join(target, "SKILL.md")).toString()).toContain("unrelated");
  remove(target); fs.symlinkSync(source, target);
  await expect(installSkill(source, registry, true)).rejects.toThrow(); expect(fs.lstatSync(target).isSymbolicLink()).toBe(true);
});
test("a healthy linked installation can be reused without changing its link or target", async () => {
  const original = await installSkill(source, path.join(root, "original")), registry = path.join(root, "linked"), link = path.join(registry, "session-bridge");
  fs.mkdirSync(registry); fs.symlinkSync(original.path, link, process.platform === "win32" ? "junction" : "dir");
  const before = readBytes(path.join(original.path, "installation.json"));
  const reused = await installSkill(source, registry);
  expect(reused.status).toBe("reused"); expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
  expect(readBytes(path.join(original.path, "installation.json"))).toEqual(before);
  await expect(installSkill(source, registry, true)).rejects.toThrow();
});
