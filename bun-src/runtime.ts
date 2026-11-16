import * as fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { need } from "./common.ts";

declare const __SB_STANDALONE__: boolean;
export const STANDALONE = typeof __SB_STANDALONE__ !== "undefined" && __SB_STANDALONE__;
export function selfCommand(args: string[], entryURL: string): string[] {
  return STANDALONE ? [process.execPath, ...args] : [process.execPath, "--no-install", fileURLToPath(entryURL), ...args];
}
export function scriptCommand(script: string, args: string[] = []) {
  const file = path.resolve(script);
  need(fs.lstatSync(file).isFile(), "SCRIPT", "Expected an explicit local script file.");
  // Compiled Bun keeps its runtime CLI. This uses this executable itself, never a PATH bun.
  return { cmd: [process.execPath, "--no-install", file, ...args],
    env: STANDALONE ? { ...process.env, BUN_BE_BUN: "1" } : { ...process.env } };
}
export function executeScript(script: string, args: string[] = [], inherit = false) {
  const command = scriptCommand(script, args);
  const result = Bun.spawnSync(command.cmd, { env: command.env, stdin: "inherit",
    stdout: inherit ? "inherit" : "pipe", stderr: inherit ? "inherit" : "pipe", timeout: 120000 });
  need(result.exitCode === 0, "SCRIPT_FAILED", "Requested script failed; no dependency installation was attempted.");
  return { status: "script_completed", exit_code: result.exitCode,
    stdout: inherit ? "" : Buffer.from(result.stdout).toString("utf8") };
}
