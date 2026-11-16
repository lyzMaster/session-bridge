import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { Encrypter, Decrypter, generateIdentity, identityToRecipient } from "age-encryption";
import { BridgeError, exists, hash, inside, isHash, json, LIMIT, need, now, parseJSON, readBytes, readJSON, remove, uuid, writeJSON, writeNew } from "./common.ts";
import { verifyBytes, unpack } from "./bundle.ts";
import { download, downloadRange, upload, parseTransfer, renderPrompt, validateURL, revoke, PROVIDERS } from "./relay.ts";
import { http, HTTP } from "./network.ts";

export const TRANSFER_DEFAULTS = { part_bytes: 8 * 1024 ** 2, concurrency: 3, maximum_parts: 2048, providers: ["tempsh", "filebin"] };
export type Progress = (event: Record<string, unknown>) => void;
export type TransferOptions = { partBytes?: number; concurrency?: number; request?: HTTP; progress?: Progress; cache?: string; skillsDir?: string };
const MIN_CIPHER = 128, MAX_PART = 17 * 1024 ** 2;
function atomicJSON(file: string, value: any) { const tmp = file + "." + uuid() + ".tmp"; writeJSON(tmp, value); fs.renameSync(tmp, file); }
function checkedDirectory(directory: string) {
  if (!exists(directory)) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  need(!fs.lstatSync(directory).isSymbolicLink() && fs.lstatSync(directory).isDirectory(), "CACHE", "Transfer state must be an ordinary local directory.");
  return directory;
}
function lock(directory: string) {
  const file = path.join(directory, ".transfer.lock");
  if (exists(file)) {
    const owner = readJSON(file); need(owner?.format === "session-bridge-lock" && Number.isSafeInteger(owner.pid) && owner.pid > 0, "BUSY", "Unrecognized transfer lock.");
    let running = true; try { process.kill(owner.pid, 0); } catch (e: any) { if (e.code === "ESRCH") running = false; }
    need(!running, "BUSY", "Another process owns this transfer directory."); remove(file);
  }
  writeJSON(file, { format: "session-bridge-lock", pid: process.pid });
  return () => { if (exists(file)) remove(file); };
}
async function pool<T>(items: T[], concurrency: number, work: (item: T) => Promise<void>) {
  need(Number.isSafeInteger(concurrency) && concurrency >= 1 && concurrency <= 6, "ARGUMENT", "Concurrency must be between 1 and 6.");
  let next = 0, failure: unknown;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!failure && next < items.length) { const item = items[next++]; try { await work(item); } catch (e) { failure ||= e; } }
  }));
  if (failure) throw failure;
}
function validFile(file: string, bytes: number, sha: string) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > LIMIT.archive || !isHash(sha)) return false;
  try { return fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink() && fs.statSync(file).size === bytes && hash(readBytes(file, Math.max(MAX_PART, LIMIT.meta, bytes))) === sha; } catch { return false; }
}
export function tuneTransfer(archiveBytes: number, sampleBytes: number, readbackMs: number, requestedPartBytes?: number, requestedConcurrency?: number) {
  const rate = sampleBytes * 1000 / Math.max(1, readbackMs);
  const adaptiveBytes = Math.max(256 * 1024, Math.min(TRANSFER_DEFAULTS.part_bytes, 2 ** Math.floor(Math.log2(Math.max(1, rate * 40)))));
  return { partBytes: requestedPartBytes ?? adaptiveBytes,
    concurrency: requestedConcurrency ?? (archiveBytes >= 16 * 1024 ** 2 && rate < 256 * 1024 ? 6 : TRANSFER_DEFAULTS.concurrency),
    measured_readback_bytes_per_second: Math.round(rate) };
}
function sourcePlan(file: string, partBytes: number, sampleBytes = Math.min(partBytes, 256 * 1024)) {
  const bytes = readBytes(file, LIMIT.archive), info = verifyBytes(bytes), parts: any[] = [];
  for (let offset = 0; offset < bytes.length;) {
    // Reuse the first real encrypted part to measure routes, without a separate plaintext probe.
    const size = parts.length === 0 ? sampleBytes : partBytes;
    const data = bytes.subarray(offset, Math.min(bytes.length, offset + size));
    parts.push({ index: parts.length, offset, plain_bytes: data.length, plain_sha256: hash(data) });
    offset += data.length;
  }
  need(parts.length <= TRANSFER_DEFAULTS.maximum_parts, "LIMIT", "Too many transfer parts; choose a larger part size.");
  return { archive_bytes: bytes.length, archive_sha256: hash(bytes), bundle_id: info.bundle_id, coverage: info.coverage,
    requires_v2: parts.length > 1 || info.uncompressed_bytes > 256 * 1024 ** 2 || info.inventory.some((row: any) => row.bytes > 128 * 1024 ** 2), parts };
}
function readPart(file: string, part: any) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0)), data = Buffer.alloc(part.plain_bytes);
  try {
    need(fs.fstatSync(fd).isFile(), "FILE", "Only ordinary archive files can be shared.");
    let done = 0; while (done < data.length) { const n = fs.readSync(fd, data, done, data.length - done, part.offset + done); need(n > 0, "SOURCE_CHANGED", "Archive changed during transfer."); done += n; }
  } finally { fs.closeSync(fd); }
  need(hash(data) === part.plain_sha256, "SOURCE_CHANGED", "Archive changed during transfer; existing completed parts are retained."); return data;
}
async function seal(data: Uint8Array, identity: string) { const e = new Encrypter(); e.addRecipient(await identityToRecipient(identity)); return Buffer.from(await e.encrypt(data)); }
async function open(data: Uint8Array, identity: string) {
  try { const d = new Decrypter(); d.addIdentity(identity); return Buffer.from(await d.decrypt(data)); }
  catch { throw new BridgeError("CRYPTO", "Part authentication failed; no recovery directory was created."); }
}
function earliest(receipts: any[]) {
  const actual = receipts.map(r => r.reported_expires_at).filter(Boolean), estimated = receipts.map(r => r.estimated_expires_at).filter(Boolean);
  const dates = [...actual, ...estimated].filter(s => Number.isFinite(Date.parse(s))).sort((a, b) => Date.parse(a) - Date.parse(b));
  return dates.length ? (estimated.length ? { estimated_expires_at: dates[0] } : { reported_expires_at: dates[0] }) : {};
}
function envelope(receipt: any, data: { bytes: number; sha256: string }, identity: string, bundleId: string, version: number) {
  return { version, provider: receipt.provider, download_url: receipt.download_url, ciphertext_bytes: data.bytes, ciphertext_sha256: data.sha256,
    bundle_id: bundleId, encryption: "age-v1-x25519", identity, delete_after_restore: false, ...earliest([receipt]) };
}

