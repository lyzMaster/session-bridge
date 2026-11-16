import * as fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";

export const VERSION = "0.5.0";
export const LIMIT = { files: 10000, meta: 8 * 1024 ** 2, file: 128 * 1024 ** 2,
  total: 256 * 1024 ** 2, archive: 100_000_000, transfer: 128 * 1024, skills: 128 };
export class BridgeError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export function need(value: unknown, code: string, message: string): asserts value {
  if (!value) throw new BridgeError(code, message);
}
export const now = () => new Date().toISOString();
export const uuid = () => randomUUID();
export const hash = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
export const isHash = (s: unknown): s is string => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
export const exists = (p: string) => { try { fs.lstatSync(p); return true; } catch (e: any) { if (e.code === "ENOENT") return false; throw e; } };
export const inside = (root: string, p: string) => { const rel = path.relative(path.resolve(root), path.resolve(p)); return rel === "" || (!path.isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + path.sep)); };
export function canonical(p: string): string {
  const absolute = path.resolve(p);
  if (exists(absolute)) return fs.realpathSync(absolute);
  const parent = path.dirname(absolute);
  return parent === absolute ? absolute : path.join(canonical(parent), path.basename(absolute));
}
export function json(value: any): Buffer {
  const ordered = (v: any): any => Array.isArray(v) ? v.map(ordered) : v && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, ordered(v[k])])) : v;
  return Buffer.from(JSON.stringify(ordered(value), null, 2) + "\n");
}
export const jsonl = (rows: any[]) => Buffer.from(rows.map(row => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));

