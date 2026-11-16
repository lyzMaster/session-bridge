import * as fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newDir, writeNew } from "./common.ts";
import { EMBEDDED_FILES } from "./embedded.ts";
import { STANDALONE } from "./runtime.ts";

// Documents are embedded at build time. Installing never downloads or executes a bootstrap.
export function materializeDistribution(destination: string, entryURL: string) {
  const root = newDir(destination);
  for (const [name, data] of Object.entries(EMBEDDED_FILES)) writeNew(path.join(root, name), data);
  const executable = STANDALONE ? (process.platform === "win32" ? "session-bridge.exe" : "session-bridge") : "scripts/session-bridge.ts";
  const target = path.join(root, executable);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.copyFileSync(STANDALONE ? process.execPath : fileURLToPath(entryURL), target, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(target, 0o700);
  return root;
}
