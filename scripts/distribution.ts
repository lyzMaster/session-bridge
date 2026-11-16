import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export const ROOT = path.resolve(import.meta.dir, "..");
export const PROJECT = JSON.parse(fs.readFileSync(path.join(ROOT, "project.json"), "utf8"));
export const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
export const FILES: Record<string, string> = { "macos-universal": "session-bridge-macos-universal", "windows-x64": "session-bridge-windows-x64.exe" };
export const digest = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
export function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

export function validateRelease(manifest: any) {
  assert(manifest?.schema_version === 1 && manifest.repository === PROJECT.repository, "Unexpected release identity");
  assert(/^\d+\.\d+\.\d+$/.test(manifest.version) && manifest.tag === "v" + manifest.version, "Invalid release version");
  for (const [target, filename] of Object.entries(FILES)) {
    const a = manifest.platforms?.[target];
    assert(a?.filename === filename && Number.isSafeInteger(a.bytes) && a.bytes > 0 && a.bytes <= 160000000 && /^[a-f0-9]{64}$/.test(a.sha256), "Invalid artifact metadata");
    assert(a.url === `${PROJECT.repository_url}/releases/download/${manifest.tag}/${filename}`, "Artifact URL is not pinned to this release");
  }
  return manifest;
}
export function assembleRelease(platformsDirectory: string, outputDirectory: string) {
  const platforms: Record<string, any> = {}, verification: Record<string, any> = {};
  fs.mkdirSync(outputDirectory, { recursive: true });
  for (const target of Object.keys(FILES)) {
    const directory = path.join(platformsDirectory, target), build = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
    assert(build.version === VERSION, "Build version mismatch");
    const artifact = build.artifacts.find((a: any) => a.target === target);
    assert(artifact?.file === FILES[target], "Wrong executable name");
    const input = path.join(directory, artifact.file);
    assert(fs.lstatSync(input).isFile(), "Executable must be a regular file");
    const bytes = fs.readFileSync(input);
    assert(bytes.length === artifact.bytes && digest(bytes) === artifact.sha256, "Executable differs from build manifest");
    const report = JSON.parse(fs.readFileSync(path.join(directory, "native-verification.json"), "utf8"));
    assert(report.status === "passed" && report.version === VERSION && report.standalone && report.external_runtime_required === false, "Native validation did not pass");
    assert(report.platform === (target === "windows-x64" ? "win32" : "darwin"), "Validation ran on the wrong OS");
    fs.copyFileSync(input, path.join(outputDirectory, artifact.file));
    platforms[target] = { filename: artifact.file, bytes: bytes.length, sha256: artifact.sha256,
      url: `${PROJECT.repository_url}/releases/download/v${VERSION}/${artifact.file}` };
    verification[target] = report;
  }
  const manifest = validateRelease({ schema_version: 1, repository: PROJECT.repository, version: VERSION, tag: "v" + VERSION,
    minimum_bootstrap_version: "0.6.0", protocol: { transfer: [1, 2], bundles: ["1.0", "1.1"] }, platforms,
    verification: Object.fromEntries(Object.entries(verification).map(([k, v]) => [k, { status: v.status, platform: v.platform, arch: v.arch }])) });
  fs.writeFileSync(path.join(outputDirectory, "release-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(path.join(outputDirectory, "native-verification.json"), JSON.stringify(verification, null, 2) + "\n");
  const sums = [...Object.values(FILES), "release-manifest.json", "native-verification.json"].map(name =>
    digest(fs.readFileSync(path.join(outputDirectory, name))) + "  " + name).join("\n") + "\n";
  fs.writeFileSync(path.join(outputDirectory, "SHA256SUMS"), sums);
  return manifest;
}
