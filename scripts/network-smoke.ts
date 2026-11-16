import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { assert, ROOT, VERSION, digest } from "./distribution.ts";

// Invoked explicitly by the feature validation workflow. Only synthetic data leaves this runner.
const artifact = path.join(ROOT, "dist/network-artifact"), manifest = JSON.parse(fs.readFileSync(path.join(artifact, "manifest.json"), "utf8"));
const entry = manifest.artifacts.find((a: any) => a.target === "windows-x64");
assert(process.platform === "win32" && manifest.version === VERSION && entry, "Matching Windows artifact required");
const executable = path.join(artifact, entry.file);
assert(digest(fs.readFileSync(executable)) === entry.sha256, "Native executable differs from its build manifest");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-live-network-")), output = path.join(temp, "synthetic");
const env = { ...process.env, PATH: path.join(temp, "no-external-runtimes"), AI_AGENT: "claude" }; delete env.BUN_BE_BUN;
let report: any;
try {
  const child = Bun.spawn([executable, "smoke-test", "--live", "--provider", "auto", "--ttl", "provider-default", "--fixture-mib", "95", "--out", output],
    { env, cwd: temp, stdin: "ignore", stdout: "pipe", stderr: "inherit" });
  const [stdout, exit] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  assert(exit === 0, "Native public network test failed; no session content was uploaded"); report = JSON.parse(stdout);
  assert(report.status === "passed" && report.synthetic_fixture_mib === 95 && report.archive_bytes > 95 * 1024 ** 2 && report.part_count > 2 &&
    report.workspace_bytes_match && report.recovered_skill_executed_after_restore && report.standalone, "Large public transfer did not pass");
  const safe = { status: "passed", version: VERSION, platform: process.platform, provider: report.provider, synthetic_fixture_mib: 95,
    archive_bytes: report.archive_bytes, part_count: report.part_count, concurrency: report.concurrency,
    source_upload_and_readback_ms: report.source_upload_and_readback_ms, target_receive_ms: report.target_receive_ms,
    workspace_bytes_match: true, carried_skill_continued: true, external_runtime_required: false, tested_at: new Date().toISOString() };
  fs.writeFileSync(path.join(ROOT, "network-verification.json"), JSON.stringify(safe, null, 2) + "\n"); console.log(JSON.stringify(safe));
} finally {
  const receipt = path.join(output, "transfer/upload-receipt.json");
  if (fs.existsSync(receipt)) {
    const clean = Bun.spawnSync([executable, "revoke", "--receipt", receipt], { env, cwd: temp, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 180000 });
    console.log(JSON.stringify({ cleanup: clean.exitCode === 0 ? JSON.parse(Buffer.from(clean.stdout).toString()).status : "not_confirmed" }));
  }
  fs.rmSync(temp, { recursive: true, force: true });
}
