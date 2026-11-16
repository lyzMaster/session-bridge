import fs from "node:fs";
import path from "node:path";
import { PROJECT, ROOT, VERSION, validateRelease } from "./distribution.ts";

const output = path.join(ROOT, "site-dist"); fs.mkdirSync(output, { recursive: true });
for (const name of fs.readdirSync(path.join(ROOT, "site"))) fs.cpSync(path.join(ROOT, "site", name), path.join(output, name), { recursive: true });
let release: any = null;
const index = Bun.argv.indexOf("--manifest");
if (index >= 0) release = validateRelease(JSON.parse(fs.readFileSync(Bun.argv[index + 1], "utf8")));
else if (!Bun.argv.includes("--preview")) {
  const response = await fetch(`${PROJECT.repository_url}/releases/latest/download/release-manifest.json`, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error("Published release manifest is unavailable; use --preview only for local development");
  release = validateRelease(await response.json());
}
fs.writeFileSync(path.join(output, "release.json"), JSON.stringify({ ...PROJECT, version: release?.version || VERSION, published: !!release,
  tag: release?.tag || null, platforms: release?.platforms || {}, verification: release?.verification || {} }, null, 2) + "\n");
fs.copyFileSync(path.join(ROOT, "INSTALL.md"), path.join(output, "INSTALL.md"));
fs.copyFileSync(path.join(ROOT, "LICENSE"), path.join(output, "LICENSE"));
fs.writeFileSync(path.join(output, ".nojekyll"), "");
console.log(JSON.stringify({ status: "site_built", version: release?.version || VERSION, published_release: !!release }));
