import * as fs from "node:fs";
import path from "node:path";
import { installSkills } from "skills";
import { BridgeError, exists, hash, json, LIMIT, listing, need, now, parseJSON, readBytes, readJSON, remove, temporary, uuid, writeJSON, writeNew } from "./common.ts";
import { skillMetadata } from "./skills.ts";
import { STANDALONE } from "./runtime.ts";
import { resolveInstallTarget, SKILLS_ENGINE, TargetOptions } from "./harness.ts";

const RECEIPT = "installation.json";
function ownedInstallation(root: string) {
  if (fs.lstatSync(root).isSymbolicLink() || !fs.statSync(root).isDirectory()) return false;
  try { const r = readJSON(path.join(root, RECEIPT)); if (r?.format === "session-bridge-installation" && r.receipt_version === 1) return true; } catch {}
  try { return skillMetadata(path.join(root, "SKILL.md")).name === "session-bridge"; } catch { return false; }
}
function snapshot(root: string) {
  const scan = listing(root); need(!scan.omissions.length, "INSTALL", "Skill distribution contains excluded or linked files.");
  return scan.files.filter(p => p !== RECEIPT).sort().map(rel => ({ path: rel, bytes: fs.statSync(path.join(root, rel)).size,
    sha256: hash(readBytes(path.join(root, rel))), executable: process.platform !== "win32" && !!(fs.statSync(path.join(root, rel)).mode & 0o111) }));
}
function executableAt(root: string): { path: string; native: boolean } | null {
  const native = path.join(root, process.platform === "win32" ? "session-bridge.exe" : "session-bridge");
  if (exists(native)) return { path: native, native: true };
  const script = path.join(root, "scripts/session-bridge.ts");
  return !STANDALONE && exists(script) ? { path: script, native: false } : null;
}
function health(root: string) {
  try {
    // A registry may link an existing shared Skill. Health checking/reuse is read-only;
    // replacement still refuses links through ownedInstallation().
    need(fs.statSync(root).isDirectory(), "INSTALL", "Expected a Skill directory.");
    need(skillMetadata(path.join(root, "SKILL.md")).name === "session-bridge", "INSTALL", "Unexpected Skill identity.");
    const exe = executableAt(root); need(exe && fs.lstatSync(exe.path).isFile(), "INSTALL", "Compatible executable is missing.");
    const rows = snapshot(root); let receipt: any = null;
    if (exists(path.join(root, RECEIPT))) {
      receipt = readJSON(path.join(root, RECEIPT));
      need(receipt?.format === "session-bridge-installation" && receipt.receipt_version === 1 && receipt.platform === process.platform &&
        hash(json(receipt.files)) === hash(json(rows)), "INSTALL", "Installed files differ from the installation receipt.");
    }
    // The local installed program is explicitly being considered for reuse. Do not use a PATH
    // Node/Bun. Source-mode installations run through our current Bun; native ones run directly.
    const cmd = exe.native ? [exe.path, "doctor"] : [process.execPath, "--no-install", exe.path, "doctor"];
    const env = { ...process.env }; delete env.BUN_BE_BUN;
    const child = Bun.spawnSync(cmd, { env, cwd: root, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 15000 });
    need(child.exitCode === 0 && child.stdout.length <= LIMIT.meta, "INSTALL", "Installed executable failed its health check.");
    const doctor = parseJSON(child.stdout);
    const compatibility = doctor?.compatibility;
    const compatible = compatibility ? compatibility.transfer_versions?.includes(1) && compatibility.read_bundle_versions?.includes("1.1") &&
      compatibility.installation_receipt_version === 1 : /^0\.3\.[0-9]+$/.test(doctor?.version || "");
    need(doctor?.ready === true && (!STANDALONE || doctor.standalone === true) && typeof doctor.version === "string" &&
      /^\d+\.\d+\.\d+$/.test(doctor.version) && compatible && doctor.crypto_format === "age-v1-x25519" && doctor.age_install_required === false,
      "INSTALL", "Installed executable is incompatible or requires an external runtime.");
    return { usable: true, version: doctor.version, standalone: exe.native, files: rows.length, executable: exe.path,
      integrity: receipt ? "receipt-verified" : "legacy-health-checked", receipt };
  } catch { return { usable: false }; }
}

