#!/usr/bin/env bun
import * as fs from "node:fs";
import path from "node:path";
import * as common from "./common.ts";
import * as bundle from "./bundle.ts";
import * as relay from "./relay.ts";
import { discoverSkills, installRecoveredSkills, skillMetadata } from "./skills.ts";
import { zipEncode, zipDecode, Entry } from "./zip.ts";
import { STANDALONE, selfCommand, executeScript } from "./runtime.ts";
import { materializeDistribution } from "./distribution.ts";
import { EMBEDDED_FILES } from "./embedded.ts";
import { installSkill, installForHarness } from "./installer.ts";
import { detectHarness, resolveInstallTarget, SKILLS_ENGINE } from "./harness.ts";
const { BridgeError, exists, hash, json, LIMIT, listing, need, newDir, parseJSON, readBytes, readJSON, remove, temporary, uuid, VERSION, writeJSON, writeNew } = common;

export * from "./common.ts";
export * from "./bundle.ts";
export * from "./relay.ts";
export * from "./skills.ts";
export * from "./zip.ts";
export * from "./runtime.ts";
export * from "./installer.ts";
export * from "./harness.ts";

export async function currentDistribution<T>(operation: (source: string) => T | Promise<T>): Promise<T> {
  const tmp = temporary();
  try { return await operation(materializeDistribution(path.join(tmp, "session-bridge"), import.meta.url)); }
  finally { remove(tmp); }
}
export function packageSkill(source: string, output: string) {
  need(!common.inside(source, output), "SCOPE", "Package output must be outside Skill directory.");
  const scan = listing(source); need(!scan.files.some(f => f.endsWith(".py") || f.endsWith(".pyc")), "PACKAGE", "Python file in Bun distribution.");
  const entries = new Map<string, Entry>();
  for (const rel of scan.files) entries.set("session-bridge/" + rel, { data: readBytes(path.join(source, rel)), executable: !!(fs.statSync(path.join(source, rel)).mode & 0o111) });
  const bytes = zipEncode(entries); zipDecode(bytes); writeNew(output, bytes); writeNew(output + ".sha256", hash(bytes) + "  " + path.basename(output) + "\n");
  return { version: VERSION, archive: path.resolve(output), sha256: hash(bytes), bytes: bytes.length, files: scan.files.length, python_files: 0 };
}