// Strict parser: reject duplicate keys, excessive nesting and non-finite numbers before use.
export function parseJSON(input: Uint8Array | string): any {
  const s = typeof input === "string" ? input : new TextDecoder("utf-8", { fatal: true }).decode(input);
  let i = 0;
  const fail = () => { throw new BridgeError("JSON", "Invalid or ambiguous JSON document."); };
  const ws = () => { while (/\s/.test(s[i] || "\0") && i < s.length) i++; };
  function str(): string {
    if (s[i] !== '"') return fail();
    const start = i++;
    while (i < s.length) {
      if (s[i] === "\\") { i += 2; continue; }
      if (s[i++] === '"') { try { return JSON.parse(s.slice(start, i)); } catch { return fail(); } }
    }
    return fail();
  }
  function value(depth: number): any {
    if (depth > 128) return fail();
    ws(); const c = s[i];
    if (c === '"') return str();
    if (c === "{") {
      i++; ws(); const out: any = Object.create(null);
      if (s[i] === "}") { i++; return out; }
      while (true) {
        ws(); const key = str(); ws(); if (s[i++] !== ":" || Object.hasOwn(out, key)) return fail();
        out[key] = value(depth + 1); ws(); const end = s[i++];
        if (end === "}") return out; if (end !== ",") return fail();
      }
    }
    if (c === "[") {
      i++; ws(); const out: any[] = []; if (s[i] === "]") { i++; return out; }
      while (true) { out.push(value(depth + 1)); ws(); const end = s[i++]; if (end === "]") return out; if (end !== ",") return fail(); }
    }
    for (const [literal, result] of [["true", true], ["false", false], ["null", null]] as const) {
      if (s.startsWith(literal, i)) { i += literal.length; return result; }
    }
    const n = s.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!n || !Number.isFinite(Number(n[0]))) return fail();
    i += n[0].length; return Number(n[0]);
  }
  const result = value(0); ws(); if (i !== s.length) fail(); return result;
}
export function readBytes(p: string, limit = LIMIT.file): Buffer {
  need(fs.lstatSync(p).isFile(), "FILE", "Only regular files are supported.");
  const fd = fs.openSync(p, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
  try {
    const a = fs.fstatSync(fd); need(a.isFile() && a.size <= limit, "LIMIT", "Input exceeds its byte limit.");
    const data = Buffer.alloc(a.size); let offset = 0;
    while (offset < data.length) { const n = fs.readSync(fd, data, offset, data.length - offset, offset); need(n > 0, "SOURCE_CHANGED", "Source changed during capture."); offset += n; }
    const b = fs.fstatSync(fd), c = fs.lstatSync(p);
    const sig = (s: fs.Stats) => [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs].join(":");
    need(sig(a) === sig(b) && sig(a) === sig(c), "SOURCE_CHANGED", "Source changed during capture.");
    return data;
  } finally { fs.closeSync(fd); }
}
export const readJSON = (p: string) => parseJSON(readBytes(p, LIMIT.meta));
export function writeNew(p: string, data: string | Uint8Array, executable = false) {
  fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
  let fd: number;
  try { fd = fs.openSync(p, "wx", executable ? 0o700 : 0o600); }
  catch (e: any) { if (e.code === "EEXIST") throw new BridgeError("DEST_EXISTS", "Output exists; choose a new destination."); throw e; }
  try { fs.writeFileSync(fd, data); } finally { fs.closeSync(fd); }
}
export const writeJSON = (p: string, value: any) => writeNew(p, json(value));
export function newDir(p: string): string {
  p = path.resolve(p); fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
  try { fs.mkdirSync(p, { mode: 0o700 }); } catch (e: any) { if (e.code === "EEXIST") throw new BridgeError("DEST_EXISTS", "Destination already exists."); throw e; }
  return p;
}
export function temporary(parent = os.tmpdir(), prefix = ".bridge-") {
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  return fs.mkdtempSync(path.join(parent, prefix));
}
export const remove = (p: string) => fs.rmSync(p, { recursive: true, force: true });
export function safePath(s: any): string {
  need(typeof s === "string" && s.length > 0 && s.length <= 1024 && !s.startsWith("/") && !/[\\\x00-\x1f\x7f]/.test(s), "PATH", "Unsafe archive path.");
  for (const part of s.split("/")) need(part && part !== "." && part !== ".." && !/[ .]$/.test(part) && !/[<>:"|?*]/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part), "PATH", "Nonportable or escaping archive path.");
  return s;
}
export function checkPaths(paths: string[]) {
  const prefixes = new Map<string, string>(), files = new Set<string>(), dirs = new Set<string>();
  for (const p of paths) {
    safePath(p); const parts = p.split("/");
    for (let n = 1; n <= parts.length; n++) {
      const prefix = parts.slice(0, n).join("/"), key = prefix.normalize("NFC").toLowerCase();
      need(!prefixes.has(key) || prefixes.get(key) === prefix, "PATH_COLLISION", "Case or Unicode path collision."); prefixes.set(key, prefix);
      if (n < parts.length) dirs.add(key);
      else { need(!files.has(key), "PATH_COLLISION", "Duplicate archive path."); files.add(key); }
    }
  }
  for (const f of files) need(!dirs.has(f), "PATH_COLLISION", "File/directory path collision.");
}
export const SKIP = new Set([".git", "node_modules", ".venv", "venv", "__pycache__", ".session-bridge"]);
export const secretName = (name: string) => new Set(["auth.json", "credentials.json", "id_rsa", "id_ed25519", ".netrc", ".npmrc"]).has(name) || (name === ".env" || (name.startsWith(".env.") && ![".env.example", ".env.sample", ".env.template"].includes(name)));
export function listing(root: string): { files: string[]; omissions: any[] } {
  const files: string[] = [], omissions: any[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, entry.name), rel = path.relative(root, p).split(path.sep).join("/");
      const reason = entry.isSymbolicLink() ? "symlink" : secretName(entry.name) ? "credential-filename" : SKIP.has(entry.name) ? "regenerable-directory" : (!entry.isDirectory() && !entry.isFile()) ? "special-file" : null;
      if (reason) { omissions.push({ path: rel, status: "excluded", reason }); continue; }
      if (entry.isDirectory()) walk(p); else files.push(rel);
    }
  }
  walk(root); checkPaths(files); need(files.length <= LIMIT.files, "LIMIT", "Too many captured files."); return { files, omissions };
}
export function sensitive(data: Uint8Array): boolean {
  const text = Buffer.from(data).toString("latin1");
  return /(?:^|\n)-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]{32,}/m.test(text) || /AGE-SECRET-KEY-1[0-9A-Z]{40,}/.test(text) || /gh[pousr]_[A-Za-z0-9]{30,}/.test(text) || /AKIA[0-9A-Z]{16}/.test(text);
}
export function treeHash(root: string): string {
  const rows = listing(root).files.sort().map(rel => ({ path: rel, sha256: hash(readBytes(path.join(root, rel))), executable: !!(fs.statSync(path.join(root, rel)).mode & 0o111) }));
  return hash(json(rows));
}
