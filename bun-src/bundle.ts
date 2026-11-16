import * as fs from "node:fs";
import path from "node:path";
import { canonical, checkPaths, exists, hash, inside, isHash, json, jsonl, LIMIT, listing, need, newDir, now, parseJSON, readBytes, readJSON, remove, sensitive, temporary, uuid, writeJSON, writeNew } from "./common.ts";
import { Entry, zipDecode, zipEncode } from "./zip.ts";
import { captureSkills, installRecoveredSkills, restoreSkills } from "./skills.ts";

const REQUIRED = ["START_HERE.md", "context/HANDOFF.md", "context/state.json", "context/references.jsonl", "history/events.jsonl", "workspace/roots.json", "workspace/files.jsonl", "reports/export.json", "reports/omissions.jsonl", "reports/source-capabilities.json", "reports/redactions.jsonl"];
export type PrepareOptions = { handoff: string; state: string; history?: string; root?: string[]; attachment?: string[];
  harness?: string; sourceSession?: string; captureMethod?: string; skillRoot?: string[]; skill?: string[]; strictSkills?: boolean; out: string };
export function prepare(options: PrepareOptions) {
  const roots = (options.root || []).map(canonical), out = canonical(options.out);
  need(new Set(roots).size === roots.length, "SCOPE", "Repeated workspace root.");
  for (const root of roots) need(fs.statSync(root).isDirectory() && !inside(root, out), "SCOPE", "Staging must be outside captured roots.");
  const handoff = readBytes(options.handoff, LIMIT.meta); new TextDecoder("utf-8", { fatal: true }).decode(handoff);
  const state = readJSON(options.state), history = options.history ? readBytes(options.history, LIMIT.meta) : null;
  need(state && typeof state.goal === "string" && typeof state.next_action === "string" && handoff.length > 0, "STATE", "Handoff and state.goal/state.next_action are required.");
  const stage = newDir(out), id = uuid(), omissions: any[] = [], refs: any[] = [], files: any[] = [], rootRows: any[] = [], events: any[] = [];
  const source = { harness: options.harness || "generic", source_session_id: options.sourceSession || uuid(), native_ids: {},
    adapter: "generic-input", adapter_version: "2", capture_method: options.captureMethod || "provided-history", capabilities_ref: "reports/source-capabilities.json" };
  let total = 0;
  const copy = (from: string, to: string) => {
    const data = readBytes(from), executable = !!(fs.statSync(from).mode & 0o111); total += data.length;
    need(total <= LIMIT.total, "LIMIT", "Captured content exceeds aggregate limit.");
    writeNew(path.join(stage, to), data, executable); return { bytes: data.length, sha256: hash(data), executable };
  };
  try {
    writeNew(path.join(stage, "context/HANDOFF.md"), handoff); writeJSON(path.join(stage, "context/state.json"), state);
    if (history) {
      const native_ref = "history/native/provided-history.bin"; writeNew(path.join(stage, native_ref), history);
      const origin = { harness: source.harness, source_session_id: source.source_session_id, record_id: hash(history), namespace: "generic-input" };
      events.push({ event_id: hash(json(origin)), origin, sequence: 0, turn_id: null, type: "source_document", role: null, timestamp: null,
        content: [{ type: "text", text: history.toString("utf8") }], native_ref, references: [], provenance: source.capture_method });
    } else omissions.push({ category: "history", status: "unavailable", reason: "No original history input supplied; handoff is a summary." });
    for (const [i, root] of roots.entries()) {
      const root_id = "r" + String(i + 1).padStart(3, "0"), scan = listing(root);
      rootRows.push({ root_id, source_path: root, snapshot_path: "workspace/trees/" + root_id });
      omissions.push(...scan.omissions.map(row => ({ ...row, category: "workspace", root_id })));
      for (const rel of scan.files) {
        const bundle_path = `workspace/trees/${root_id}/${rel}`, captured = copy(path.join(root, rel), bundle_path);
        files.push({ ...captured, root_id, relative_path: rel, bundle_path });
      }
      need(JSON.stringify(listing(root).files) === JSON.stringify(scan.files), "SOURCE_CHANGED", "Workspace file list changed during capture.");
      for (const f of files.filter(f => f.root_id === root_id)) need(hash(readBytes(path.join(root, f.relative_path))) === f.sha256, "SOURCE_CHANGED", "Workspace changed during capture.");
    }
    for (const file of options.attachment || []) {
      const data = readBytes(file), sha256 = hash(data), bundle_path = "objects/sha256/" + sha256;
      if (!exists(path.join(stage, bundle_path))) { total += data.length; need(total <= LIMIT.total, "LIMIT", "Attachments exceed aggregate limit."); writeNew(path.join(stage, bundle_path), data); }
      refs.push({ reference_id: `attachment-${refs.length + 1}`, status: "included", original_name: path.basename(file), source_path: path.resolve(file), bytes: data.length, sha256, bundle_path });
    }
    const skills = captureSkills(history?.toString("utf8") || "", stage, { roots: options.skillRoot, explicit: options.skill, workspaceRoots: roots, strict: options.strictSkills });
    omissions.push(...skills.omissions, ...skills.index.unresolved.map((e: any) => ({ ...e, category: "skill", reason: "Referenced Skill not uniquely resolved." })));
    const coverage = { history: history ? "partial" : "unknown", attachments: refs.length ? "partial" : "unknown", workspace: roots.length ? "partial" : "unknown", instructions: "unknown", skills: "evidence-based" };
    writeNew(path.join(stage, "history/events.jsonl"), jsonl(events)); writeJSON(path.join(stage, "history/index.json"), { events: events.length, search: "history/events.jsonl" });
    writeNew(path.join(stage, "context/references.jsonl"), jsonl(refs)); writeJSON(path.join(stage, "context/dependency-requirements.json"), { status: "not-installed", requirements: state.requirements || [], skill_requirements: skills.index.packaged.map((s: any) => ({ skill_id: s.skill_id, tool_requirements: s.tool_requirements, runtime_hints: s.runtime_hints })) });
    writeJSON(path.join(stage, "workspace/roots.json"), rootRows); writeNew(path.join(stage, "workspace/files.jsonl"), jsonl(files));
    writeNew(path.join(stage, "reports/omissions.jsonl"), jsonl(omissions)); writeNew(path.join(stage, "reports/redactions.jsonl"), "");
    writeJSON(path.join(stage, "reports/source-capabilities.json"), { capture_method: source.capture_method, raw_provided_history: !!history,
      native_history_pagination: "unsupported", attachment_discovery: "explicit-input-only", skills_discovery: "history-usage-evidence", checkpoint: "best_effort" });
    writeJSON(path.join(stage, "reports/export.json"), { bundle_id: id, source, coverage, checkpoint: { captured_at: now(), consistency: "best_effort" }, omissions: omissions.length, workspace_files: files.length, attachments: refs.length,
      packaged_skills: skills.index.packaged.length, unresolved_skills: skills.index.unresolved.length });
    writeNew(path.join(stage, "START_HERE.md"), "# Continue this task\n\nRead context/HANDOFF.md, context/state.json, reports/omissions.jsonl and skills/index.json.\nRead relevant bundled SKILL.md files before continuing. Skills include their scripts/resources, but tool access and runtimes must be checked locally.\nOriginal history is under history/native/. Unpacking runs no scripts or hooks.\n");
    return { status: "prepared", staging: stage, bundle_id: id, coverage, workspace_files: files.length, attachments: refs.length, packaged_skills: skills.index.packaged.map((s: any) => s.name), unresolved_skills: skills.index.unresolved };
  } catch (e) { remove(stage); throw e; }
}

