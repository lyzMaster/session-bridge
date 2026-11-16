import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";
import { checkPaths, LIMIT, need } from "./common.ts";
export type Entry = { data: Buffer; executable?: boolean };

// ZIP32 only, STORE/DEFLATE. No system unzip, extract-all, npm package or Python.
export function zipEncode(entries: Map<string, Entry>, validate = true): Buffer {
  if (validate) checkPaths([...entries.keys()]);
  need(entries.size <= LIMIT.files, "LIMIT", "Too many ZIP members.");
  const locals: Buffer[] = [], central: Buffer[] = []; let offset = 0, total = 0;
  for (const [name, entry] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
    const bytes = Buffer.from(name), data = entry.data, compressed = deflateRawSync(data), checksum = crc32(data) >>> 0;
    total += data.length; need(data.length <= LIMIT.file && total <= LIMIT.total, "LIMIT", "ZIP content exceeds limits.");
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt16LE(8, 8); h.writeUInt16LE(33, 12);
    h.writeUInt32LE(checksum, 14); h.writeUInt32LE(compressed.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(bytes.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt16LE(0x314, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(8, 10); c.writeUInt16LE(33, 14);
    c.writeUInt32LE(checksum, 16); c.writeUInt32LE(compressed.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(bytes.length, 28);
    c.writeUInt32LE(((0x8000 | (entry.executable ? 0o700 : 0o600)) * 65536) >>> 0, 38); c.writeUInt32LE(offset, 42);
    locals.push(h, bytes, compressed); central.push(c, bytes); offset += h.length + bytes.length + compressed.length;
    need(offset <= LIMIT.archive, "LIMIT", "ZIP exceeds archive byte limit.");
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.size, 8); end.writeUInt16LE(entries.size, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  const result = Buffer.concat([...locals, directory, end]); need(result.length <= LIMIT.archive, "LIMIT", "ZIP exceeds archive byte limit."); return result;
}
export function zipDecode(input: Uint8Array): Map<string, Entry> {
  const b = Buffer.from(input); need(b.length >= 22 && b.length <= LIMIT.archive, "ZIP", "Invalid ZIP size.");
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (b.readUInt32LE(i) === 0x06054b50 && i + 22 + b.readUInt16LE(i + 20) === b.length) { eocd = i; break; }
  need(eocd >= 0, "ZIP", "ZIP end record is missing.");
  const count = b.readUInt16LE(eocd + 10), length = b.readUInt32LE(eocd + 12), start = b.readUInt32LE(eocd + 16);
  need(b.readUInt16LE(eocd + 4) === 0 && b.readUInt16LE(eocd + 6) === 0 && count === b.readUInt16LE(eocd + 8) && count <= LIMIT.files && start + length === eocd, "ZIP", "Multi-disk, ZIP64 or malformed ZIP is unsupported.");
  const records: any[] = []; let p = start, total = 0;
  for (let n = 0; n < count; n++) {
    need(p + 46 <= eocd && b.readUInt32LE(p) === 0x02014b50, "ZIP", "Invalid ZIP directory entry.");
    const flags = b.readUInt16LE(p + 8), method = b.readUInt16LE(p + 10), checksum = b.readUInt32LE(p + 16), compressed = b.readUInt32LE(p + 20), size = b.readUInt32LE(p + 24), namesz = b.readUInt16LE(p + 28), extrasz = b.readUInt16LE(p + 30), commentsz = b.readUInt16LE(p + 32), local = b.readUInt32LE(p + 42), mode = b.readUInt32LE(p + 38) >>> 16;
    const end = p + 46 + namesz + extrasz + commentsz;
    need(end <= eocd && !(flags & ~0x808) && [0, 8].includes(method) && size <= LIMIT.file && compressed <= LIMIT.archive && local < start && [0, 0x8000].includes(mode & 0xf000) && b.readUInt16LE(p + 34) === 0, "ZIP", "Unsupported or oversized ZIP entry.");
    const rawName = b.subarray(p + 46, p + 46 + namesz);
    let name: string; try { name = new TextDecoder("utf-8", { fatal: true }).decode(rawName); } catch { throw new Error("Invalid ZIP filename encoding"); }
    total += size; need(total <= LIMIT.total, "LIMIT", "ZIP expansion exceeds aggregate byte limit.");
    records.push({ name, rawName, flags, method, checksum, compressed, size, local, mode }); p = end;
  }
  need(p === eocd, "ZIP", "ZIP directory length mismatch."); checkPaths(records.map(r => r.name));
  const entries = new Map<string, Entry>(), ranges: [number, number][] = [];
  for (const r of records) {
    const l = r.local; need(l + 30 <= start && b.readUInt32LE(l) === 0x04034b50, "ZIP", "Invalid local ZIP record.");
    const ns = b.readUInt16LE(l + 26), es = b.readUInt16LE(l + 28), dataStart = l + 30 + ns + es, dataEnd = dataStart + r.compressed;
    need(dataEnd <= start && b.readUInt16LE(l + 6) === r.flags && b.readUInt16LE(l + 8) === r.method && b.subarray(l + 30, l + 30 + ns).equals(r.rawName), "ZIP", "ZIP local/directory fields disagree.");
    if (!(r.flags & 8)) need(b.readUInt32LE(l + 14) === r.checksum && b.readUInt32LE(l + 18) === r.compressed && b.readUInt32LE(l + 22) === r.size, "ZIP", "ZIP size/checksum disagreement.");
    ranges.push([l, dataEnd]); const raw = b.subarray(dataStart, dataEnd);
    let data: Buffer;
    try { data = r.method === 0 ? Buffer.from(raw) : inflateRawSync(raw, { maxOutputLength: Math.max(1, r.size) }); }
    catch { need(false, "ZIP", "ZIP decompression failed or exceeded its declared length."); }
    need(data!.length === r.size && (crc32(data!) >>> 0) === r.checksum, "ZIP", "ZIP content checksum or length mismatch.");
    entries.set(r.name, { data: data!, executable: !!(r.mode & 0o111) });
  }
  ranges.sort((a, b) => a[0] - b[0]); for (let i = 1; i < ranges.length; i++) need(ranges[i - 1][1] <= ranges[i][0], "ZIP", "Overlapping ZIP members.");
  return entries;
}