export function inspectInstallation(root: string) { return health(path.resolve(root)); }
function reusedResult(root: string, previous: ReturnType<typeof health>, context: any = {}) {
  return { status: "reused", path: root, version: previous.version, standalone: previous.standalone,
    executable: previous.executable, integrity: previous.integrity, usable: true, backup: null, dependencies: previous.standalone ? [] : ["Bun >=1.3.6"],
    npm_install_required: false, python_required: false, age_install_required: false, engine: SKILLS_ENGINE, ...context };
}
export async function installSkill(source: string, skillsDir: string, replace = false, context: any = {}) {
  source = path.resolve(source);
  need(skillMetadata(path.join(source, "SKILL.md")).name === "session-bridge", "INSTALL", "Unexpected distribution identity.");
  const parent = path.resolve(skillsDir), target = path.join(parent, "session-bridge"), previous = exists(target) ? health(target) : null;
  if (previous?.usable && !replace) return reusedResult(target, previous, context);
  if (exists(target)) need(ownedInstallation(target), "DEST_EXISTS", "Destination belongs to another or linked Skill; choose a different skills directory.");
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const tmp = temporary(parent, ".session-bridge-install-"), input = path.join(tmp, "input/session-bridge"), workspace = path.join(tmp, "engine");
  let backup: string | null = null, committed = false;
  try {
    const rows = snapshot(source); need(!rows.some(f => /\.pyc?$/.test(f.path)), "INSTALL", "Session Bridge distribution must not include Python implementations.");
    for (const row of rows) writeNew(path.join(input, row.path), readBytes(path.join(source, row.path)), row.executable);
    // Only local embedded material enters this API: no Git/SSH, prompts, network, lock files,
    // telemetry or global settings. Upstream owns parsing/copying; we commit transactionally.
    const upstream = await installSkills(input, { cwd: workspace, skills: ["session-bridge"], agents: ["universal"], scope: "project", mode: "copy",
      telemetry: false, lockfile: false, duplicates: "error", symlinks: "reject" });
    need(upstream.failed.length === 0 && upstream.installed.length === 1, "INSTALL", "Embedded skills installer did not produce one complete Skill.");
    const stage = path.resolve(upstream.installed[0].path), expected = path.join(workspace, ".agents/skills/session-bridge");
    need(stage === expected && hash(json(snapshot(stage))) === hash(json(rows)), "INSTALL", "Staged Skill differs from source distribution.");
    const stagedHealth = health(stage); need(stagedHealth.usable, "INSTALL", "Staged executable failed validation; existing installation is retained.");
    const receipt = { format: "session-bridge-installation", receipt_version: 1, version: stagedHealth.version, installed_at: now(),
      platform: process.platform, arch: process.arch, files: rows, engine: SKILLS_ENGINE, ...context };
    writeJSON(path.join(stage, RECEIPT), receipt);
    if (exists(target)) {
      const backups = path.resolve(parent, "..", "skill-backups"); fs.mkdirSync(backups, { recursive: true, mode: 0o700 });
      backup = path.join(backups, "session-bridge-" + Date.now() + "-" + uuid().slice(0, 8)); fs.renameSync(target, backup);
    }
    fs.renameSync(stage, target); committed = true;
    return { status: previous?.usable ? "upgraded" : previous ? "repaired" : "installed", version: stagedHealth.version, path: target, backup,
      files: rows.length + 1, standalone: stagedHealth.standalone, dependencies: stagedHealth.standalone ? [] : ["Bun >=1.3.6"],
      npm_install_required: false, python_required: false, age_install_required: false, engine: SKILLS_ENGINE, ...context };
  } catch (e) {
    if (committed) remove(target);
    if (backup && !exists(target)) fs.renameSync(backup, target);
    if (e instanceof BridgeError) throw e;
    throw new BridgeError("INSTALL", "Local installation failed; the existing installation and backup were preserved.");
  } finally { remove(tmp); }
}

export async function installForHarness(source: string | ((directory: string, context: any) => Promise<any>), options: TargetOptions & { replace?: boolean } = {}) {
  const target = await resolveInstallTarget(options);
  let directory = target.skills_directory!;
  const context = { harness: target.harness, scope: target.scope, selection_basis: target.selection_basis };
  for (const dir of target.candidate_directories) {
    const existing = path.join(dir, "session-bridge");
    if (!exists(existing)) continue;
    directory = dir;
    if (!options.replace) { const check = health(existing); if (check.usable) return reusedResult(existing, check, context); }
    break;
  }
  // Resolve and reuse before materializing the embedded binary. A repeat install needs no
  // download, temporary executable copy, directory write or package-manager invocation.
  return typeof source === "function" ? source(directory, context) : installSkill(source, directory, !!options.replace, context);
}
