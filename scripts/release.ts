import fs from "node:fs";
import path from "node:path";
import { assembleRelease, assert, PROJECT, ROOT, VERSION } from "./distribution.ts";

const output = path.join(ROOT, "dist/release");
const manifest = assembleRelease(path.join(ROOT, "dist/platforms"), output);
if (!Bun.argv.includes("--publish")) { console.log(JSON.stringify({ status: "assembled", version: manifest.version })); process.exit(0); }
assert(process.env.GITHUB_REF_NAME === "v" + VERSION, "Release tag must match package version");
const token = process.env.GITHUB_TOKEN; assert(token, "GitHub Actions token missing");
const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "session-bridge-release" };
async function request(resource: string, init: RequestInit = {}, accepted = [200, 201]) {
  const url = resource.startsWith("https://") ? resource : `https://api.github.com/repos/${PROJECT.repository}${resource}`;
  assert(["api.github.com", "uploads.github.com"].includes(new URL(url).hostname), "Unexpected publishing endpoint");
  const response = await fetch(url, { ...init, headers: { ...headers, ...init.headers } });
  if (!accepted.includes(response.status)) throw new Error(`GitHub publishing request failed: HTTP ${response.status} ${resource.split("?")[0]}`);
  return response.status === 204 ? null : response.json();
}
let release = await request(`/releases/tags/v${VERSION}`, {}, [200, 404]);
if (release?.message === "Not Found") release = null;
if (release) assert(release.draft, "Published release assets are immutable to this publisher; bump the version");
else release = await request("/releases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
  tag_name: "v" + VERSION, target_commitish: process.env.GITHUB_SHA, name: "Session Bridge " + VERSION, draft: true, prerelease: false,
  body: "Windows x64 and macOS Universal standalone releases. Download one executable and run install. No external Bun, Node, Git, Python or age required.\n\nNative Windows/macOS validation passed before publication. See native-verification.json and SHA256SUMS.\n\nAgent setup: https://github.com/lyzMaster/session-bridge/blob/main/INSTALL.md\nHomepage: https://lyzmaster.github.io/session-bridge/" }) });
for (const filename of fs.readdirSync(output).sort()) {
  const previous = release.assets?.find((a: any) => a.name === filename);
  if (previous) await request(`/releases/assets/${previous.id}`, { method: "DELETE" }, [204]);
  const url = release.upload_url.split("{")[0] + "?name=" + encodeURIComponent(filename);
  await request(url, { method: "POST", headers: { "Content-Type": "application/octet-stream", "Content-Length": String(fs.statSync(path.join(output, filename)).size) }, body: Bun.file(path.join(output, filename)) as any,
    signal: AbortSignal.timeout(600000) });
}
const published = await request(`/releases/${release.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: false, make_latest: "true" }) });
console.log(JSON.stringify({ status: "published", version: VERSION, url: published.html_url }));
await request("/actions/workflows/pages.yml/dispatches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: PROJECT.default_branch }) }, [204]);