export function verifyBytes(bytes: Uint8Array) {
  const entries = zipDecode(bytes);
  need([...REQUIRED, "manifest.json", "inventory.jsonl"].every(k => entries.has(k)), "BUNDLE", "Required bundle members missing.");
  const meta = (name: string) => { const data = entries.get(name)!.data; need(data.length <= LIMIT.meta, "LIMIT", "Bundle metadata is oversized."); return parseJSON(data); };
  const manifest = meta("manifest.json"), invdata = entries.get("inventory.jsonl")!.data;
  need(manifest?.format === "session-bridge" && ["1.0", "1.1"].includes(manifest.format_version) && typeof manifest.bundle_id === "string" && manifest.entrypoint === "START_HERE.md" && manifest.handoff === "context/HANDOFF.md", "VERSION", "Unsupported bundle version or entrypoint.");
  need(invdata.length <= LIMIT.meta && manifest.inventory?.path === "inventory.jsonl" && hash(invdata) === manifest.inventory.sha256, "HASH_MISMATCH", "Inventory hash mismatch.");
  const inventory = invdata.toString("utf8").split(/\r?\n/).filter(Boolean).map(parseJSON), seen = new Set<string>(); let total = 0;
  for (const row of inventory) {
    need(row && typeof row.path === "string" && !["manifest.json", "inventory.jsonl"].includes(row.path) && !seen.has(row.path) && Number.isSafeInteger(row.bytes) && row.bytes >= 0 && isHash(row.sha256) && typeof row.executable === "boolean", "BUNDLE", "Invalid inventory entry.");
    const entry = entries.get(row.path); need(entry && entry.data.length === row.bytes && hash(entry.data) === row.sha256, "HASH_MISMATCH", "Bundle member differs from inventory.");
    entry.executable = row.executable; seen.add(row.path); total += row.bytes;
  }
  need(seen.size + 2 === entries.size && inventory.length === manifest.inventory.entry_count && total === manifest.inventory.total_uncompressed_bytes && total <= LIMIT.total, "BUNDLE", "Inventory members or totals disagree.");
  if (manifest.format_version === "1.1") need(entries.has("skills/index.json") && entries.has("reports/skills.json"), "SKILLS", "Skill index missing from v1.1 bundle.");
  return { status: "verified", bundle_id: manifest.bundle_id, files: inventory.length, uncompressed_bytes: total, coverage: manifest.coverage, manifest, inventory, entries };
}
export const verify = (file: string) => verifyBytes(readBytes(file, LIMIT.archive));
export function pack(stage: string, output: string) {
  stage = canonical(stage); need(!inside(stage, canonical(output)), "SCOPE", "ZIP output must be outside staging.");
  const entries = new Map<string, Entry>(), inventory: any[] = []; let total = 0;
  const scan = listing(stage); need(scan.omissions.length === 0, "BUNDLE", "Prepared staging contains excluded or unsafe files.");
  need(REQUIRED.every(p => scan.files.includes(p)) && !scan.files.includes("manifest.json") && !scan.files.includes("inventory.jsonl"), "BUNDLE", "Invalid prepared staging directory.");
  for (const rel of scan.files.sort()) {
    const file = path.join(stage, rel), data = readBytes(file), executable = !!(fs.statSync(file).mode & 0o111);
    need(!sensitive(data), "SENSITIVE_CONTENT", "Potential private key or credential detected; redact explicitly before sharing.");
    total += data.length; need(total <= LIMIT.total, "LIMIT", "Bundle content exceeds aggregate limit.");
    entries.set(rel, { data, executable }); inventory.push({ path: rel, bytes: data.length, sha256: hash(data), executable });
  }
  const report = parseJSON(entries.get("reports/export.json")!.data), invdata = jsonl(inventory);
  const manifest = { format: "session-bridge", format_version: "1.1", bundle_id: report.bundle_id, created_at: now(), parent_bundle_id: null,
    source: report.source, coverage: report.coverage, checkpoint: report.checkpoint, scope: { history: "provided-input", workspace: "declared-roots", skills: "usage-evidence-and-declared-dependencies" },
    inventory: { path: "inventory.jsonl", sha256: hash(invdata), entry_count: inventory.length, total_uncompressed_bytes: total }, entrypoint: "START_HERE.md", handoff: "context/HANDOFF.md" };
  entries.set("inventory.jsonl", { data: invdata }); entries.set("manifest.json", { data: json(manifest) });
  const encoded = zipEncode(entries); verifyBytes(encoded); writeNew(output, encoded);
  return { status: "packed", bundle: path.resolve(output), bundle_id: manifest.bundle_id, sha256: hash(encoded), bytes: encoded.length, coverage: manifest.coverage };
}