export function syntheticFixture(root: string) {
  const work = path.join(root, "project"), skillRoot = path.join(root, "fixture-skills"); newDir(work);
  writeJSON(path.join(work, "numbers.json"), { numbers: [2, 3, 5] }); writeNew(path.join(work, "notes.txt"), "非敏感 Bun 接续测试。\n");
  writeNew(path.join(work, "blob.bin"), Buffer.from(Array.from({ length: 1024 }, (_, i) => i % 256)));
  writeNew(path.join(work, "do-not-run.ts"), 'throw new Error("Do not run project hooks during restore");\n');
  const image = path.join(root, "pixel.png"); writeNew(image, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCz8AAAAASUVORK5CYII=", "base64"));
  const skill = path.join(skillRoot, "sum-skill"), unused = path.join(skillRoot, "unused-skill");
  writeNew(path.join(skill, "SKILL.md"), "---\nname: sum-skill\ndescription: Sum a JSON array and write plain integer output.\n---\n\nRead assets/output-format.txt. Run scripts/sum.ts with the input and output paths.\n");
  writeNew(path.join(skill, "assets/output-format.txt"), "Output only an integer and a newline.\n");
  writeNew(path.join(skill, "scripts/sum.ts"), 'const input=await Bun.file(process.argv[2]).json(); await Bun.write(process.argv[3],String(input.numbers.reduce((a:number,b:number)=>a+b,0))+"\\n");\n');
  writeNew(path.join(unused, "SKILL.md"), "---\nname: unused-skill\ndescription: Catalog-only fixture; must not be bundled.\n---\nNo usage.\n");
  const history = path.join(root, "history.jsonl"); writeNew(history, common.jsonl([
    { role: "developer", content: `Available skills:\n- sum-skill: arithmetic (file: ${skill}/SKILL.md)\n- unused-skill: unused (file: ${unused}/SKILL.md)` },
    { type: "function_call", name: "exec_command", arguments: JSON.stringify({ cmd: `cat '${skill}/SKILL.md'` }) },
    { role: "user", content: "Write the sum of numbers.json to answer.txt. Latest correction: plain integer text, not JSON." },
  ]));
  const handoff = path.join(root, "HANDOFF.md"), state = path.join(root, "state.json");
  writeNew(handoff, "# 非敏感测试\n\n目标：使用历史中读过的 sum-skill 计算 numbers.json 并写 answer.txt。\n最新修正：只写整数和换行；期望 10。原输入准备完毕，计算未完成。不要运行 do-not-run.ts。\n");
  writeJSON(state, { goal: "Use recovered sum-skill to compute answer.txt", next_action: "Read the bundled skill and execute its helper against restored workspace.", provenance: "synthetic-fixture" });
  return { handoff, state, history, root: [work], attachment: [image], skillRoot: [skillRoot], harness: "synthetic-bun", sourceSession: "synthetic-bun-session", out: path.join(root, "staging") };
}
export async function smokeTest(output: string, provider: string, ttl: string, live: boolean) {
  need(live, "AUTHORIZATION", "Public upload test requires --live and uses only synthetic data.");
  const root = newDir(output), source = path.join(root, "source"); newDir(source); const options = syntheticFixture(source);
  const prepared = bundle.prepare(options), archive = path.join(root, "synthetic.session.zip"); bundle.pack(prepared.staging, archive);
  const shared = await relay.share(archive, provider, ttl, path.join(root, "transfer"));
  fs.renameSync(source, path.join(root, "source-offline"));
  const dest = path.join(root, "received"), registry = path.join(root, "target-harness/skills"), cwd = newDir(path.join(root, "recipient-process"));
  const child = Bun.spawn(selfCommand(["receive", "--transfer-file", shared.prompt_file, "--dest", dest, "--skills-dir", registry], import.meta.url), { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  need(exit === 0, "TEST", "Fresh receiving process failed; no real session was uploaded.");
  const key = relay.parseTransfer(readBytes(shared.prompt_file, LIMIT.transfer).toString("utf8")).identity; need(!stdout.includes(key) && !stderr.includes(key), "TEST", "Recipient diagnostics exposed key.");
  const result = parseJSON(stdout), skillReport = readJSON(path.join(dest, "recovery/skills.json"));
  need(skillReport.packaged.length === 1 && skillReport.packaged[0].name === "sum-skill", "TEST", "Usage discovery packaged wrong Skill set.");
  for (const rel of listing(path.join(root, "source-offline/project")).files) need(hash(readBytes(path.join(root, "source-offline/project", rel))) === hash(readBytes(path.join(dest, "workspace/r001", rel))), "TEST", "Workspace bytes differ.");
  const reference = parseJSON(readBytes(path.join(dest, "bundle/context/references.jsonl")).toString("utf8").trim());
  need(hash(readBytes(path.join(root, "source-offline/pixel.png"))) === hash(readBytes(path.join(dest, "bundle", reference.bundle_path))), "TEST", "Attachment bytes differ.");
  // Explicit continuation action after recovery, using the automatically installed carried Skill.
  executeScript(path.join(registry, "sum-skill/scripts/sum.ts"), [path.join(dest, "workspace/r001/numbers.json"), path.join(dest, "workspace/r001/answer.txt")]);
  need(readBytes(path.join(dest, "workspace/r001/answer.txt")).toString() === "10\n", "TEST", "Recovered Skill could not continue the task.");
  const report = { status: "passed", version: VERSION, tested_at: common.now(), provider, bundle_id: shared.bundle_id, ciphertext_bytes: shared.ciphertext_bytes,
    ciphertext_sha256: shared.ciphertext_sha256, reported_expires_at: shared.reported_expires_at, prompt_file: shared.prompt_file,
    source_paths_unavailable: true, fresh_recipient_process: true, workspace_bytes_match: true, attachment_bytes_match: true,
    usage_discovered_skill: "sum-skill", catalog_only_skill_excluded: true, recovered_skill_installed: true, recovered_skill_executed_after_restore: true,
    continuation_result: "10\n", restore_executed_scripts: false, standalone: STANDALONE, platform: process.platform, arch: process.arch,
    required_external_tools: [], two_physical_machines_tested: false, destination: result.destination };
  writeJSON(path.join(root, "live-test-report.json"), report); return report;
}

export async function selfTest(output?: string) {
  const root = output ? newDir(output) : temporary(undefined, "session-bridge-self-test-"), source = newDir(path.join(root, "source"));
  try {
    const options = syntheticFixture(source), prepared = bundle.prepare(options), archive = path.join(root, "fixture.zip");
    bundle.pack(prepared.staging, archive);
    const cipher = path.join(root, "fixture.age"), identity = await relay.encrypt(archive, cipher), plain = path.join(root, "decrypted.zip");
    await relay.decrypt(cipher, identity, plain);
    need(hash(readBytes(archive, LIMIT.archive)) === hash(readBytes(plain, LIMIT.archive)), "TEST", "Encryption round trip differs.");
    const modified = readBytes(cipher, LIMIT.archive); modified[modified.length - 1] ^= 1;
    const tampered = path.join(root, "tampered.age"), rejected = path.join(root, "must-not-exist.zip"); writeNew(tampered, modified);
    let refused = false; try { await relay.decrypt(tampered, identity, rejected); } catch { refused = true; }
    need(refused && !exists(rejected), "TEST", "Modified ciphertext was not rejected atomically.");
    fs.renameSync(source, path.join(root, "source-offline"));
    const dest = path.join(root, "received"), registry = path.join(root, "target-harness/skills"), cwd = newDir(path.join(root, "recipient-process"));
    const child = Bun.spawn(selfCommand(["unpack", plain, "--dest", dest, "--skills-dir", registry], import.meta.url), { cwd, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    need(exit === 0 && !stdout.includes(identity) && !stderr.includes(identity), "TEST", "Fresh receiving process failed or exposed identity.");
    const report = readJSON(path.join(dest, "recovery/skills.json"));
    need(report.packaged.length === 1 && report.packaged[0].name === "sum-skill", "TEST", "Skill usage discovery differs.");
    for (const rel of listing(path.join(root, "source-offline/project")).files)
      need(hash(readBytes(path.join(root, "source-offline/project", rel))) === hash(readBytes(path.join(dest, "workspace/r001", rel))), "TEST", "Workspace bytes differ.");
    const attachment = parseJSON(readBytes(path.join(dest, "bundle/context/references.jsonl")).toString("utf8").trim());
    need(hash(readBytes(path.join(root, "source-offline/pixel.png"))) === hash(readBytes(path.join(dest, "bundle", attachment.bundle_path))), "TEST", "Attachment bytes differ.");
    executeScript(path.join(registry, "sum-skill/scripts/sum.ts"), [path.join(dest, "workspace/r001/numbers.json"), path.join(dest, "workspace/r001/answer.txt")]);
    need(readBytes(path.join(dest, "workspace/r001/answer.txt")).toString() === "10\n", "TEST", "Carried Skill could not continue the task.");
    const installed = await currentDistribution(dist => installSkill(dist, path.join(root, "installation/skills")));
    const reused = await currentDistribution(dist => installSkill(dist, path.join(root, "installation/skills")));
    need(reused.status === "reused", "TEST", "Usable installation was not reused.");
    const command = STANDALONE ? [path.join(installed.path, process.platform === "win32" ? "session-bridge.exe" : "session-bridge"), "doctor"] :
      [process.execPath, "--no-install", path.join(installed.path, "scripts/session-bridge.ts"), "doctor"];
    const check = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" });
    need(check.exitCode === 0 && parseJSON(check.stdout).ready, "TEST", "Installed Skill is not self-contained.");
    const result = { status: "passed", version: VERSION, standalone: STANDALONE, platform: process.platform, arch: process.arch,
      encryption_roundtrip: true, tamper_rejected_without_plaintext: true, source_paths_unavailable: true, fresh_recipient_process: true,
      workspace_bytes_match: true, attachment_bytes_match: true, only_used_skill_packaged: true, recovered_skill_executed: true,
      continuation_result: "10\n", embedded_skill_installed_and_ran: true, installed_skill_reused: true, skills_engine: SKILLS_ENGINE,
      network_used: false, required_external_tools: [], output: output ? root : null };
    if (output) writeJSON(path.join(root, "self-test-report.json"), result);
    return result;
  } finally { if (!output) remove(root); }
}

function argumentsFor(argv: string[]) {
  const allowed = new Set(["handoff", "state", "history", "root", "attachment", "harness", "scope", "cwd", "source-session", "capture-method", "skill-root", "skill", "strict-skills", "out", "staging", "dest", "skills-dir", "transfer-file", "provider", "ttl", "receipt", "replace", "live", "source"]);
  const multiple = new Set(["root", "attachment", "skill-root", "skill"]), boolean = new Set(["strict-skills", "replace", "live"]), values: any = {}, positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]; if (!arg.startsWith("--")) { positionals.push(arg); continue; }
    const [key, ...parts] = arg.slice(2).split("="); need(allowed.has(key), "ARGUMENT", "Unknown command option.");
    const value = boolean.has(key) ? true : parts.length ? parts.join("=") : argv[++i];
    need(value !== undefined && (typeof value !== "string" || !value.startsWith("--")), "ARGUMENT", "Option value missing.");
    const name = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (multiple.has(key)) (values[name] ||= []).push(value); else { need(!Object.hasOwn(values, name), "ARGUMENT", "Repeated scalar option."); values[name] = value; }
  }
  return { values, positionals };
}
export async function main(argv = Bun.argv.slice(2)) {
  process.umask(0o077); const command = argv.shift();
  if (!command || ["--help", "help", "-h"].includes(command)) { console.log("Session Bridge " + VERSION + (STANDALONE ? " (standalone, no external runtime)" : " (bundled Bun source)") +
    "\nCommands: doctor, detect-harness, prepare, pack, verify, unpack, share, receive, revoke, discover-skills, install-skills, install, package, self-test, smoke-test, run-script, licenses" +
    "\nRun: " + (STANDALONE ? path.basename(process.execPath) : "bun --no-install scripts/session-bridge.ts") + " <command> [options]\ninstall writes the embedded Skill and a copy of this CLI; see references/commands.md."); return 0; }
  if (command === "--version") { console.log(VERSION); return 0; }
  if (["install", "detect-harness", "install-skills"].includes(command) && argv.some(a => ["--help", "-h"].includes(a))) {
    console.log("Usage: " + command + (command === "install-skills" ? " --dest <recovery-directory>" : "") +
      " [--harness <id>] [--skills-dir <directory>] [--scope global|project] [--cwd <project>]" + (command === "install" ? " [--replace] [--source <local-skill>]" : "") +
      "\nDefault: detect the current harness and use user/global scope. A healthy installation is reused; --replace explicitly upgrades it." +
      "\nExplicit directory and harness override detection. Conflicting/unknown running signals need an explicit target. detect-harness never writes files."); return 0;
  }
  try {
    if (command === "licenses") { console.log(EMBEDDED_FILES["THIRD_PARTY_LICENSES.txt"]); return 0; }
    if (command === "run-script") { if (argv[0] === "--") argv.shift(); need(argv.length > 0, "ARGUMENT", "Expected a local JavaScript/TypeScript script path."); executeScript(argv[0], argv.slice(1), true); return 0; }
    const { values: v, positionals: p } = argumentsFor(argv), required = (...names: string[]) => names.forEach(n => need(typeof v[n] === "string", "ARGUMENT", "Required option missing: " + n));
    let result: any;
    switch (command) {
      case "doctor": result = { ...relay.doctor(), skills_engine: SKILLS_ENGINE,
        compatibility: { transfer_versions: [1], read_bundle_versions: ["1.0", "1.1"], installation_receipt_version: 1 } }; break;
      case "detect-harness": result = await detectHarness(v); break;
      case "prepare": required("handoff", "state", "out"); result = bundle.prepare(v); break;
      case "pack": required("staging", "out"); result = bundle.pack(v.staging, v.out); break;
      case "verify": need(p.length === 1, "ARGUMENT", "Expected a bundle path."); { const i = bundle.verify(p[0]); result = { status: i.status, bundle_id: i.bundle_id, files: i.files, coverage: i.coverage }; } break;
      case "unpack": required("dest"); need(p.length === 1, "ARGUMENT", "Expected a bundle path."); result = bundle.unpack(p[0], v.dest, v); break;
      case "share": required("provider", "ttl", "out"); need(p.length === 1, "ARGUMENT", "Expected a bundle path."); result = await relay.share(p[0], v.provider, v.ttl, v.out); break;
      case "receive": required("transferFile", "dest"); { const text = v.transferFile === "-" ? await Bun.stdin.text() : readBytes(v.transferFile, LIMIT.transfer).toString("utf8"); result = await relay.receive(text, v.dest, v); } break;
      case "revoke": required("receipt"); result = await relay.revoke(v.receipt); break;
      case "discover-skills": required("history"); result = discoverSkills(readBytes(v.history, LIMIT.meta).toString("utf8"), { roots: v.skillRoot, explicit: v.skill, strict: v.strictSkills }); break;
      case "install-skills": required("dest"); { const target = await resolveInstallTarget(v); result = { ...installRecoveredSkills(path.resolve(v.dest), target.skills_directory!), harness: target.harness, selection_basis: target.selection_basis }; } break;
      case "install": result = v.source ? await installForHarness(v.source, v) : await installForHarness((directory, context) =>
        currentDistribution(source => installSkill(source, directory, !!v.replace, context)), v); break;
      case "package": required("out"); result = v.source ? packageSkill(v.source, v.out) : await currentDistribution(source => packageSkill(source, v.out)); break;
      case "self-test": result = await selfTest(v.out); break;
      case "smoke-test": required("out", "provider", "ttl"); result = await smokeTest(v.out, v.provider, v.ttl, !!v.live); break;
      default: throw new BridgeError("ARGUMENT", "Unknown command.");
    }
    console.log(json(result).toString("utf8")); return 0;
  } catch (e) {
    const known = e instanceof BridgeError; console.error(JSON.stringify({ status: "error", code: known ? e.code : "INPUT_OR_IO", message: known ? e.message : "Input, runtime or filesystem operation failed." })); return 2;
  }
}
if (import.meta.main) process.exitCode = await main();