export async function shareMultipart(file: string, provider = "auto", ttl = "provider-default", output: string, options: TransferOptions = {}) {
  const out = path.resolve(output), stateFile = path.join(out, "checkpoint.json"), saved = exists(stateFile) ? readJSON(stateFile) : null;
  const configuredBytes = options.partBytes ?? TRANSFER_DEFAULTS.part_bytes;
  let partBytes = saved?.part_bytes ?? configuredBytes, concurrency = options.concurrency ?? saved?.concurrency ?? TRANSFER_DEFAULTS.concurrency;
  need(Number.isSafeInteger(partBytes) && partBytes >= 1024 && partBytes <= 16 * 1024 ** 2, "ARGUMENT", "Part size must be between 1 KiB and 16 MiB.");
  need(Number.isSafeInteger(concurrency) && concurrency >= 1 && concurrency <= 6, "ARGUMENT", "Concurrency must be between 1 and 6.");
  need(provider === "auto" || Object.hasOwn(PROVIDERS, provider), "PROVIDER", "Unknown relay provider.");
  need(provider !== "auto" || ttl === "provider-default", "TTL", "Automatic relay selection uses provider-default retention.");
  if (provider !== "auto") need(PROVIDERS[provider].ttls.includes(ttl), "TTL", "Unsupported provider retention period.");
  const sampleBytes = saved?.sample_bytes ?? saved?.parts?.[0]?.plain_bytes ?? Math.min(partBytes, 256 * 1024);
  need(Number.isSafeInteger(sampleBytes) && sampleBytes > 0 && sampleBytes <= 1024 ** 2, "ARGUMENT", "Invalid route sample size.");
  let source = sourcePlan(file, partBytes, sampleBytes);
  if (exists(out) && !exists(stateFile) && exists(path.join(out, "upload-receipt.json"))) return resumeShare(out, options);
  if (!exists(out)) checkedDirectory(out);
  need(exists(stateFile) || fs.readdirSync(out).length === 0, "DEST_EXISTS", "Output belongs to another operation; choose a new directory.");
  checkedDirectory(out); const unlock = lock(out), request = options.request || http, started = Date.now(); let state: any;
  const progress = (phase: string, extra: any = {}) => options.progress?.({ phase, completed_parts: state?.parts.filter((p: any) => p.verified).length || 0,
    total_parts: source.parts.length, elapsed_ms: Date.now() - started, ...extra });
  try {
    if (exists(stateFile)) {
      state = readJSON(stateFile);
      need(state?.format === "session-bridge-upload" && state.state_version === 1 && state.archive_sha256 === source.archive_sha256 &&
        state.bundle_id === source.bundle_id && state.part_bytes === partBytes && (state.configured_part_bytes ?? state.part_bytes) === configuredBytes && state.requested_provider === provider && state.ttl === ttl &&
        hash(json(state.parts.map(({ index, offset, plain_bytes, plain_sha256 }: any) => ({ index, offset, plain_bytes, plain_sha256 })))) === hash(json(source.parts)),
        "RESUME_MISMATCH", "Archive or options differ from this checkpoint; retain it and use a new output directory.");
    } else {
      state = { format: "session-bridge-upload", state_version: 1, source_file: path.resolve(file), ...source, part_bytes: partBytes,
        configured_part_bytes: configuredBytes, adaptive_parts: options.partBytes === undefined, sample_bytes: source.parts[0].plain_bytes,
        requested_provider: provider, provider: provider === "auto" ? null : provider, ttl, created_at: now(), parts: source.parts };
      atomicJSON(stateFile, state);
    }
    if (!exists(path.join(out, "identity.agekey"))) {
      need(state.parts.every((p: any) => !p.encrypted && !p.remote), "CRYPTO", "Original encryption identity is missing; completed remote parts cannot be re-keyed.");
      writeNew(path.join(out, "identity.agekey"), await generateIdentity() + "\n");
    }
    const identity = readBytes(path.join(out, "identity.agekey"), 1024).toString().trim(); await identityToRecipient(identity);
    const cipherFor = async (part: any) => {
      const filename = path.join(out, `part-${String(part.index).padStart(5, "0")}.age`);
      if (part.encrypted && validFile(filename, part.encrypted.bytes, part.encrypted.sha256)) return readBytes(filename, MAX_PART);
      const accepted = part.remote || Object.values(state.probes || {}).find((p: any) => p.remote)?.remote;
      let cipher: Buffer;
      if (accepted && part.encrypted && part.index === 0) cipher = await download(accepted.download_url, accepted.provider, part.encrypted.bytes, part.encrypted.sha256, request);
      else cipher = await seal(readPart(file, part), identity);
      if (exists(filename)) remove(filename); writeNew(filename, cipher);
      if (part.encrypted && (part.encrypted.bytes !== cipher.length || part.encrypted.sha256 !== hash(cipher))) { delete part.remote; delete part.verified; if (part.index === 0) state.probes = {}; }
      part.encrypted = { bytes: cipher.length, sha256: hash(cipher) }; atomicJSON(stateFile, state); return cipher;
    };
    const processPart = async (part: any, selected: string) => {
      const partRequest: HTTP = (url, init, limit, policy) => request(url, init, limit, { ...policy,
        onProgress: event => progress("network_progress", { part: part.index + 1, provider: selected, ...event }) });
      const expiry = part.remote?.reported_expires_at || part.remote?.estimated_expires_at;
      if (expiry && Date.parse(expiry) <= Date.now()) { delete part.remote; delete part.verified; atomicJSON(stateFile, state); }
      if (part.verified && part.remote) { validateURL(part.remote.download_url, part.remote.provider); progress("reused", { part: part.index + 1, provider: selected }); return; }
      const cipher = await cipherFor(part);
      if (!part.remote) {
        progress("uploading", { part: part.index + 1, provider: selected, bytes: cipher.length });
        part.remote = await upload(cipher, selected, ttl, partRequest); atomicJSON(stateFile, state);
      }
      progress("verifying", { part: part.index + 1, provider: part.remote.provider });
      await download(part.remote.download_url, part.remote.provider, cipher.length, hash(cipher), partRequest);
      part.verified = true; atomicJSON(stateFile, state); progress("verified", { part: part.index + 1, provider: part.remote.provider });
    };
    const fingerprint = hash(JSON.stringify([os.networkInterfaces(), process.env.HTTPS_PROXY || "", process.env.HTTP_PROXY || "", process.env.ALL_PROXY || ""]));
    if (provider === "auto" && (state.reselect_on_resume || state.network_fingerprint && state.network_fingerprint !== fingerprint)) {
      (state.orphan_receipts ||= []).push(...Object.values(state.probes || {}).map((p: any) => p.remote).filter(Boolean)); state.provider = null; state.probes = {};
    }
    if (!state.provider) {
      const cipher = await cipherFor(state.parts[0]), controllers = TRANSFER_DEFAULTS.providers.map(() => new AbortController());
      state.probes ||= {}; const errors: Record<string, string> = {};
      const candidates = TRANSFER_DEFAULTS.providers.map((candidate, index) => (async () => {
        const begin = Date.now(), probe = state.probes[candidate] ||= {};
        const scoped: HTTP = (url, init, limit, policy) => request(url, { ...init, signal: controllers[index].signal }, limit, { ...policy,
          onProgress: event => progress("testing_relay_progress", { provider: candidate, ...event }) });
        progress("testing_relay", { provider: candidate, bytes: cipher.length });
        try {
          const expiry = probe.remote?.reported_expires_at || probe.remote?.estimated_expires_at;
          if (expiry && Date.parse(expiry) <= Date.now()) delete probe.remote;
          if (!probe.remote) { probe.remote = await upload(cipher, candidate, ttl, scoped); atomicJSON(stateFile, state); }
          const uploaded = Date.now();
          await download(probe.remote.download_url, candidate, cipher.length, hash(cipher), scoped);
          probe.upload_ms = uploaded - begin; probe.readback_ms = Date.now() - uploaded; probe.roundtrip_ms = Date.now() - begin; probe.verified = true;
          atomicJSON(stateFile, state); return { candidate, index, probe };
        } catch (error) { errors[candidate] = error instanceof BridgeError ? error.code : "NETWORK"; throw error; }
      })());
      let winner: Awaited<typeof candidates[number]>;
      try { winner = await Promise.any(candidates); }
      catch { throw new BridgeError("NO_RELAY", "No relay passed encrypted upload/readback verification: " + Object.entries(errors).map(([name, code]) => name + "=" + code).join(", ") + ". Resume later with the same output directory."); }
      finally {
        controllers.forEach(c => c.abort()); await Promise.allSettled(candidates);
      }
      state.provider = winner.candidate; state.network_fingerprint = fingerprint; state.reselect_on_resume = false;
      if (state.parts[0].remote && state.parts[0].remote.download_url !== winner.probe.remote.download_url) (state.parts[0].previous_receipts ||= []).push(state.parts[0].remote);
      state.parts[0].remote = winner.probe.remote; state.parts[0].verified = true;
      if (!state.tuned && state.parts.length > 1 && state.parts.slice(1).every((p: any) => !p.encrypted && !p.remote)) {
        const tuned = tuneTransfer(source.archive_bytes, cipher.length, winner.probe.readback_ms, state.adaptive_parts ? undefined : configuredBytes, options.concurrency);
        concurrency = tuned.concurrency;
        if (tuned.partBytes !== partBytes) {
          const first = state.parts[0]; partBytes = tuned.partBytes; source = sourcePlan(file, partBytes, state.sample_bytes);
          state.parts = source.parts; state.parts[0] = { ...state.parts[0], encrypted: first.encrypted, remote: first.remote, verified: true, previous_receipts: first.previous_receipts };
          state.part_bytes = partBytes; state.requires_v2 = source.requires_v2;
        }
        state.concurrency = concurrency; state.tuned = true; state.measured_readback_bytes_per_second = tuned.measured_readback_bytes_per_second;
      }
      for (const part of state.parts.slice(1)) if (!part.verified && part.remote && part.remote.provider !== state.provider) {
        (part.previous_receipts ||= []).push(part.remote); delete part.remote; delete part.verified;
      }
      progress("relay_selected", { provider: state.provider, probe_bytes: cipher.length, roundtrip_ms: winner.probe.roundtrip_ms,
        upload_ms: winner.probe.upload_ms, readback_ms: winner.probe.readback_ms, part_bytes: partBytes, concurrency });
      atomicJSON(stateFile, state);
    }
    await pool(state.parts, concurrency, part => processPart(part, state.provider));
    let remote: any, data: { bytes: number; sha256: string }, version = 1;
    if (state.parts.length === 1 && !source.requires_v2) { remote = state.parts[0].remote; data = state.parts[0].encrypted; }
    else {
      version = 2;
      const manifest = { format: "session-bridge-parts", version: 1, bundle_id: source.bundle_id,
        archive_bytes: source.archive_bytes, archive_sha256: source.archive_sha256,
        parts: state.parts.map((p: any) => ({ index: p.index, provider: p.remote.provider, url: p.remote.download_url,
          bytes: p.encrypted.bytes, sha256: p.encrypted.sha256, plain_bytes: p.plain_bytes, plain_sha256: p.plain_sha256 })),
        ...earliest(state.parts.map((p: any) => p.remote)) };
      const manifestFile = path.join(out, "parts-manifest.age");
      if (!state.manifest || state.manifest.plain_sha256 !== hash(json(manifest)) || !validFile(manifestFile, state.manifest.bytes, state.manifest.sha256)) {
        if (exists(manifestFile)) remove(manifestFile); const encrypted = await seal(json(manifest), identity); writeNew(manifestFile, encrypted);
        state.manifest = { bytes: encrypted.length, sha256: hash(encrypted), plain_sha256: hash(json(manifest)) }; atomicJSON(stateFile, state);
      }
      const encrypted = readBytes(manifestFile, LIMIT.meta);
      const expiry = state.manifest.remote?.reported_expires_at || state.manifest.remote?.estimated_expires_at;
      if (expiry && Date.parse(expiry) <= Date.now()) { delete state.manifest.remote; delete state.manifest.verified; atomicJSON(stateFile, state); }
      if (!state.manifest.remote) { progress("publishing_manifest", { provider: state.provider }); state.manifest.remote = await upload(encrypted, state.provider, ttl, request); atomicJSON(stateFile, state); }
      if (!state.manifest.verified) { await download(state.manifest.remote.download_url, state.manifest.remote.provider, encrypted.length, hash(encrypted), request); state.manifest.verified = true; atomicJSON(stateFile, state); }
      remote = { ...state.manifest.remote, ...earliest([...state.parts.map((p: any) => p.remote), state.manifest.remote]) }; data = state.manifest;
    }
    const transfer = envelope(remote, data, identity, source.bundle_id, version), promptFile = path.join(out, "continuation-prompt.txt");
    const receipt = { ...remote, version, bundle_id: source.bundle_id, ciphertext_bytes: data.bytes, ciphertext_sha256: data.sha256,
      part_count: state.parts.length, archive_bytes: source.archive_bytes, completed_at: now() };
    if (exists(promptFile)) remove(promptFile); writeNew(promptFile, renderPrompt(transfer)); atomicJSON(path.join(out, "upload-receipt.json"), receipt);
    state.complete = true; atomicJSON(stateFile, state); progress("prompt_ready", { provider: state.provider });
    return { status: "prompt_ready", ...receipt, prompt_file: promptFile, receipt: path.join(out, "upload-receipt.json"), checkpoint: stateFile,
      resumable: true, concurrency, remote_verified_at: now(), coverage: source.coverage };
  } catch (error) {
    if (state && provider === "auto" && error instanceof BridgeError &&
      (["NETWORK", "IDLE_TIMEOUT", "HEADER_TIMEOUT", "TRANSFER_TIMEOUT", "NO_RELAY", "RETRY_LATER"].includes(error.code) || error.code === "HTTP_STATUS")) {
      state.reselect_on_resume = true; atomicJSON(stateFile, state);
    }
    atomicJSON(path.join(out, "failure.json"), { status: "not_ready", resumable: true, failed_at: now(), note: "Retry with the same archive/options/output directory. Completed uploads and verifications are retained. No private identity was sent to a relay." });
    throw error;
  } finally { unlock(); }
}

