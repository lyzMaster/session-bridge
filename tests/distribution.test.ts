import { expect, test } from "bun:test";
import { FILES, PROJECT, validateRelease } from "../scripts/distribution.ts";

function manifest() {
  return { schema_version: 1, repository: PROJECT.repository, version: "0.5.0", tag: "v0.5.0", platforms: Object.fromEntries(Object.entries(FILES).map(([target, filename]) =>
    [target, { filename, bytes: 123456789, sha256: "a".repeat(64), url: `${PROJECT.repository_url}/releases/download/v0.5.0/${filename}` }])) };
}
test("release manifest pins both platforms to the same repository and version", () => {
  expect(validateRelease(manifest()).tag).toBe("v0.5.0");
});
test("release validation rejects foreign, mutable or escaping artifact URLs", () => {
  for (const value of ["https://evil.invalid/a.exe", `${PROJECT.repository_url}/releases/latest/download/session-bridge-windows-x64.exe`,
    "https://github.com/another/repo/releases/download/v0.5.0/session-bridge-windows-x64.exe"]) {
    const m = manifest(); m.platforms["windows-x64"].url = value; expect(() => validateRelease(m)).toThrow();
  }
});
test("release validation rejects malformed names, hashes, byte limits and version mismatches", () => {
  for (const [key, value] of [["filename", "../anything.exe"], ["sha256", "invalid"], ["bytes", 170000000], ["bytes", -1]]) {
    const m = manifest(); (m.platforms["windows-x64"] as any)[key] = value; expect(() => validateRelease(m)).toThrow();
  }
  const m = manifest(); m.tag = "v0.4.0"; expect(() => validateRelease(m)).toThrow();
});
