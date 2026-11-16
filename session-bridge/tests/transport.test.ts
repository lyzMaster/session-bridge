import { afterEach, beforeEach, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { BridgeError, temporary, remove, syntheticFixture, prepare, pack, writeNew, readBytes, readJSON, hash, encrypt, shareMultipart,
  receiveTransfer, parseTransferAny, resumeShare, httpOnce, withRetries, validatePartsManifest, downloadCached, tuneTransfer, LIMIT } from "../scripts/session-bridge.ts";

let root: string, archive: string;
beforeEach(() => {
  root = temporary(undefined, "bridge-transport-test-"); const fixture = syntheticFixture(path.join(root, "source"));
  writeNew(path.join(root, "source/project/random.bin"), randomBytes(48 * 1024));
  const stage = prepare(fixture); archive = path.join(root, "task.zip"); pack(stage.staging, archive);
});
afterEach(() => remove(root));

function relayFixture() {
  const objects = new Map<string, Buffer>(), posts = new Map<string, number>(), gets = new Map<string, number>();
  let reject = "", failures = 0, active = 0, maximum = 0, tempshSlow = 15;
  const request = async (url: string, options: RequestInit = {}) => {
    if (options.signal?.aborted) throw new BridgeError("CANCELLED", "Synthetic cancellation");
    const uploading = options.method === "POST" && (url === "https://temp.sh/upload" || url === "https://uguu.se/upload" || url.startsWith("https://filebin.net/") && options.body instanceof Uint8Array);
    if (uploading) {
      const data = options.body instanceof Uint8Array ? Buffer.from(options.body) : Buffer.from(await (options.body as FormData).get(url.includes("uguu") ? "files[]" : "file")!.arrayBuffer());
      expect(data.subarray(0, 22).toString()).toBe("age-encryption.org/v1\n");
      const locator = url.includes("filebin") ? url : url.includes("uguu") ? "https://a.uguu.se/" + crypto.randomUUID() + ".age" : "https://temp.sh/test/" + crypto.randomUUID() + ".age";
      objects.set(locator, data); posts.set(hash(data), (posts.get(hash(data)) || 0) + 1);
      if (url.includes("filebin")) return { status: 201, headers: new Headers(), data: Buffer.from(JSON.stringify({ file: { bytes: data.length, sha256: hash(data) }, bin: { expired_at: "2099-01-01T00:00:00Z" } })) };
      return { status: 200, headers: new Headers(), data: Buffer.from(url.includes("uguu") ? JSON.stringify({ success: true, files: [{ url: locator }] }) : locator) };
    }
    active++; maximum = Math.max(maximum, active);
    try {
      await new Promise<void>((resolve, rejectPromise) => {
        const timer = setTimeout(resolve, url.includes("temp.sh") ? tempshSlow : 2);
        options.signal?.addEventListener("abort", () => { clearTimeout(timer); rejectPromise(new BridgeError("CANCELLED", "Synthetic cancellation")); }, { once: true });
      });
      gets.set(url, (gets.get(url) || 0) + 1);
      if ((reject === "next" || reject === url) && failures-- > 0) { reject = ""; throw new BridgeError("NETWORK", "Synthetic disconnect"); }
      return { status: objects.has(url) ? 200 : 404, headers: new Headers({ "content-type": "application/octet-stream" }), data: objects.get(url) || Buffer.alloc(0) };
    } finally { active--; }
  };
  return { request, objects, posts, gets, get maximum() { return maximum; }, fail: (url = "next", count = 1) => { reject = url; failures = count; }, slowTempsh: (ms: number) => { tempshSlow = ms; } };
}

test("active HTTP bodies can outlive the idle deadline; stalled bodies abort", async () => {
  let timers: ReturnType<typeof setInterval>[] = [];
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array([1]));
      if (new URL(request.url).pathname === "/stall") return;
      let n = 0; const timer = setInterval(() => { controller.enqueue(new Uint8Array([2])); if (++n === 8) { clearInterval(timer); controller.close(); } }, 30); timers.push(timer);
    }, cancel() { timers.forEach(clearInterval); } }));
  } });
  try {
    const response = await httpOnce(`http://127.0.0.1:${server.port}/active`, {}, 100, { idleMs: 90, headerMs: 500, totalMs: 3000 });
    expect(response.data.length).toBe(9);
    await expect(httpOnce(`http://127.0.0.1:${server.port}/stall`, {}, 100, { idleMs: 80, headerMs: 500, totalMs: 3000 })).rejects.toMatchObject({ code: "IDLE_TIMEOUT" });
  } finally { timers.forEach(clearInterval); server.stop(true); }
});
test("transient failures retry with backoff; permanent denial and TLS do not", async () => {
  const delays: number[] = []; let calls = 0;
  const request = withRetries(async () => { calls++; if (calls === 1) throw new BridgeError("NETWORK", "Disconnect"); return { status: calls === 2 ? 503 : 200, headers: new Headers(), data: Buffer.from("ok") }; }, { sleep: async ms => { delays.push(ms); } });
  expect((await request("https://filebin.net/test")).status).toBe(200); expect(calls).toBe(3); expect(delays.length).toBe(2);
  let denied = 0; expect((await withRetries(async () => { denied++; return { status: 403, headers: new Headers(), data: Buffer.alloc(0) }; })("https://filebin.net/test")).status).toBe(403); expect(denied).toBe(1);
  await expect(withRetries(async () => { throw new BridgeError("TLS", "Certificate rejected"); })("https://filebin.net/test")).rejects.toMatchObject({ code: "TLS" });
  await expect(withRetries(async () => ({ status: 429, headers: new Headers({ "retry-after": "600" }), data: Buffer.alloc(0) }))("https://filebin.net/test")).rejects.toMatchObject({ code: "RETRY_LATER" });
});
test("failed upload verification resumes accepted parts without uploading them again", async () => {
  const relay = relayFixture(), output = path.join(root, "upload"); relay.fail();
  await expect(shareMultipart(archive, "filebin", "provider-default", output, { partBytes: 8192, concurrency: 3, request: relay.request })).rejects.toMatchObject({ code: "NETWORK" });
  expect(fs.existsSync(path.join(output, "continuation-prompt.txt"))).toBe(false);
  const before = new Map(relay.posts), identity = readBytes(path.join(output, "identity.agekey")).toString().trim();
  const result = await resumeShare(output, { request: relay.request, concurrency: 3 });
  for (const [sha, count] of before) expect(relay.posts.get(sha)).toBe(count);
  expect(result.status).toBe("prompt_ready"); expect(result.part_count).toBeGreaterThan(2); expect(relay.maximum).toBeGreaterThan(1);
  const prompt = readBytes(result.prompt_file, LIMIT.transfer).toString(); expect(parseTransferAny(prompt).version).toBe(2);
  for (const bytes of relay.objects.values()) expect(bytes.includes(Buffer.from(identity))).toBe(false);
});
test("receiving resumes only missing parts and preserves carried Skills and bytes", async () => {
  const relay = relayFixture(), shared = await shareMultipart(archive, "filebin", "provider-default", path.join(root, "upload"), { partBytes: 8192, request: relay.request });
  const prompt = readBytes(shared.prompt_file, LIMIT.transfer).toString(), destination = path.join(root, "received");
  const urls = readJSON(path.join(root, "upload/checkpoint.json")).parts.map((p: any) => p.remote.download_url);
  relay.fail(urls[1]);
  await expect(receiveTransfer(prompt, destination, { request: relay.request, concurrency: 3 })).rejects.toMatchObject({ code: "NETWORK" });
  expect(fs.existsSync(destination)).toBe(false); const before = new Map(relay.gets);
  const cache = destination + ".session-bridge-cache", cached = fs.readdirSync(cache).filter(f => /^part-/.test(f)).map(f => Number(f.match(/\d+/)![0]));
  fs.renameSync(path.join(root, "source"), path.join(root, "source-offline"));
  const result = await receiveTransfer(prompt, destination, { request: relay.request, skillsDir: path.join(root, "registry"), concurrency: 3 });
  expect(result.transfer_version).toBe(2); for (const index of cached) expect(relay.gets.get(urls[index])).toBe(before.get(urls[index]));
  expect(readBytes(path.join(destination, "workspace/r001/random.bin"))).toEqual(readBytes(path.join(root, "source-offline/project/random.bin")));
  expect(fs.existsSync(path.join(root, "registry/sum-skill/SKILL.md"))).toBe(true); expect(fs.existsSync(cache)).toBe(false);
});
test("network route selection measures actual upload/readback and chooses the faster verified relay", async () => {
  const relay = relayFixture(), events: any[] = [];
  const result = await shareMultipart(archive, "auto", "provider-default", path.join(root, "upload"), { partBytes: 8192, request: relay.request, progress: event => events.push(event) });
  expect(result.provider).toBe("filebin"); expect(events.some(e => e.phase === "testing_relay" && e.provider === "tempsh")).toBe(true);
  expect(events.some(e => e.phase === "testing_relay" && e.provider === "filebin")).toBe(true); expect(events.some(e => e.phase === "relay_selected" && e.roundtrip_ms >= 0)).toBe(true);
});
test("multipart manifests reject reordered, duplicate, oversized and off-site parts", () => {
  const part = { index: 0, provider: "filebin", url: "https://filebin.net/test/a.age", bytes: 300, sha256: "a".repeat(64), plain_bytes: 10, plain_sha256: "b".repeat(64) };
  const manifest = { format: "session-bridge-parts", version: 1, bundle_id: "test", archive_bytes: 20, archive_sha256: "c".repeat(64), parts: [part, { ...part, index: 1, url: "https://filebin.net/test/b.age" }] };
  expect(validatePartsManifest(manifest, "test")).toBe(manifest);
  for (const mutation of [
    (m: any) => m.parts.reverse(), (m: any) => m.parts[1].url = m.parts[0].url,
    (m: any) => m.parts[0].url = "https://evil.invalid/part", (m: any) => m.parts[0].bytes = LIMIT.archive,
    (m: any) => m.archive_bytes++,
  ]) { const bad = structuredClone(manifest); mutation(bad); expect(() => validatePartsManifest(bad, "test")).toThrow(); }
});
test("already uploaded legacy ciphertext can finish readback without re-uploading", async () => {
  const output = path.join(root, "legacy"); fs.mkdirSync(output); const file = path.join(output, "payload.session.zip.age"), identity = await encrypt(archive, file);
  const bytes = readBytes(file), bundleId = readJSON(path.join(root, "source/staging/reports/export.json")).bundle_id;
  writeNew(path.join(output, "identity.agekey"), identity + "\n");
  fs.writeFileSync(path.join(output, "upload-receipt.json"), JSON.stringify({ version: 1, provider: "filebin", download_url: "https://filebin.net/legacy/payload.age", bundle_id: bundleId, ciphertext_bytes: bytes.length, ciphertext_sha256: hash(bytes) }));
  let posts = 0; const result = await resumeShare(output, { request: async (_url, options) => { if (options?.method === "POST") posts++; return { status: 200, headers: new Headers(), data: bytes }; } });
  expect(result.reused_existing_upload).toBe(true); expect(posts).toBe(0); expect(parseTransferAny(readBytes(result.prompt_file).toString()).version).toBe(1);
});
test("range downloads retain completed segments and reject a changed whole ciphertext", async () => {
  const data = randomBytes(1024 * 1024 + 13), gets = new Map<number, number>(); let fail = true;
  const request = async (_url: string, init: RequestInit = {}) => {
    const range = new Headers(init.headers).get("range")!.match(/^bytes=(\d+)-(\d+)$/)!;
    const start = Number(range[1]), end = Number(range[2]); gets.set(start, (gets.get(start) || 0) + 1);
    if (start === 256 * 1024 && fail) { fail = false; throw new BridgeError("NETWORK", "Synthetic range disconnect"); }
    return { status: 206, headers: new Headers({ "content-range": `bytes ${start}-${end}/${data.length}` }), data: data.subarray(start, end + 1) };
  };
  const cache = path.join(root, "ranges"); await expect(downloadCached("https://filebin.net/test/cipher.age", "filebin", data.length, hash(data), cache, { request })).rejects.toMatchObject({ code: "NETWORK" });
  const before = gets.get(0), file = await downloadCached("https://filebin.net/test/cipher.age", "filebin", data.length, hash(data), cache, { request });
  expect(gets.get(0)).toBe(before); expect(readBytes(file)).toEqual(data);
  const wrong = path.join(root, "wrong-ranges"); await expect(downloadCached("https://filebin.net/test/cipher.age", "filebin", data.length, "a".repeat(64), wrong, { request })).rejects.toMatchObject({ code: "HASH_MISMATCH" });
  expect(fs.existsSync(path.join(wrong, "cipher.age"))).toBe(false);
});
test("a server ignoring Range falls back to a bounded hash-checked full object", async () => {
  const data = randomBytes(300 * 1024); let calls = 0;
  const file = await downloadCached("https://filebin.net/test/cipher.age", "filebin", data.length, hash(data), path.join(root, "range-fallback"),
    { request: async () => { calls++; return { status: 200, headers: new Headers(), data }; } });
  expect(readBytes(file)).toEqual(data); expect(calls).toBe(2);
});
test("slow measurements shrink automatic parts and increase bounded concurrency", () => {
  const slow = tuneTransfer(95 * 1024 ** 2, 256 * 1024, 20000), fast = tuneTransfer(95 * 1024 ** 2, 256 * 1024, 20);
  expect(slow.partBytes).toBeLessThan(fast.partBytes); expect(slow.concurrency).toBeGreaterThan(fast.concurrency);
  expect(slow.partBytes).toBeGreaterThanOrEqual(256 * 1024); expect(slow.concurrency).toBeLessThanOrEqual(6);
  expect(tuneTransfer(95 * 1024 ** 2, 256 * 1024, 20000, 8 * 1024 ** 2, 2)).toMatchObject({ partBytes: 8 * 1024 ** 2, concurrency: 2 });
});
test("automatic repartitioning preserves the verified sample and remains resumable", async () => {
  const fixture = syntheticFixture(path.join(root, "adaptive-source")); writeNew(path.join(root, "adaptive-source/project/data.bin"), randomBytes(2 * 1024 ** 2));
  const stage = prepare(fixture), file = path.join(root, "adaptive.zip"); pack(stage.staging, file);
  const relay = relayFixture(), clock = Date.now; let virtual = clock(); Date.now = () => virtual;
  const request = async (url: string, init: RequestInit = {}) => { const result = await relay.request(url, init); if (!init.body) virtual += 20000; return result; };
  try {
    const out = path.join(root, "adaptive-out"), result = await shareMultipart(file, "auto", "provider-default", out, { request });
    const checkpoint = readJSON(path.join(out, "checkpoint.json")); expect(checkpoint.part_bytes).toBeLessThan(8 * 1024 ** 2); expect(result.part_count).toBeGreaterThan(2);
    const before = new Map(relay.posts); const resumed = await resumeShare(out, { request });
    expect(resumed.part_count).toBe(result.part_count); expect([...relay.posts]).toEqual([...before]);
    const restored = await receiveTransfer(readBytes(result.prompt_file).toString(), path.join(root, "adaptive-received"), { request });
    expect(restored.transfer_version).toBe(2); expect(readBytes(path.join(root, "adaptive-received/workspace/r001/data.bin"))).toEqual(readBytes(path.join(root, "adaptive-source/project/data.bin")));
  } finally { Date.now = clock; }
});