export function parseTransferAny(text: string) {
  need(Buffer.byteLength(text) <= LIMIT.transfer, "LIMIT", "Transfer prompt too large.");
  let raw = text;
  if (raw.includes("<session-bridge-transfer>")) {
    need(raw.split("<session-bridge-transfer>").length === 2 && raw.split("</session-bridge-transfer>").length === 2, "TRANSFER", "Ambiguous transfer blocks.");
    raw = raw.split("<session-bridge-transfer>")[1].split("</session-bridge-transfer>")[0];
  }
  const candidate = parseJSON(raw); if (candidate?.version !== 2) return parseTransfer(text);
  const valid = parseTransfer(JSON.stringify({ ...candidate, version: 1 }));
  need(valid.ciphertext_bytes <= LIMIT.meta, "LIMIT", "Encrypted part manifest exceeds its limit."); return { ...valid, version: 2 };
}
export function validatePartsManifest(value: any, bundleId: string) {
  need(value?.format === "session-bridge-parts" && value.version === 1 && value.bundle_id === bundleId &&
    Number.isSafeInteger(value.archive_bytes) && value.archive_bytes > 0 && value.archive_bytes <= LIMIT.archive && isHash(value.archive_sha256) &&
    Array.isArray(value.parts) && value.parts.length >= 1 && value.parts.length <= TRANSFER_DEFAULTS.maximum_parts, "MANIFEST", "Invalid multipart manifest.");
  let total = 0; const locations = new Set<string>();
  value.parts.forEach((p: any, i: number) => {
    need(p?.index === i && Number.isSafeInteger(p.bytes) && p.bytes >= MIN_CIPHER && p.bytes <= MAX_PART && isHash(p.sha256) &&
      Number.isSafeInteger(p.plain_bytes) && p.plain_bytes > 0 && p.plain_bytes <= 16 * 1024 ** 2 && isHash(p.plain_sha256), "MANIFEST", "Invalid, missing or reordered transfer part.");
    validateURL(p.url, p.provider); need(!locations.has(p.url), "MANIFEST", "Duplicate remote part locations."); locations.add(p.url); total += p.plain_bytes;
  });
  need(total === value.archive_bytes, "MANIFEST", "Part sizes do not match the archive."); return value;
}
export async function downloadCached(url: string, provider: string, bytes: number, sha: string, directory: string,
  options: { request?: HTTP; concurrency?: number; progress?: Progress; reference?: Uint8Array } = {}) {
  validateURL(url, provider); need(Number.isSafeInteger(bytes) && bytes > 0 && bytes <= LIMIT.archive && isHash(sha), "TRANSFER", "Invalid cached download identity.");
  const cache = path.resolve(directory), marker = path.join(cache, "ranges.json"), file = path.join(cache, "cipher.age"), request = options.request || http;
  checkedDirectory(cache); need(exists(marker) || fs.readdirSync(cache).length === 0, "CACHE", "Range cache is not owned by this transfer.");
  const unlock = lock(cache);
  try {
    let state: any;
    if (exists(marker)) { state = readJSON(marker); need(state?.format === "session-bridge-ranges" && state.bytes === bytes && state.sha256 === sha && state.locator_sha256 === hash(provider + url), "CACHE", "Range cache belongs to another ciphertext."); }
    else { state = { format: "session-bridge-ranges", bytes, sha256: sha, locator_sha256: hash(provider + url), segment_bytes: 256 * 1024, ranges: {} }; atomicJSON(marker, state); }
    if (validFile(file, bytes, sha)) return file;
    const full = async () => { const data = await download(url, provider, bytes, sha, request); if (exists(file)) remove(file); writeNew(file, data); return file; };
    if (provider !== "filebin" || bytes <= state.segment_bytes || state.range_supported === false) return await full();
    need(state.segment_bytes === 256 * 1024, "CACHE", "Unexpected range size in cache.");
    const pieces = Array.from({ length: Math.ceil(bytes / state.segment_bytes) }, (_, i) => ({ index: i, start: i * state.segment_bytes, end: Math.min(bytes - 1, (i + 1) * state.segment_bytes - 1) }));
    const fetchPiece = async (piece: typeof pieces[number]) => {
      const name = path.join(cache, `range-${String(piece.index).padStart(5, "0")}.bin`), previous = state.ranges[piece.index];
      if (previous && validFile(name, piece.end - piece.start + 1, previous.sha256)) return;
      const data = await downloadRange(url, provider, piece.start, piece.end, bytes, request);
      if (options.reference) need(hash(data) === hash(options.reference.subarray(piece.start, piece.end + 1)), "HASH_MISMATCH", "Remote range differs from the local encrypted source.");
      if (exists(name)) remove(name); writeNew(name, data); state.ranges[piece.index] = { sha256: hash(data) }; atomicJSON(marker, state);
      options.progress?.({ phase: "range_verified", completed_ranges: Object.keys(state.ranges).length, total_ranges: pieces.length });
    };
    try {
      if (state.range_supported !== true) { await fetchPiece(pieces[0]); state.range_supported = true; atomicJSON(marker, state); }
      await pool(pieces, options.concurrency ?? 3, fetchPiece);
    } catch (error) {
      if (!(error instanceof BridgeError) || error.code !== "RANGE_UNSUPPORTED") throw error;
      state.range_supported = false; atomicJSON(marker, state); return await full();
    }
    const partial = path.join(cache, "cipher.partial"); if (exists(partial)) remove(partial);
    const fd = fs.openSync(partial, "wx", 0o600), digest = createHash("sha256"); let size = 0;
    try { for (const piece of pieces) {
      const data = readBytes(path.join(cache, `range-${String(piece.index).padStart(5, "0")}.bin`), state.segment_bytes);
      digest.update(data); let offset = 0; while (offset < data.length) { const n = fs.writeSync(fd, data, offset, data.length - offset); need(n > 0, "IO", "Range assembly failed."); offset += n; } size += data.length;
    } } finally { fs.closeSync(fd); }
    need(size === bytes && digest.digest("hex") === sha, "HASH_MISMATCH", "Assembled ciphertext differs from the trusted transfer.");
    if (exists(file)) remove(file); fs.renameSync(partial, file); return file;
  } finally { unlock(); }
}
export async function receiveTransfer(text: string, destination: string, options: TransferOptions = {}) {
  const transfer = parseTransferAny(text);
  const dest = path.resolve(destination); need(!exists(dest), "DEST_EXISTS", "Recovery destination already exists.");
  const cache = path.resolve(options.cache || dest + ".session-bridge-cache"), marker = path.join(cache, "cache.json");
  need(!inside(dest, cache) && !inside(cache, dest), "SCOPE", "Recovery and download cache directories must be separate.");
  need(Number.isSafeInteger(options.concurrency ?? 3) && (options.concurrency ?? 3) >= 1 && (options.concurrency ?? 3) <= 6, "ARGUMENT", "Concurrency must be between 1 and 6.");
  if (exists(cache)) need(exists(marker), "CACHE", "Existing cache is not owned by Session Bridge."); checkedDirectory(cache);
  if (!exists(marker)) writeJSON(marker, { format: "session-bridge-download", manifest_sha256: transfer.ciphertext_sha256, bundle_id: transfer.bundle_id });
  const state = readJSON(marker); need(state?.format === "session-bridge-download" && state.manifest_sha256 === transfer.ciphertext_sha256 && state.bundle_id === transfer.bundle_id, "CACHE", "Cache belongs to a different transfer.");
  const unlock = lock(cache), request = options.request || http; let success = false;
  try {
    if (transfer.version === 1) {
      const cipher = await downloadCached(transfer.download_url, transfer.provider, transfer.ciphertext_bytes, transfer.ciphertext_sha256,
        path.join(cache, "legacy-cipher"), { request, concurrency: options.concurrency, progress: options.progress });
      const plain = await open(readBytes(cipher, LIMIT.archive), transfer.identity);
      need(verifyBytes(plain).bundle_id === transfer.bundle_id, "IDENTITY_MISMATCH", "Recovered bundle differs from the transfer.");
      const archive = path.join(cache, "archive.zip"); if (exists(archive)) remove(archive); writeNew(archive, plain);
      const result = unpack(archive, dest, options);
      writeJSON(path.join(dest, "recovery/relay-report.json"), { transfer_version: 1, provider: transfer.provider, ciphertext_sha256: transfer.ciphertext_sha256, verified_at: now(), private_key_saved_in_recovery: false });
      success = true; return { ...result, transfer_version: 1, resumable: true };
    }
    const manifestFile = path.join(cache, "manifest.age");
    if (!validFile(manifestFile, transfer.ciphertext_bytes, transfer.ciphertext_sha256)) {
      const bytes = await download(transfer.download_url, transfer.provider, transfer.ciphertext_bytes, transfer.ciphertext_sha256, request);
      if (exists(manifestFile)) remove(manifestFile); writeNew(manifestFile, bytes);
    }
    const manifest = validatePartsManifest(parseJSON(await open(readBytes(manifestFile, LIMIT.meta), transfer.identity)), transfer.bundle_id);
    let completed = 0;
    await pool(manifest.parts, options.concurrency ?? TRANSFER_DEFAULTS.concurrency, async part => {
      const file = path.join(cache, `part-${String(part.index).padStart(5, "0")}.age`);
      if (!validFile(file, part.bytes, part.sha256)) {
        options.progress?.({ phase: "downloading", part: part.index + 1, total_parts: manifest.parts.length, completed_parts: completed, provider: part.provider });
        const partRequest: HTTP = (url, init, limit, policy) => request(url, init, limit, { ...policy,
          onProgress: event => options.progress?.({ phase: "network_progress", part: part.index + 1, provider: part.provider, ...event }) });
        const bytes = await download(part.url, part.provider, part.bytes, part.sha256, partRequest);
        if (exists(file)) remove(file); writeNew(file, bytes);
      }
      completed++; options.progress?.({ phase: "downloaded", part: part.index + 1, total_parts: manifest.parts.length, completed_parts: completed });
    });
    const partial = path.join(cache, "archive.partial"); if (exists(partial)) remove(partial);
    const fd = fs.openSync(partial, "wx", 0o600), digest = createHash("sha256"); let written = 0;
    try {
      for (const part of manifest.parts) {
        const plain = await open(readBytes(path.join(cache, `part-${String(part.index).padStart(5, "0")}.age`), MAX_PART), transfer.identity);
        need(plain.length === part.plain_bytes && hash(plain) === part.plain_sha256, "HASH_MISMATCH", "Decrypted part differs from its manifest.");
        digest.update(plain); let offset = 0; while (offset < plain.length) { const n = fs.writeSync(fd, plain, offset, plain.length - offset); need(n > 0, "IO", "Archive assembly failed."); offset += n; } written += plain.length;
      }
    } finally { fs.closeSync(fd); }
    need(written === manifest.archive_bytes && digest.digest("hex") === manifest.archive_sha256, "HASH_MISMATCH", "Assembled archive differs from the source.");
    const archive = path.join(cache, "archive.zip"); if (exists(archive)) remove(archive); fs.renameSync(partial, archive);
    const result = unpack(archive, dest, options);
    writeJSON(path.join(dest, "recovery/relay-report.json"), { transfer_version: 2, bundle_id: transfer.bundle_id, part_count: manifest.parts.length,
      providers: [...new Set(manifest.parts.map((p: any) => p.provider))], archive_sha256: manifest.archive_sha256, verified_at: now(), private_key_saved_in_recovery: false });
    success = true; return { ...result, transfer_version: 2, part_count: manifest.parts.length, resumable: true };
  } finally { unlock(); if (success) remove(cache); }
}
export async function resumeShare(output: string, options: TransferOptions = {}): Promise<any> {
  const out = path.resolve(output), stateFile = path.join(out, "checkpoint.json");
  need(exists(out) && fs.lstatSync(out).isDirectory() && !fs.lstatSync(out).isSymbolicLink(), "RESUME_MISMATCH", "Transfer output directory is missing or linked.");
  if (exists(stateFile)) { const state = readJSON(stateFile); need(state?.format === "session-bridge-upload", "RESUME_MISMATCH", "Unrecognized upload checkpoint.");
    return shareMultipart(state.source_file, state.requested_provider, state.ttl, out, { ...options,
      ...(state.adaptive_parts ? {} : { partBytes: state.configured_part_bytes ?? state.part_bytes }) }); }
  checkedDirectory(out); const unlock = lock(out);
  try {
    const receipt = readJSON(path.join(out, "upload-receipt.json")), cipher = readBytes(path.join(out, "payload.session.zip.age"), LIMIT.archive);
    const identity = readBytes(path.join(out, "identity.agekey"), 1024).toString().trim();
    need(cipher.length === receipt.ciphertext_bytes && hash(cipher) === receipt.ciphertext_sha256, "HASH_MISMATCH", "Legacy ciphertext differs from its saved receipt.");
    const transfer = parseTransfer(JSON.stringify({ ...receipt, identity, encryption: "age-v1-x25519", delete_after_restore: false }));
    const archive = await open(cipher, identity); need(verifyBytes(archive).bundle_id === transfer.bundle_id, "IDENTITY_MISMATCH", "Legacy receipt and encrypted bundle differ.");
    options.progress?.({ phase: "verifying_legacy_upload", bytes: cipher.length, provider: receipt.provider });
    const readbackCache = path.join(out, "legacy-readback.session-bridge-cache");
    await downloadCached(receipt.download_url, receipt.provider, cipher.length, receipt.ciphertext_sha256, readbackCache,
      { request: options.request, concurrency: options.concurrency ?? 6, progress: options.progress, reference: cipher });
    const prompt = path.join(out, "continuation-prompt.txt"); if (exists(prompt)) remove(prompt); writeNew(prompt, renderPrompt(transfer));
    atomicJSON(path.join(out, "verified-transfer.json"), receipt);
    remove(readbackCache);
    return { status: "prompt_ready", ...receipt, prompt_file: prompt, reused_existing_upload: true, remote_verified_at: now() };
  } finally { unlock(); }
}
export async function revokeTransfer(receiptFile: string, request: HTTP = http) {
  const receipt = readJSON(receiptFile), stateFile = path.join(path.dirname(receiptFile), "checkpoint.json");
  if (!exists(stateFile)) return revoke(receiptFile);
  const state = readJSON(stateFile);
  need(state?.format === "session-bridge-upload" && state.bundle_id === receipt.bundle_id, "RECEIPT", "Receipt does not match this upload checkpoint.");
  const remotes = [...state.parts.flatMap((p: any) => [p.remote, ...(p.previous_receipts || [])]),
    state.manifest?.remote, ...Object.values(state.probes || {}).map((p: any) => p.remote), ...(state.orphan_receipts || [])].filter(Boolean);
  const unique = [...new Map(remotes.map((r: any) => [r.download_url, r])).values()]; let removed = 0, unsupported = 0;
  await pool(unique, 2, async (remote: any) => {
    validateURL(remote.download_url, remote.provider);
    if (remote.provider !== "filebin") { unsupported++; return; }
    need(new URL(remote.download_url).hostname === "filebin.net", "URL", "Deletion requires the original Filebin locator.");
    const response = await request(remote.download_url, { method: "DELETE" });
    need([200, 404].includes(response.status), "DELETE_UNCONFIRMED", "A Filebin object could not be deleted; retry with the same receipt.");
    need((await request(remote.download_url)).status === 404, "DELETE_UNCONFIRMED", "A Filebin object remains available."); removed++;
  });
  return { status: unsupported ? "partial_deletion" : "public_entries_unavailable", bundle_id: state.bundle_id, deleted_objects: removed,
    unsupported_objects: unsupported, physical_erasure_verified: false, checked_at: now() };
}
