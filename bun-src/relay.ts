import * as fs from "node:fs";
import path from "node:path";
import { BridgeError, exists, hash, isHash, LIMIT, need, newDir, now, parseJSON, readBytes, readJSON, remove, temporary, uuid, VERSION, writeJSON, writeNew } from "./common.ts";
import { unpack, verifyBytes } from "./bundle.ts";
import { Encrypter, Decrypter, generateIdentity, identityToRecipient } from "age-encryption";
import { STANDALONE } from "./runtime.ts";
import { http, HTTP } from "./network.ts";
export { http, httpOnce, withRetries } from "./network.ts";
export type { HTTP, HTTPResult, HTTPPolicy } from "./network.ts";

export const PROVIDERS: Record<string, { endpoint: string; hosts: string[]; ttls: string[] }> = {
  filebin: { endpoint: "https://filebin.net", hosts: ["filebin.net", "storage.filebin.net"], ttls: ["provider-default"] },
  litterbox: { endpoint: "https://litterbox.catbox.moe/resources/internals/api.php", hosts: ["litterbox.catbox.moe", "litter.catbox.moe"], ttls: ["1h", "12h", "24h", "72h"] },
  tmpfiles: { endpoint: "https://tmpfiles.org/api/v1/upload", hosts: ["tmpfiles.org"], ttls: ["1h", "6h", "24h", "48h"] },
  tempsh: { endpoint: "https://temp.sh/upload", hosts: ["temp.sh"], ttls: ["provider-default"] },
  uguu: { endpoint: "https://uguu.se/upload", hosts: ["uguu.se", "a.uguu.se", "files.uguu.se"], ttls: ["provider-default"] },
};
const IDENTITY = /^AGE-SECRET-KEY-1[0-9A-Z]{40,100}$/;
const MAGIC = Buffer.from("age-encryption.org/v1\n");
export function tool(cmd: string[], input?: Uint8Array): Buffer {
  need(Bun.which(cmd[0]), "DEPENDENCY", "Required executable missing: " + cmd[0]);
  const p = Bun.spawnSync(cmd, { stdin: input || "ignore", stdout: "pipe", stderr: "pipe", timeout: 120000 });
  need(p.exitCode === 0, "TOOL_FAILED", "External tool failed: " + path.basename(cmd[0])); return Buffer.from(p.stdout);
}
export async function encrypt(zip: string, cipher: string) {
  need(!exists(cipher), "DEST_EXISTS", "Ciphertext output exists.");
  const identity = await generateIdentity(), encrypter = new Encrypter();
  encrypter.addRecipient(await identityToRecipient(identity));
  const data = await encrypter.encrypt(readBytes(zip, LIMIT.archive));
  need(data.length <= LIMIT.archive && Buffer.from(data).subarray(0, MAGIC.length).equals(MAGIC), "CRYPTO", "Invalid or oversized age output.");
  writeNew(cipher, data); return identity;
}
export async function decrypt(cipher: string, identity: string, plain: string) {
  need(IDENTITY.test(identity) && !exists(plain), "CRYPTO", "Invalid identity or existing plaintext output.");
  let data: Uint8Array;
  try { const decrypter = new Decrypter(); decrypter.addIdentity(identity); data = await decrypter.decrypt(readBytes(cipher, LIMIT.archive)); }
  catch { throw new BridgeError("CRYPTO", "Decryption failed: invalid key, truncated or modified ciphertext."); }
  need(data.length <= LIMIT.archive, "LIMIT", "Decrypted archive exceeds byte limit.");
  // Publish no plaintext until the library authenticates every encrypted chunk.
  writeNew(plain, data);
}
export function validateURL(url: any, provider: any): string {
  need(typeof provider === "string" && Object.hasOwn(PROVIDERS, provider) && typeof url === "string" && url.length <= 4096 && /^[\x21-\x7e]+$/.test(url), "URL", "Invalid provider or URL.");
  let u: URL; try { u = new URL(url); } catch { throw new BridgeError("URL", "Invalid URL."); }
  need(u.protocol === "https:" && PROVIDERS[provider].hosts.includes(u.hostname) && ["", "443"].includes(u.port) && !u.username && !u.password && !u.hash, "URL", "URL outside selected provider's HTTPS allowlist.");
  if (provider === "tempsh") need(/^\/[A-Za-z0-9]{1,80}\/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/.test(u.pathname) && !u.search, "URL", "Expected a Temp.sh file locator, not an upload/control endpoint.");
  return url;
}
export async function download(url: string, provider: string, bytes: number, sha: string, request: HTTP = http) {
  validateURL(url, provider); need(Number.isSafeInteger(bytes) && bytes > 0 && bytes <= LIMIT.archive && isHash(sha), "TRANSFER", "Invalid ciphertext size/hash.");
  const r = await downloadResponse(url, provider, bytes, request);
  need(r.status === 200, "HTTP_STATUS", `Relay download returned HTTP ${r.status}.`);
  need(r.data.length === bytes && hash(r.data) === sha, "HASH_MISMATCH", "Downloaded ciphertext differs from source."); return r.data;
}
async function downloadResponse(url: string, provider: string, bytes: number, request: HTTP, extraHeaders: Record<string, string> = {}) {
  let current = url, cookie = "", replayed = false;
  for (let i = 0; i < 5; i++) {
    const headers: Record<string, string> = { ...extraHeaders };
    if (provider === "filebin" && new URL(current).hostname === "filebin.net" && cookie) headers.Cookie = cookie;
    const r = await request(current, { headers, ...(provider === "tempsh" ? { method: "POST" } : {}) }, Math.max(bytes, 16384), { totalMs: Math.min(1800000, Math.max(120000, Math.ceil(bytes / 4096) * 1000 + 60000)) });
    if ([301, 302, 303, 307, 308].includes(r.status)) { current = validateURL(new URL(r.headers.get("location") || "", current).href, provider); continue; }
    const html = (r.headers.get("content-type") || "").toLowerCase().includes("text/html");
    if (provider === "filebin" && new URL(current).hostname === "filebin.net" && r.status === 200 && html && r.headers.has("set-cookie") && !replayed) {
      cookie = r.headers.getSetCookie().map(s => s.split(";", 1)[0]).join("; "); replayed = true; continue;
    }
    need(r.status === 200 || r.status === 206, "HTTP_STATUS", `Relay download returned HTTP ${r.status}.`);
    need(!html, "HTML_RESPONSE", "Relay returned HTML instead of ciphertext."); return r;
  }
  throw new BridgeError("REDIRECT", "Too many relay redirects.");
}
export async function downloadRange(url: string, provider: string, start: number, end: number, total: number, request: HTTP = http) {
  validateURL(url, provider);
  need(Number.isSafeInteger(start) && Number.isSafeInteger(end) && Number.isSafeInteger(total) && start >= 0 && end >= start && end < total && total <= LIMIT.archive, "TRANSFER", "Invalid ciphertext range.");
  let result;
  try { result = await downloadResponse(url, provider, end - start + 1, request, { Range: `bytes=${start}-${end}`, "Accept-Encoding": "identity" }); }
  catch (error) { if (error instanceof BridgeError && error.code === "LIMIT") throw new BridgeError("RANGE_UNSUPPORTED", "The relay ignored a bounded range request."); throw error; }
  need(result.status !== 200, "RANGE_UNSUPPORTED", "The relay returned a full object to a range request.");
  need(result.status === 206, "HTTP_STATUS", `Relay range download returned HTTP ${result.status}.`);
  need(result.headers.get("content-range") === `bytes ${start}-${end}/${total}` && result.data.length === end - start + 1,
    "RANGE_RESPONSE", "Relay returned the wrong ciphertext range."); return result.data;
}
export async function upload(cipher: Buffer, provider: string, ttl: string, request: HTTP = http) {
  need(Object.hasOwn(PROVIDERS, provider) && PROVIDERS[provider].ttls.includes(ttl), "TTL", "Unsupported provider or retention period.");
  need(cipher.length <= LIMIT.archive && cipher.subarray(0, MAGIC.length).equals(MAGIC), "CRYPTO", "Only bounded age ciphertext can be uploaded.");
  const filename = uuid().replaceAll("-", "") + ".session.age";
  if (provider === "filebin") {
    const url = `https://filebin.net/${uuid().replaceAll("-", "")}/${filename}`;
    const r = await request(url, { method: "POST", headers: { "Content-Type": "application/octet-stream", Accept: "application/json" }, body: cipher }, LIMIT.meta,
      { totalMs: Math.min(1800000, Math.max(120000, Math.ceil(cipher.length / 4096) * 1000 + 60000)) });
    if (r.status === 409) {
      // A retry can reach an object whose upload succeeded before its acknowledgement was lost.
      await download(url, provider, cipher.length, hash(cipher), request);
      return { provider, download_url: url, uploaded_at: now(), requested_ttl: ttl, reported_expires_at: null,
        estimated_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), expiry_basis: "estimated_after_acknowledgement_loss",
        deletion_support: "url-capability", locator_also_allows_delete: true };
    }
    need(r.status === 201, "HTTP_STATUS", `Filebin upload returned HTTP ${r.status}; no ready prompt.`);
    const v = parseJSON(r.data); need(v?.file?.sha256 === hash(cipher) && v?.file?.bytes === cipher.length && typeof v?.bin?.expired_at === "string" && Number.isFinite(Date.parse(v.bin.expired_at)), "PROVIDER_RESPONSE", "Filebin metadata differs from ciphertext.");
    return { provider, download_url: url, uploaded_at: now(), requested_ttl: ttl, reported_expires_at: v.bin.expired_at, estimated_expires_at: null, expiry_basis: "provider_response", deletion_support: "url-capability", locator_also_allows_delete: true };
  }
  const form = new FormData(); form.append(provider === "litterbox" ? "fileToUpload" : provider === "uguu" ? "files[]" : "file", new Blob([cipher], { type: "application/octet-stream" }), filename);
  if (provider === "litterbox") { form.append("reqtype", "fileupload"); form.append("time", ttl); } else form.append("expire", String(parseInt(ttl) * 3600));
  const r = await request(PROVIDERS[provider].endpoint, { method: "POST", body: form }, LIMIT.meta,
    { totalMs: Math.min(1800000, Math.max(120000, Math.ceil(cipher.length / 4096) * 1000 + 60000)) });
  need([200, 201].includes(r.status), "HTTP_STATUS", `Relay upload returned HTTP ${r.status}; no ready prompt.`);
  let url = r.data.toString("utf8").trim();
  if (provider === "uguu") { const v = parseJSON(r.data); need(v?.success === true && v.files?.length === 1 && typeof v.files[0].url === "string", "PROVIDER_RESPONSE", "No Uguu upload confirmation."); url = v.files[0].url; }
  if (provider === "tmpfiles") { const v = parseJSON(r.data); need(v?.status === "success", "PROVIDER_RESPONSE", "No upload confirmation."); const locator = String(v.data?.url || "").replace(/^http:\/\/tmpfiles\.org\//, "https://tmpfiles.org/"); validateURL(locator, provider); url = "https://tmpfiles.org/dl" + new URL(locator).pathname; }
  validateURL(url, provider);
  return { provider, download_url: url, uploaded_at: now(), requested_ttl: ttl, reported_expires_at: null,
    estimated_expires_at: new Date(Date.now() + (provider === "tempsh" ? 72 : provider === "uguu" ? 3 : parseInt(ttl)) * 3600000).toISOString(), expiry_basis: "estimated_from_provider_policy", deletion_support: "unsupported" };
}
export function renderPrompt(transfer: any) {
  // Restore credentials travel with the prompt; operational upload metadata stays in the receipt.
  const fields = ["version", "provider", "download_url", "bundle_id", "ciphertext_bytes", "ciphertext_sha256", "encryption", "identity", "delete_after_restore", "reported_expires_at", "estimated_expires_at"];
  const envelope = Object.fromEntries(fields.filter(key => transfer[key] !== undefined && transfer[key] !== null).map(key => [key, transfer[key]]));
  return "用 https://github.com/lyzMaster/session-bridge 恢复并继续这个任务。\n" +
    "<session-bridge-transfer>" + JSON.stringify(envelope) + "</session-bridge-transfer>\n";
}
export async function share(file: string, provider: string, ttl: string, output: string) {
  need(Object.hasOwn(PROVIDERS, provider) && PROVIDERS[provider].ttls.includes(ttl), "TTL", "Unsupported provider/TTL.");
  const data = readBytes(file, LIMIT.archive), info = verifyBytes(data); need(data.length + 1048576 <= LIMIT.archive, "LIMIT", "Bundle too large for encrypted sharing.");
  const out = newDir(output), temp = temporary(out, ".encrypt-");
  try {
    const plain = path.join(temp, "bundle.zip"), cipher = path.join(out, "payload.session.zip.age"); writeNew(plain, data);
    const identity = await encrypt(plain, cipher); writeNew(path.join(out, "identity.agekey"), identity + "\n");
    const encrypted = readBytes(cipher, LIMIT.archive), remote = await upload(encrypted, provider, ttl), receipt = { ...remote, version: 1, bundle_id: info.bundle_id, ciphertext_bytes: encrypted.length, ciphertext_sha256: hash(encrypted) };
    writeJSON(path.join(out, "upload-receipt.json"), receipt); await download(remote.download_url, provider, encrypted.length, hash(encrypted));
    const transfer = { ...receipt, encryption: "age-v1-x25519", identity, delete_after_restore: false };
    writeNew(path.join(out, "continuation-prompt.txt"), renderPrompt(transfer)); writeJSON(path.join(out, "verified-transfer.json"), receipt);
    return { status: "prompt_ready", ...receipt, prompt_file: path.join(out, "continuation-prompt.txt"), receipt: path.join(out, "upload-receipt.json"), remote_verified_at: now(), coverage: info.coverage };
  } catch (e) { writeJSON(path.join(out, "failure.json"), { status: "not_ready", failed_at: now(), note: "No valid prompt. Ciphertext/key/receipt may remain locally; accepted remote uploads may survive until provider expiry." }); throw e; }
  finally { remove(temp); }
}
export function parseTransfer(text: string) {
  need(Buffer.byteLength(text) <= LIMIT.transfer, "LIMIT", "Transfer prompt too large.");
  if (text.includes("<session-bridge-transfer>")) { need(text.split("<session-bridge-transfer>").length === 2 && text.split("</session-bridge-transfer>").length === 2, "TRANSFER", "Ambiguous transfer blocks."); text = text.split("<session-bridge-transfer>")[1].split("</session-bridge-transfer>")[0]; }
  const v = parseJSON(text); need(v?.version === 1 && v.encryption === "age-v1-x25519" && typeof v.identity === "string" && IDENTITY.test(v.identity) && typeof v.bundle_id === "string" && isHash(v.ciphertext_sha256) && Number.isSafeInteger(v.ciphertext_bytes) && v.ciphertext_bytes > 0 && v.ciphertext_bytes <= LIMIT.archive && v.delete_after_restore === false, "TRANSFER", "Invalid transfer envelope.");
  validateURL(v.download_url, v.provider); return v;
}
export async function receive(text: string, destination: string, options: { skillsDir?: string } = {}) {
  const t = parseTransfer(text); need(!exists(destination), "DEST_EXISTS", "Recovery destination exists."); const tmp = temporary();
  try {
    const cipher = path.join(tmp, "payload.age"), plain = path.join(tmp, "bundle.zip");
    writeNew(cipher, await download(t.download_url, t.provider, t.ciphertext_bytes, t.ciphertext_sha256)); await decrypt(cipher, t.identity, plain);
    need(verifyBytes(readBytes(plain, LIMIT.archive)).bundle_id === t.bundle_id, "IDENTITY_MISMATCH", "Recovered bundle identity differs.");
    const result = unpack(plain, destination, options); writeJSON(path.join(destination, "recovery/relay-report.json"), { provider: t.provider, ciphertext_sha256: t.ciphertext_sha256, verified_at: now(), private_key_saved_in_recovery: false }); return result;
  } finally { remove(tmp); }
}
export async function revoke(receiptFile: string) {
  const v = readJSON(receiptFile); need(v?.provider === "filebin", "UNSUPPORTED", "Remote deletion is implemented only for Filebin.");
  const url = validateURL(v.download_url, "filebin"); need(new URL(url).hostname === "filebin.net", "URL", "Use the original Filebin locator.");
  const r = await http(url, { method: "DELETE" }); need([200, 404].includes(r.status), "HTTP_STATUS", "Deletion request failed.");
  const check = await http(url); need(check.status === 404, "DELETE_UNCONFIRMED", "Public download entry is not confirmed unavailable.");
  return { status: "public_entry_unavailable", provider: "filebin", bundle_id: v.bundle_id, checked_at: now(), deletion_http_status: r.status, verification_http_status: check.status, physical_erasure_verified: false };
}
export function doctor() { return { version: VERSION, standalone: STANDALONE, runtime: STANDALONE ? "embedded-bun" : "bun", bun: Bun.version,
  crypto_engine: "embedded age-encryption@0.3.1", crypto_format: "age-v1-x25519", required_external_tools: [],
  bun_install_required: !STANDALONE, npm_packages_required: false, python_required: false, age_install_required: false,
  ready: typeof crypto.getRandomValues === "function", native_http: true, network_tested: false,
  providers: Object.fromEntries(Object.entries(PROVIDERS).map(([k, v]) => [k, { ttls: v.ttls }])), limits: LIMIT }; }
