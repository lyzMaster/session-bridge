import { afterEach, beforeEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { prepare, pack, verify, verifyBytes, unpack, zipEncode, zipDecode, readBytes, readJSON,
  writeNew, writeJSON, hash, checkPaths, sensitive, temporary, remove, discoverSkills,
  syntheticFixture, installRecoveredSkills, installSkill, encrypt, decrypt, download,
  upload, validateURL, parseJSON, parseTransfer, renderPrompt, LIMIT, Entry, main } from "../scripts/session-bridge.ts";

let root: string, options: ReturnType<typeof syntheticFixture>;
beforeEach(() => { root = temporary(); options = syntheticFixture(root); });
afterEach(() => remove(root));
const archive = () => { const p = prepare(options); const output = path.join(root, "task.zip"); pack(p.staging, output); return output; };
const addSkill = (name: string, content = "") => {
  const p = path.join(root, "fixture-skills", name); writeNew(path.join(p, "SKILL.md"), `---\nname: ${name}\ndescription: Synthetic ${name}\n---\n${content}\n`); return p;
};

test("Bun roundtrip preserves original history, binary, image, evidence and executable bit", () => {
  writeNew(path.join(root, "project/tool.sh"), "#!/bin/sh\nexit 31\n", true);
  const source = archive(), dest = path.join(root, "recovered"); fs.renameSync(path.join(root, "project"), path.join(root, "source-offline"));
  const result = unpack(source, dest); expect(result.recovered_skills).toEqual(["sum-skill"]);
  expect(hash(readBytes(path.join(dest, "recovery/original.session.zip"), LIMIT.archive))).toBe(hash(readBytes(source, LIMIT.archive)));
  for (const name of ["numbers.json", "notes.txt", "blob.bin", "tool.sh"]) expect(readBytes(path.join(dest, "workspace/r001", name))).toEqual(readBytes(path.join(root, "source-offline", name)));
  expect(fs.statSync(path.join(dest, "workspace/r001/tool.sh")).mode & 0o100).toBeTruthy();
  expect(readBytes(path.join(dest, "bundle/history/native/provided-history.bin"))).toEqual(readBytes(options.history));
  expect(readJSON(path.join(dest, "recovery/import-report.json")).scripts_executed).toBe(false);
});
test("available catalog alone never counts as Skill usage", () => {
  const text = readBytes(options.history).toString().split("\n")[0];
  const found = discoverSkills(text, { roots: options.skillRoot }); expect(found.selected).toHaveLength(0);
});
test("dollar-prefixed Skill names inside a rich-text catalog are still not usage", () => {
  const text = `Available skills:\n- $sum-skill: catalog only (file: ${options.skillRoot[0]}/sum-skill/SKILL.md)`;
  const h = { type: "message", role: "developer", content: [{ type: "text", text }] };
  expect(discoverSkills(JSON.stringify(h), { roots: options.skillRoot }).selected).toHaveLength(0);
  const invoked = [h, { role: "user", content: "Use $sum-skill for this task" }];
  expect(discoverSkills(JSON.stringify(invoked), { roots: options.skillRoot }).selected.map(s => s.name)).toEqual(["sum-skill"]);
});
test("actual read and structured Skill events are discovered", () => {
  const text = readBytes(options.history).toString(); expect(discoverSkills(text, { roots: options.skillRoot }).selected.map(s => s.name)).toEqual(["sum-skill"]);
  const found = discoverSkills(JSON.stringify({ type: "skill_use", name: "sum-skill" }), { roots: options.skillRoot }); expect(found.selected[0].name).toBe("sum-skill");
});
test("common OpenAI/Anthropic and Skill tool records are recognized", () => {
  const p = path.join(root, "fixture-skills/sum-skill/SKILL.md");
  const records = [
    { role: "assistant", tool_calls: [{ id: "call-1", type: "function", function: { name: "exec_command", arguments: JSON.stringify({ cmd: `cat '${p}'` }) } }] },
    { role: "assistant", content: [{ type: "tool_use", name: "Read", input: { file_path: p } }] },
    { type: "tool_use", name: "Skill", input: { skill: "sum-skill" } },
  ];
  for (const event of records) expect(discoverSkills(JSON.stringify(event), { roots: options.skillRoot }).selected.map(s => s.name)).toEqual(["sum-skill"]);
});
test("single-word invocation and catalog alias resolve without packaging unused catalog", () => {
  addSkill("animation"); const base = options.skillRoot[0];
  const text = `Skill roots:\n- \`r0\` = \`${base}\`\n- animation: fixture (file: r0/animation/SKILL.md)\nUse $animation now.`;
  const found = discoverSkills(text, { roots: [base] }); expect(found.selected.map(s => s.name)).toEqual(["animation"]);
});
test("nested tool arguments with quoted paths containing spaces are discovered", () => {
  const p = path.join(root, "folder with spaces"); writeNew(path.join(p, "SKILL.md"), "---\nname: space-skill\ndescription: Test path.\n---\n");
  const text = JSON.stringify({ type: "response_item", payload: { type: "function_call", name: "exec_command", arguments: JSON.stringify({ cmd: `cat '${p}/SKILL.md'` }) } });
  const result = discoverSkills(text, { roots: options.skillRoot, strict: true });
  expect(result.selected[0].name).toBe("space-skill"); expect(result.unresolved).toEqual([]);
});
test("tool JSON quoting never turns an absolute shell command into a Skill path", () => {
  const p = path.join(root, "fixture-skills/sum-skill/SKILL.md");
  for (const cmd of [`/bin/cat ${p}`, `cat ${p}`, `/usr/bin/head -n 20 '${p}'`]) {
    const event = { type: "function_call", name: "exec_command", arguments: JSON.stringify({ cmd }) };
    const result = discoverSkills(JSON.stringify(event), { roots: options.skillRoot, strict: true });
    expect(result.selected.map(s => s.name)).toEqual(["sum-skill"]); expect(result.unresolved).toEqual([]);
  }
});
test("structured Read paths preserve spaces and nested exec code preserves quoted reads", () => {
  const skill = path.join(root, "my skills/word counter"), file = path.join(skill, "SKILL.md");
  writeNew(file, "---\nname: word-counter\ndescription: Synthetic text counter.\n---\n");
  const events = [
    { type: "tool_use", name: "Read", input: { file_path: file } },
    { type: "function_call", name: "functions.exec", arguments: JSON.stringify({ code: `const result = await tools.exec_command({cmd: "cat '${file}'"});` }) },
  ];
  for (const event of events) {
    const result = discoverSkills(JSON.stringify(event), { roots: options.skillRoot, strict: true });
    expect(result.selected.map(s => s.name)).toEqual(["word-counter"]); expect(result.unresolved).toEqual([]);
  }
});
test("missing skill is explicit, strict discovery fails", () => {
  const text = JSON.stringify({ role: "user", content: "Use $missing-skill" });
  expect(discoverSkills(text, { roots: options.skillRoot }).unresolved[0].status).toBe("missing");
  expect(() => discoverSkills(text, { roots: options.skillRoot, strict: true })).toThrow();
});
test("duplicate names are ambiguous, not silently selected", () => {
  const extra = path.join(root, "another/sum-skill"); writeNew(path.join(extra, "SKILL.md"), "---\nname: sum-skill\ndescription: Other implementation.\n---\nOther\n");
  const result = discoverSkills(JSON.stringify({ role: "user", content: "Use $sum-skill" }), { roots: [options.skillRoot[0], path.join(root, "another")] });
  expect(result.selected).toHaveLength(0); expect(result.unresolved[0].status).toBe("ambiguous");
});
test("host registries with symlinked Skill folders resolve actual used Skill", () => {
  const actual = path.join(root, "outside-registry/linked-skill"); writeNew(path.join(actual, "SKILL.md"), "---\nname: linked-skill\ndescription: Symlinked installation fixture.\n---\n");
  fs.symlinkSync(actual, path.join(root, "fixture-skills/linked-skill"));
  const found = discoverSkills(JSON.stringify({ role: "user", content: "Use $linked-skill" }), { roots: options.skillRoot });
  expect(found.selected.map(s => s.name)).toEqual(["linked-skill"]);
});
test("Skill files include scripts/assets, ignore credentials with explicit omissions", () => {
  const skill = path.join(root, "fixture-skills/sum-skill"); writeNew(path.join(skill, ".env"), "SECRET=excluded");
  const a = archive(), entries = verify(a).entries; const index = parseJSON(entries.get("skills/index.json")!.data), s = index.packaged[0];
  expect(entries.has(s.bundle_path + "/scripts/sum.ts")).toBe(true); expect(entries.has(s.bundle_path + "/assets/output-format.txt")).toBe(true);
  expect(entries.has(s.bundle_path + "/.env")).toBe(false); expect(s.completeness).toBe("partial");
});
test("declared Skill closure and cycles preserve readable cross-Skill links", () => {
  addSkill("base-skill", "[other](../sum-skill/SKILL.md)");
  fs.appendFileSync(path.join(root, "fixture-skills/sum-skill/SKILL.md"), "\nRead [base](../base-skill/SKILL.md).\n");
  const dest = path.join(root, "recovered"); const result = unpack(archive(), dest, { skillsDir: path.join(root, "target-skills") });
  expect(new Set(result.recovered_skills)).toEqual(new Set(["base-skill", "sum-skill"]));
  expect(fs.existsSync(path.join(dest, "skills/base-skill/SKILL.md"))).toBe(true);
  expect(readBytes(path.join(dest, "skills/sum-skill/SKILL.md")).toString()).toContain("../base-skill/SKILL.md");
});
test("Skill working copies relocate cross-links when folder and metadata names differ", () => {
  const dir = path.join(root, "fixture-skills/different-folder"); writeNew(path.join(dir, "SKILL.md"), "---\nname: actual-skill\ndescription: Different source folder.\n---\n");
  fs.appendFileSync(path.join(root, "fixture-skills/sum-skill/SKILL.md"), "\nRead [dependency](../different-folder/SKILL.md).\n");
  const dest = path.join(root, "recovered"); unpack(archive(), dest);
  expect(readBytes(path.join(dest, "skills/sum-skill/SKILL.md")).toString()).toContain("../actual-skill/SKILL.md");
  const index = readJSON(path.join(dest, "recovery/skills.json")); expect(index.markdown_relocations).toHaveLength(1);
  const item = index.packaged.find((s: any) => s.name === "sum-skill");
  expect(readBytes(path.join(dest, "bundle", item.bundle_path, "SKILL.md")).toString()).toContain("../different-folder/SKILL.md");
});
test("recovered Skill registration is idempotent and helper actually runs", () => {
  const dest = path.join(root, "recovered"), registry = path.join(root, "registry"); unpack(archive(), dest);
  const first = installRecoveredSkills(dest, registry); expect(first.results[0].status).toBe("installed");
  expect(readJSON(path.join(dest, "recovery/skills-installation.json"))).toEqual(first);
  const again = installRecoveredSkills(dest, registry); expect(again.results[0].status).toBe("existing_identical");
  expect(readJSON(path.join(dest, "recovery/skills-installation.json"))).toEqual(again);
  const child = Bun.spawnSync([process.execPath, "--no-install", path.join(registry, "sum-skill/scripts/sum.ts"), path.join(dest, "workspace/r001/numbers.json"), path.join(dest, "workspace/r001/answer.txt")]);
  expect(child.exitCode).toBe(0); expect(readBytes(path.join(dest, "workspace/r001/answer.txt")).toString()).toBe("10\n");
});
test("different installed version is preserved, portable version stays usable", () => {
  const dest = path.join(root, "recovered"), registry = path.join(root, "registry");
  writeNew(path.join(registry, "sum-skill/SKILL.md"), "Existing version, do not overwrite.\n");
  const result = unpack(archive(), dest, { skillsDir: registry });
  expect(result.skills_installation.results[0].status).toBe("conflict_preserved");
  expect(readBytes(path.join(registry, "sum-skill/SKILL.md")).toString()).toBe("Existing version, do not overwrite.\n");
  expect(fs.existsSync(path.join(dest, "skills/sum-skill/scripts/sum.ts"))).toBe(true);
});
test("exact duplicate Skill versions deduplicate folder bytes", () => {
  const p = path.join(root, "copy-skill"); fs.cpSync(path.join(root, "fixture-skills/sum-skill"), p, { recursive: true });
  (options as any).skill = [path.join(p, "SKILL.md")]; const result = prepare(options);
  expect(result.packaged_skills).toEqual(["sum-skill"]);
});
test("symbolic links and secret names in workspace are excluded with records", () => {
  writeNew(path.join(root, "project/.env"), "secret"); fs.symlinkSync(path.join(root, "state.json"), path.join(root, "project/link"));
  const p = prepare(options); const omissions = readBytes(path.join(p.staging, "reports/omissions.jsonl")).toString(); expect(omissions).toContain('"reason":"symlink"'); expect(omissions).toContain("credential-filename");
});
test("archive traversal, aliases, special names and existing outputs are refused", () => {
  for (const paths of [["../escape"], ["/absolute"], ["a\\b"], ["A/x", "a/y"], ["a", "a/b"], ["CON.txt"]]) expect(() => checkPaths(paths)).toThrow();
  const bad = zipEncode(new Map([["../escape", { data: Buffer.from("no") }]]), false); expect(() => verifyBytes(bad)).toThrow();
  const dest = path.join(root, "existing"); fs.mkdirSync(dest); writeNew(path.join(dest, "keep"), "keep"); expect(() => unpack(archive(), dest)).toThrow(); expect(readBytes(path.join(dest, "keep")).toString()).toBe("keep");
});
test("post-CRC tampered payload and inventory mismatch are rejected", () => {
  const a = archive(), entries = zipDecode(readBytes(a, LIMIT.archive)); entries.set("context/HANDOFF.md", { data: Buffer.from("tampered") }); expect(() => verifyBytes(zipEncode(entries))).toThrow();
  const bytes = readBytes(a, LIMIT.archive); bytes[40] ^= 0xff; expect(() => verifyBytes(bytes)).toThrow();
});
test("duplicate JSON fields and invalid metadata fail", () => {
  expect(() => parseJSON('{"a":1,"a":2}')).toThrow(); expect(() => parseJSON("1e999")).toThrow(); expect(() => parseJSON('{"a":]')).toThrow();
  expect(() => prepare({ ...options, out: path.join(root, "project/staging") })).toThrow();
});
test("recognized credentials prevent packaging, not silently redacted", () => {
  const p = prepare(options); const key = "AGE-SECRET-KEY-" + "1" + "A".repeat(58); writeNew(path.join(p.staging, "secret.txt"), key);
  expect(sensitive(Buffer.from(key))).toBe(true); expect(() => pack(p.staging, path.join(root, "bad.zip"))).toThrow();
});
test("embedded age encryption rejects wrong identity and truncation atomically", async () => {
  const a = archive(), encrypted = path.join(root, "a.age"), identity = await encrypt(a, encrypted), plain = path.join(root, "plain.zip");
  await decrypt(encrypted, identity, plain); expect(hash(readBytes(a, LIMIT.archive))).toBe(hash(readBytes(plain, LIMIT.archive)));
  const other = await encrypt(a, path.join(root, "other.age")); await expect(decrypt(encrypted, other, path.join(root, "wrong.zip"))).rejects.toThrow(); expect(fs.existsSync(path.join(root, "wrong.zip"))).toBe(false);
  writeNew(path.join(root, "cut.age"), readBytes(encrypted, LIMIT.archive).subarray(0, -9)); await expect(decrypt(path.join(root, "cut.age"), identity, path.join(root, "cut.zip"))).rejects.toThrow();
  expect(fs.existsSync(path.join(root, "cut.zip"))).toBe(false);
});
test("embedded age authenticates multiple chunks before publishing plaintext", async () => {
  const input = path.join(root, "large.bin"), cipher = path.join(root, "large.age"), output = path.join(root, "large.restored");
  writeNew(input, Buffer.alloc(200001, 0x73)); const identity = await encrypt(input, cipher); await decrypt(cipher, identity, output);
  expect(readBytes(output)).toEqual(readBytes(input));
  const modified = readBytes(cipher); modified[70000] ^= 0x80; const broken = path.join(root, "modified.age"); writeNew(broken, modified);
  const absent = path.join(root, "modified.out"); await expect(decrypt(broken, identity, absent)).rejects.toThrow(); expect(fs.existsSync(absent)).toBe(false);
  await expect(decrypt(cipher, identity, output)).rejects.toThrow(); expect(readBytes(output)).toEqual(readBytes(input));
});
test.skipIf(!Bun.which("age") || !Bun.which("age-keygen"))("embedded age interoperates in both directions with Go age", async () => {
  // The reference CLI is a development-only oracle, never a runtime dependency.
  const input = archive(), cipher = path.join(root, "library.age"), identity = await encrypt(input, cipher), key = path.join(root, "identity.agekey");
  writeNew(key, identity + "\n");
  const decoded = Bun.spawnSync([Bun.which("age")!, "--decrypt", "--identity", key, cipher], { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  expect(decoded.exitCode).toBe(0); expect(Buffer.from(decoded.stdout)).toEqual(readBytes(input));
  const recipient = Bun.spawnSync([Bun.which("age-keygen")!, "-y"], { stdin: Buffer.from(identity + "\n"), stdout: "pipe", stderr: "pipe" }); expect(recipient.exitCode).toBe(0);
  const encoded = Bun.spawnSync([Bun.which("age")!, "--encrypt", "--recipient", Buffer.from(recipient.stdout).toString().trim()], { stdin: readBytes(input), stdout: "pipe", stderr: "pipe" });
  expect(encoded.exitCode).toBe(0); const reference = path.join(root, "reference.age"), plain = path.join(root, "reference.zip"); writeNew(reference, encoded.stdout);
  await decrypt(reference, identity, plain); expect(readBytes(plain)).toEqual(readBytes(input));
});
test("HTTP readback follows documented cookie then validates final bytes", async () => {
  const data = Buffer.from("fake cipher bytes"); const calls: any[] = [];
  const request = async (url: string, options: any = {}) => {
    calls.push({ url, headers: options.headers }); const n = calls.length;
    return n === 1 ? { status: 200, headers: new Headers({ "content-type": "text/html", "set-cookie": "verify=fixture; Path=/" }), data: Buffer.from("<html>") } : n === 2 ? { status: 302, headers: new Headers({ location: "https://storage.filebin.net/object" }), data: Buffer.alloc(0) } : { status: 200, headers: new Headers(), data };
  };
  expect(await download("https://filebin.net/test/x.age", "filebin", data.length, hash(data), request)).toEqual(data);
  expect(calls[1].headers.Cookie).toBe("verify=fixture"); expect(calls[2].headers.Cookie).toBeUndefined();
});
test("off-site redirects, HTML and bad ciphertext hash are refused", async () => {
  const data = Buffer.from("cipher"); const fixtures = [
    { status: 302, headers: new Headers({ location: "https://evil.invalid/a" }), data },
    { status: 200, headers: new Headers({ "content-type": "text/html" }), data },
    { status: 200, headers: new Headers(), data: Buffer.from("wrong") },
  ];
  for (const f of fixtures) await expect(download("https://litter.catbox.moe/a.age", "litterbox", data.length, hash(data), async () => f)).rejects.toThrow();
  for (const url of ["http://filebin.net/a", "https://filebin.net.evil.invalid/a", "https://u:p@filebin.net/a", "https://127.0.0.1/a"]) expect(() => validateURL(url, "filebin")).toThrow();
});
test("upload contains age ciphertext only, uses actual server expiry", async () => {
  const data = Buffer.from("age-encryption.org/v1\nsynthetic"); let submitted: any;
  const r = await upload(data, "filebin", "provider-default", async (url, o) => {
    submitted = o?.body; return { status: 201, headers: new Headers(), data: Buffer.from(JSON.stringify({ bin: { expired_at: "2099-01-01T00:00:00Z" }, file: { bytes: data.length, sha256: hash(data) } })) };
  });
  expect(submitted).toEqual(data); expect(r.expiry_basis).toBe("provider_response"); expect(r.reported_expires_at).toBe("2099-01-01T00:00:00Z"); await expect(upload(data, "filebin", "24h")).rejects.toThrow();
});
test("compact continuation prompt retains everything needed to download and decrypt", async () => {
  const source = archive(), cipher = path.join(root, "prompt.age"), identity = await encrypt(source, cipher);
  const ciphertext = readBytes(cipher), bundle = verifyBytes(readBytes(source));
  const transfer = { version: 1, provider: "filebin", download_url: "https://filebin.net/synthetic/task.age", bundle_id: bundle.bundle_id,
    ciphertext_bytes: ciphertext.length, ciphertext_sha256: hash(ciphertext), encryption: "age-v1-x25519", identity, delete_after_restore: false,
    reported_expires_at: "2099-01-01T00:00:00Z", estimated_expires_at: null, uploaded_at: "2098-12-25T00:00:00Z", requested_ttl: "provider-default",
    expiry_basis: "provider_response", deletion_support: "url-capability", locator_also_allows_delete: true };
  const compact = parseTransfer(renderPrompt(transfer));
  expect(compact.identity).toBe(identity); expect(compact.bundle_id).toBe(bundle.bundle_id);
  expect(compact.reported_expires_at).toBe(transfer.reported_expires_at); expect(compact.uploaded_at).toBeUndefined();
  const downloaded = await download(compact.download_url, compact.provider, compact.ciphertext_bytes, compact.ciphertext_sha256,
    async () => ({ status: 200, headers: new Headers(), data: ciphertext }));
  const received = path.join(root, "received.age"), plain = path.join(root, "received.zip"); writeNew(received, downloaded);
  await decrypt(received, compact.identity, plain);
  expect(readBytes(plain)).toEqual(readBytes(source));
  const legacy = parseTransfer("<session-bridge-transfer>\n" + JSON.stringify(transfer, null, 2) + "\n</session-bridge-transfer>");
  for (const field of Object.keys(compact)) expect(compact[field]).toEqual(legacy[field]);
});
test("source installer reuses a healthy installation and backs up explicit upgrades", async () => {
  const source = path.resolve(import.meta.dir, ".."), registry = path.join(root, "installer");
  const result = await installSkill(source, registry); expect(result.python_required).toBe(false); expect(fs.existsSync(path.join(result.path, "scripts/session-bridge.ts"))).toBe(true);
  expect(result.age_install_required).toBe(false); expect(result.dependencies).toEqual(["Bun >=1.3.6"]);
  const reused = await installSkill(source, registry); expect(reused.status).toBe("reused"); expect(fs.readdirSync(path.join(result.path, "scripts")).some(s => s.endsWith(".py"))).toBe(false);
  const update = await installSkill(source, registry, true); expect(update.backup && fs.existsSync(update.backup)).toBeTruthy();
});
test("legacy v1.0 synthetic ZIP remains readable", () => {
  const entries = zipDecode(readBytes(archive(), LIMIT.archive));
  const manifest = parseJSON(entries.get("manifest.json")!.data); manifest.format_version = "1.0"; entries.set("manifest.json", { data: Buffer.from(JSON.stringify(manifest)) });
  expect(verifyBytes(zipEncode(entries)).status).toBe("verified");
});