export function unpack(file: string, destination: string, options: { skillsDir?: string } = {}) {
  // Read a single stable byte snapshot. Validation and extraction never reopen mutable external ZIP input.
  const bytes = readBytes(file, LIMIT.archive), info = verifyBytes(bytes), dest = path.resolve(destination);
  need(!exists(dest), "DEST_EXISTS", "Recovery destination already exists."); fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
  const temp = temporary(path.dirname(dest), ".bridge-restore-");
  try {
    const restored = path.join(temp, "restored"), evidence = path.join(restored, "bundle"); newDir(restored);
    for (const [rel, entry] of info.entries) {
      const target = path.join(evidence, rel); writeNew(target, entry.data, entry.executable); fs.chmodSync(target, entry.executable ? 0o500 : 0o400);
    }
    writeNew(path.join(restored, "recovery/original.session.zip"), bytes);
    const roots = readJSON(path.join(evidence, "workspace/roots.json")); need(Array.isArray(roots), "BUNDLE", "Invalid workspace roots.");
    const rootIDs = new Set<string>(), pathmap: any[] = [];
    for (const root of roots) {
      need(root && /^r[0-9]{3}$/.test(root.root_id) && !rootIDs.has(root.root_id) && root.snapshot_path === "workspace/trees/" + root.root_id, "BUNDLE", "Invalid or repeated workspace root."); rootIDs.add(root.root_id);
      const prefix = root.snapshot_path + "/", work = path.join(restored, "workspace", root.root_id); fs.mkdirSync(work, { recursive: true, mode: 0o700 });
      for (const [rel, entry] of info.entries) if (rel.startsWith(prefix)) writeNew(path.join(work, rel.slice(prefix.length)), entry.data, entry.executable);
      pathmap.push({ root_id: root.root_id, source_path: root.source_path, recovered_path: path.join(dest, "workspace", root.root_id) });
    }
    const skills = restoreSkills(evidence, restored, dest);
    writeJSON(path.join(restored, "recovery/path-map.json"), pathmap); writeJSON(path.join(restored, "recovery/skills.json"), skills);
    const skillIndex = "# Recovered skills\n\nRead relevant entrypoints before continuing. No scripts, hooks or MCP configuration were executed/applied.\n\n" + skills.packaged.map((s: any) => `- ${s.name}: [SKILL.md](skills/${s.portable_directory}/SKILL.md) — ${s.description}\n`).join("") + `\nUnresolved skill references: ${skills.unresolved.length}. See recovery/skills.json.\n`;
    writeNew(path.join(restored, "SKILL_INDEX.md"), skillIndex);
    const report = { status: "ready_with_gaps", bundle_id: info.bundle_id, archive_sha256: hash(bytes), verified_at: now(), coverage: info.coverage,
      files_verified: info.files, scripts_executed: false, handoff: path.join(dest, "bundle/context/HANDOFF.md"), workspace: pathmap,
      skills_index: path.join(dest, "SKILL_INDEX.md"), recovered_skills: skills.packaged.map((s: any) => s.name), unresolved_skills: skills.unresolved };
    writeJSON(path.join(restored, "recovery/import-report.json"), report);
    writeNew(path.join(restored, "START_HERE.md"), "# Recovered task\n\nRead bundle/context/HANDOFF.md, bundle/context/state.json, bundle/reports/omissions.jsonl and SKILL_INDEX.md.\nRead each relevant recovered SKILL.md before continuing. Skill folders contain scripts/resources; their runtimes and tool permissions are not installed automatically.\nEditable projects are in workspace/<root-id>/. Keep bundle/ as original evidence.\n");
    newDir(dest); try { for (const child of fs.readdirSync(restored)) fs.renameSync(path.join(restored, child), path.join(dest, child)); } catch (e) { remove(dest); throw e; }
    let skills_installation;
    if (options.skillsDir) skills_installation = installRecoveredSkills(dest, options.skillsDir);
    return { ...report, destination: dest, skills_installation };
  } finally { remove(temp); }
}
