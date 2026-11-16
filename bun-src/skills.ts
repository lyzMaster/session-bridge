import * as fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { canonical, exists, hash, inside, json, LIMIT, listing, need, readBytes, remove, sensitive, temporary, treeHash, writeNew, writeJSON } from "./common.ts";

export function skillMetadata(file: string) {
  const text = readBytes(file, LIMIT.meta).toString("utf8"), match = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  need(match, "SKILL_METADATA", "Skill lacks YAML frontmatter.");
  let meta: any; try { meta = Bun.YAML.parse(match[1]); } catch { need(false, "SKILL_METADATA", "Invalid Skill frontmatter."); }
  need(meta && typeof meta.name === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(meta.name) && typeof meta.description === "string" && meta.description.length > 0,
    "SKILL_METADATA", "Skill requires a portable name and description.");
  return { name: meta.name as string, description: meta.description as string, text };
}
type Evidence = { spec: string; kind: string; source: string };
export type SkillOptions = { roots?: string[]; explicit?: string[]; workspaceRoots?: string[]; strict?: boolean };

function historyValues(text: string): { documents: any[]; texts: string[]; structured: boolean } {
  // Native histories often contain JSON encoded inside tool arguments. Decode only bounded input.
  const documents: any[] = []; let structured = false;
  try { documents.push(JSON.parse(text)); structured = true; } catch {
    const lines = text.split(/\r?\n/).filter(x => x.trim());
    if (lines.length && lines.every(line => { try { JSON.parse(line); return true; } catch { return false; } })) {
      documents.push(...lines.map(line => JSON.parse(line))); structured = true;
    }
  }
  const texts = [text];
  function strings(v: any, depth = 0) {
    if (depth > 32) return;
    if (typeof v === "string") { texts.push(v); if (/^\s*[\[{]/.test(v)) try { strings(JSON.parse(v), depth + 1); } catch {} }
    else if (v && typeof v === "object") for (const x of Object.values(v)) strings(x, depth + 1);
  }
  documents.forEach(x => strings(x)); return { documents, texts, structured };
}
function pathsIn(text: string, literalPath = false): string[] {
  const found: string[] = [], quoted: [number, number][] = [];
  if (literalPath && /SKILL\.md$/.test(text)) return [text];
  // Quoted absolute Windows/POSIX paths, aliases and relative paths; spaces in quotes survive.
  for (const m of text.matchAll(/(["'`])([^"'`\r\n]*?SKILL\.md)\1/g)) {
    found.push(m[2]); quoted.push([m.index!, m.index! + m[0].length]);
  }
  // Do not manufacture suffix paths from a quoted filename containing spaces.
  for (const m of text.matchAll(/(?:[A-Za-z]:[\\/]|\/(?!\/)|\br\d+\/|\.\.?\/)[^\s"'`<>]*?SKILL\.md/g))
    if (!quoted.some(([a, b]) => m.index! >= a && m.index! < b)) found.push(m[0]);
  return [...new Set(found)];
}
function toolStrings(value: any, key = "", depth = 0): { text: string; literalPath: boolean }[] {
  if (depth > 32) return [];
  if (typeof value === "string") {
    // Parse serialized tool arguments into their actual values. JSON's wrapping quotes
    // are serialization, not shell quoting around a file path or a whole command.
    if (/^\s*[\[{]/.test(value)) try { return toolStrings(JSON.parse(value), key, depth + 1); } catch {}
    return [{ text: value, literalPath: /^(?:file_?path|path|filename|file_name|file)$/i.test(key) }];
  }
  if (Array.isArray(value)) return value.flatMap(v => toolStrings(v, key, depth + 1));
  return value && typeof value === "object" ? Object.entries(value).flatMap(([k, v]) => toolStrings(v, k, depth + 1)) : [];
}
function invocations(text: string): string[] { return [...text.matchAll(/\$([a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?)\b/g)].map(m => m[1]); }
export function discoverSkills(history: string, options: SkillOptions = {}) {
  const { documents, texts, structured } = historyValues(history), evidence: Evidence[] = [];
  const aliases = new Map<string, string>(), catalog = new Map<string, Set<string>>();
  const addCatalog = (name: string, file: string) => { if (!catalog.has(name)) catalog.set(name, new Set()); catalog.get(name)!.add(file); };
  for (const text of texts) {
    for (const m of text.matchAll(/`?(r\d+)`?\s*=\s*`?((?:\/|[A-Za-z]:[\\/])[^`\r\n]+)/g)) aliases.set(m[1], m[2].trim());
  }
  const expand = (s: string) => {
    const m = s.match(/^(r\d+)\/(.*)$/); if (m && aliases.has(m[1])) return path.join(aliases.get(m[1])!, m[2]);
    return s.startsWith("~/") ? path.join(os.homedir(), s.slice(2)) : s;
  };
  for (const text of texts) for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*-\s+(.+?):\s+.*?\(file:\s*([^)]*SKILL\.md)\)/);
    if (m) addCatalog(m[1].replace(/^\$/, ""), expand(m[2].trim()));
  }
  const defaultRoots = [path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "skills"),
    path.join(os.homedir(), ".agents/skills"), path.join(os.homedir(), ".claude/skills"),
    ...(options.workspaceRoots || []).flatMap(p => [".agents/skills", ".codex/skills", ".claude/skills"].map(s => path.join(p, s)))];
  // Explicit roots deliberately replace defaults, useful for isolated tests or a non-Codex host.
  const roots = [...new Set((options.roots?.length ? options.roots : defaultRoots).filter(exists).map(canonical))];
  const scanned = new Set<string>();
  function scan(dir: string, depth = 0) {
    if (depth > 4) return;
    const real = canonical(dir); if (scanned.has(real)) return; scanned.add(real);
    const file = path.join(dir, "SKILL.md");
    if (exists(file)) { try { const meta = skillMetadata(canonical(file)); addCatalog(meta.name, canonical(file)); } catch {} return; }
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git"].includes(item.name)) continue;
      const candidate = path.join(dir, item.name);
      if (item.isDirectory()) scan(candidate, depth + 1);
      else if (item.isSymbolicLink() && exists(path.join(candidate, "SKILL.md"))) {
        try { const entry = canonical(path.join(candidate, "SKILL.md")); addCatalog(skillMetadata(entry).name, entry); } catch {}
      }
    }
  }
  for (const root of roots) if (fs.statSync(root).isDirectory()) scan(root);
  const add = (spec: string, kind: string, source: string) => evidence.push({ spec, kind, source });
  function walk(v: any, depth = 0) {
    if (!v || typeof v !== "object" || depth > 32) return;
    const type = String(v.type || v.event || ""), name = String(v.name || v.tool || v.tool_name || "");
    if (v.type === "function" && v.function && typeof v.function.name === "string") walk({ type: "function_call", name: v.function.name, arguments: v.function.arguments }, depth + 1);
    if (/^(skill_use|skill_used|skill_invocation)$/.test(type) || /^(use_skill|load_skill|skill)$/i.test(name)) {
      let arg = v.arguments || v.input || v;
      if (typeof arg === "string") try { arg = JSON.parse(arg); } catch {}
      const spec = arg?.skill_path || arg?.path || v.skill_path || arg?.skill_name || arg?.skill || v.skill_name || arg?.name;
      if (typeof spec === "string") add(spec, "structured_skill_use", "history");
    }
    const isTool = /^(function_call|tool_call|tool_use)$/.test(type) || (v.role === "assistant" && v.tool_calls);
    if (isTool && name) {
      const arg = v.arguments ?? v.input ?? v.parameters ?? v.command ?? {};
      // Read tools and shell execution carry concrete file-access evidence. Merely listed tools do not.
      if (/exec_command|read_file|read_text|readfile|^read$|^bash$|shell|functions\.exec|^exec$|terminal/i.test(name)) {
        for (const value of toolStrings(arg)) for (const spec of pathsIn(value.text, value.literalPath)) add(spec, "tool_skill_file_access", "history");
      }
    }
    if ((v.role === "user" || v.role === "assistant" || type === "message") && !isTool) {
      let body = v.content ?? v.text ?? v.message ?? "";
      const visibleText = (v: any): string => typeof v === "string" ? v : Array.isArray(v) ? v.map(visibleText).join("\n") : v && typeof v.text === "string" ? v.text : v?.content ? visibleText(v.content) : "";
      body = visibleText(body).replace(/<skills_instructions>[\s\S]*?<\/skills_instructions>/g, "").split(/\r?\n/).filter((line: string) => !/^\s*-.*\(file:.*SKILL\.md\)/.test(line)).join("\n");
      for (const spec of invocations(body)) add(spec, "explicit_invocation", "history");
    }
    for (const x of Object.values(v)) {
      if (typeof x === "object") walk(x, depth + 1);
      else if (typeof x === "string" && /^\s*[\[{]/.test(x)) try { walk(JSON.parse(x), depth + 1); } catch {}
    }
  }
  documents.forEach(x => walk(x));
  if (!structured) {
    const withoutCatalog = history.replace(/<skills_instructions>[\s\S]*?<\/skills_instructions>/g, "").split(/\r?\n/).filter(l => !/^\s*-.*\(file:.*SKILL\.md\)/.test(l));
    for (const line of withoutCatalog) {
      if (/(?:\bcat\s|\bsed\s|\bhead\s|\bread_file\b|\bread_text\b)/.test(line)) for (const spec of pathsIn(line)) add(spec, "text_file_read_evidence", "history");
      for (const spec of invocations(line)) add(spec, "explicit_invocation", "history");
    }
  }
  for (const spec of options.explicit || []) add(spec, "explicit_include", "cli");
  const unresolved: any[] = [], selected = new Map<string, any>(), queue = [...evidence];
  for (let n = 0; n < queue.length; n++) {
    need(queue.length <= 1024 && selected.size <= LIMIT.skills, "LIMIT", "Skill dependency graph exceeds limits.");
    const e = queue[n], spec = expand(e.spec.trim()); let candidates: string[] = [];
    if (path.isAbsolute(spec) || spec.startsWith("./") || spec.startsWith("../")) {
      const file = spec.endsWith("SKILL.md") ? spec : path.join(spec, "SKILL.md");
      if (exists(file)) candidates = [canonical(file)];
    } else candidates = [...(catalog.get(spec) || [])].map(expand).filter(p => path.isAbsolute(p) && exists(p)).map(canonical);
    candidates = [...new Set(candidates)];
    if (candidates.length !== 1) { unresolved.push({ ...e, status: candidates.length ? "ambiguous" : "missing", candidates }); continue; }
    const file = candidates[0], root = path.dirname(file);
    if (selected.has(root)) { selected.get(root).evidence.push(e); continue; }
    try {
      need(path.basename(file) === "SKILL.md", "SKILL_METADATA", "Skill entry must be SKILL.md.");
      const meta = skillMetadata(file);
      const item: any = { name: meta.name, description: meta.description, source_path: root, evidence: [e] };
      selected.set(root, item);
      for (const m of meta.text.matchAll(/\]\(([^)\s]+SKILL\.md)(?:#[^)]*)?\)/g)) {
        if (!/^[a-z]+:\/\//i.test(m[1])) queue.push({ spec: path.resolve(root, m[1]), kind: "declared_skill_dependency", source: meta.name });
      }
      for (const name of invocations(meta.text)) if (name !== meta.name) queue.push({ spec: name, kind: "declared_skill_dependency", source: meta.name });
    } catch { selected.delete(root); unresolved.push({ ...e, status: "invalid_skill", candidates }); }
  }
  const uniqueUnresolved = [...new Map(unresolved.map(e => [JSON.stringify(e), e])).values()];
  need(!options.strict || uniqueUnresolved.length === 0, "SKILLS_MISSING", "Referenced skills are missing or ambiguous; see discovery with non-strict mode.");
  return { selected: [...selected.values()], unresolved: uniqueUnresolved, evidence, roots,
    coverage: "evidence-based-not-exhaustive", catalog_is_usage: false };
}

export function captureSkills(history: string, stage: string, options: SkillOptions = {}) {
  const found = discoverSkills(history, options), packaged: any[] = [], omissions: any[] = [];
  for (const selected of found.selected) {
    const root = selected.source_path, scan = listing(root), captured = scan.files.sort().map(rel => {
      const file = path.join(root, rel), data = readBytes(file), executable = !!(fs.statSync(file).mode & 0o111);
      need(!sensitive(data), "SENSITIVE_CONTENT", "Detected credential content in a referenced Skill; redact explicitly before export.");
      return { rel, data, executable, sha256: hash(data) };
    });
    const tree_hash = hash(json(captured.map(f => ({ path: f.rel, sha256: f.sha256, executable: f.executable }))));
    const skill_id = selected.name + "--" + tree_hash.slice(0, 12), bundle_path = "skills/packages/" + skill_id;
    const identical = packaged.find(p => p.skill_id === skill_id);
    if (identical) { identical.evidence.push(...selected.evidence); identical.source_paths.push(root); continue; }
    for (const file of captured) writeNew(path.join(stage, bundle_path, file.rel), file.data, file.executable);
    // Reject a skill modified during capture, rather than silently mixing its versions.
    need(treeHash(root) === tree_hash, "SOURCE_CHANGED", "Skill changed during capture.");
    omissions.push(...scan.omissions.map(o => ({ ...o, category: "skill", skill_id })));
    let tools: any = [];
    const config = captured.find(f => f.rel === "agents/openai.yaml");
    if (config) try { tools = (Bun.YAML.parse(config.data.toString("utf8")) as any)?.dependencies?.tools || []; } catch { tools = [{ status: "config_parse_failed" }]; }
    const runtime_hints = [...new Set(captured.flatMap(f => f.rel.endsWith(".py") ? ["python3"] : /\.[cm]?[jt]s$/.test(f.rel) ? ["bun-or-node"] : f.rel.endsWith(".sh") ? ["shell"] : []))];
    packaged.push({ ...selected, source_paths: [root], skill_id, bundle_path, tree_hash, files: captured.length, runtime_hints,
      omissions: scan.omissions.length, completeness: scan.omissions.length ? "partial" : "captured-folder",
      tool_requirements: tools, scripts_executed: false });
  }
  const index = { format_version: "1.0", discovery: "usage-evidence-and-declared-dependencies", coverage: found.coverage,
    packaged, unresolved: found.unresolved, catalog_is_usage: false };
  writeJSON(path.join(stage, "skills/index.json"), index);
  writeJSON(path.join(stage, "reports/skills.json"), { ...index, roots_searched: found.roots });
  return { index, omissions };
}

export function restoreSkills(evidenceDir: string, recoveryRoot: string, finalRoot: string) {
  const indexPath = path.join(evidenceDir, "skills/index.json");
  if (!exists(indexPath)) return { packaged: [], unresolved: [], legacy_bundle: true };
  const index = JSON.parse(readBytes(indexPath, LIMIT.meta).toString("utf8"));
  need(Array.isArray(index.packaged) && index.packaged.length <= LIMIT.skills && Array.isArray(index.unresolved), "SKILLS", "Invalid bundled Skill index.");
  const restored: any[] = [], names = new Map<string, number>();
  for (const item of index.packaged) names.set(item.name, (names.get(item.name) || 0) + 1);
  for (const item of index.packaged) {
    need(typeof item.name === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(item.name) && /^[a-z0-9-]+--[a-f0-9]{12}$/.test(item.skill_id) && item.bundle_path === "skills/packages/" + item.skill_id, "SKILLS", "Invalid bundled Skill path.");
    const portable_directory = names.get(item.name) === 1 ? item.name : item.skill_id;
    const source = path.join(evidenceDir, item.bundle_path), target = path.join(recoveryRoot, "skills", portable_directory);
    need(skillMetadata(path.join(source, "SKILL.md")).name === item.name && treeHash(source) === item.tree_hash, "SKILLS", "Bundled Skill metadata or tree hash does not match.");
    need(!exists(target), "SKILLS", "Repeated Skill identity.");
    for (const rel of listing(source).files) writeNew(path.join(target, rel), readBytes(path.join(source, rel)), !!(fs.statSync(path.join(source, rel)).mode & 0o111));
    restored.push({ ...item, portable_directory, recovered_path: path.join(finalRoot, "skills", portable_directory), status: "portable_ready" });
  }
  // Repair only Markdown cross-Skill links in the working copies. Original evidence and
  // scripts remain byte-identical; retain a relocation log and both original/working hashes.
  const relocations: any[] = [];
  for (const skill of restored) {
    const target = path.join(recoveryRoot, "skills", skill.portable_directory);
    const native = /^(?:[A-Za-z]:[\\/]|\\\\)/.test(skill.source_path) ? path.win32 : path.posix;
    const key = (p: string) => native === path.win32 ? native.normalize(p).toLowerCase() : native.normalize(p);
    const lookup = new Map(restored.map(s => [key(native.join(s.source_path, "SKILL.md")), s]));
    for (const rel of listing(target).files.filter(f => f.endsWith(".md"))) {
      const file = path.join(target, rel), before = readBytes(file).toString("utf8");
      const after = before.replace(/\]\(([^)]+)\)/g, (whole, href) => {
        const stripped = String(href).replace(/^<|>$/g, ""); if (/^[a-z]+:\/\//i.test(stripped)) return whole;
        const [raw, anchor = ""] = stripped.split("#"); let decoded: string; try { decoded = decodeURIComponent(raw); } catch { return whole; }
        const original = native.resolve(skill.source_path, ...rel.split("/").slice(0, -1), decoded), dependency = lookup.get(key(original));
        if (!dependency) return whole;
        const replacement = path.relative(path.dirname(file), path.join(recoveryRoot, "skills", dependency.portable_directory, "SKILL.md")).split(path.sep).join("/") + (anchor ? "#" + anchor : "");
        if (replacement === href) return whole;
        relocations.push({ skill_id: skill.skill_id, file: rel, from: href, to: replacement }); return `](${replacement})`;
      });
      if (after !== before) fs.writeFileSync(file, after);
    }
    skill.portable_tree_hash = treeHash(target);
  }
  return { ...index, packaged: restored, markdown_relocations: relocations, scripts_executed: false, configuration_applied: false };
}

export function installRecoveredSkills(recoveryRoot: string, skillsDir: string) {
  const report = JSON.parse(readBytes(path.join(recoveryRoot, "recovery/skills.json"), LIMIT.meta).toString("utf8"));
  const results: any[] = [], dir = path.resolve(skillsDir); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  need(Array.isArray(report.packaged) && report.packaged.length <= LIMIT.skills, "SKILLS", "Invalid recovered Skill registry.");
  for (const s of report.packaged) need(s && typeof s.name === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(s.name) && typeof s.portable_directory === "string" && /^[a-z0-9-]+$/.test(s.portable_directory) && /^[a-f0-9]{64}$/.test(s.portable_tree_hash), "SKILLS", "Invalid recovered Skill identity.");
  const sameTree = (p: string, expected: string) => exists(p) && !fs.lstatSync(p).isSymbolicLink() && fs.statSync(p).isDirectory() && treeHash(p) === expected;
  const names = new Map<string, number>(); for (const s of report.packaged) names.set(s.name, (names.get(s.name) || 0) + 1);
  const conflicts = report.packaged.filter((s: any) => names.get(s.name)! > 1 || (exists(path.join(dir, s.name)) &&
    !sameTree(path.join(dir, s.name), s.portable_tree_hash)));
  for (const skill of report.packaged) {
    need(/^[a-z0-9-]+$/.test(skill.portable_directory) && /^[a-z0-9][a-z0-9-]{0,63}$/.test(skill.name), "SKILLS", "Invalid recovered Skill path.");
    const target = path.join(dir, skill.name), source = path.join(recoveryRoot, "skills", skill.portable_directory);
    need(treeHash(source) === skill.portable_tree_hash, "SKILLS", "Recovered Skill changed before registration.");
    if (conflicts.length) { results.push({ name: skill.name, path: target, status: conflicts.some((s: any) => s.name === skill.name) ? "conflict_preserved" : "dependency_conflict_use_portable_paths" }); continue; }
    if (exists(target)) { results.push({ name: skill.name, path: target, status: "existing_identical" }); continue; }
    let created = false;
    try {
      fs.mkdirSync(target, { mode: 0o700 }); created = true;
      for (const rel of listing(source).files) writeNew(path.join(target, rel), readBytes(path.join(source, rel)), !!(fs.statSync(path.join(source, rel)).mode & 0o111));
      results.push({ name: skill.name, path: target, status: "installed" });
    } catch (e) { if (created) remove(target); throw e; }
  }
  const installation = { skills_directory: dir, results, scripts_executed: false };
  // Both import-time and later explicit registration persist the same current report.
  const temp = temporary(path.join(recoveryRoot, "recovery"), ".skills-install-report-");
  try { const file = path.join(temp, "report.json"); writeJSON(file, installation); fs.renameSync(file, path.join(recoveryRoot, "recovery/skills-installation.json")); }
  finally { remove(temp); }
  return installation;
}
