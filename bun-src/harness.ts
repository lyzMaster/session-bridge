import * as fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getSupportedAgents, detectAgents, version as skillsVersion } from "skills";
import { determineAgent } from "@vercel/detect-agent";
import { exists, need } from "./common.ts";

export const SKILLS_ENGINE = { package: "skills", version: skillsVersion, detector: "@vercel/detect-agent@1.2.7", telemetry: false };
export type TargetOptions = { skillsDir?: string; harness?: string; scope?: string; cwd?: string };
const aliases: Record<string, string> = { claude: "claude-code", cowork: "claude-code", "cursor-cli": "cursor", gemini: "gemini-cli",
  "augment-cli": "augment", "github-copilot-cli": "github-copilot" };
export const harnessID = (name: string) => aliases[name] || name;
function strongRunningHints() {
  const e = process.env;
  // This is an ambiguity guard around the pinned detector, not an installation path table.
  // Nested agents may inherit the outer agent's variables; do not pick one by ordering.
  const hints: [string, boolean][] = [
    ["cursor", !!(e.CURSOR_AGENT?.trim() || e.CURSOR_EXTENSION_HOST_ROLE === "agent-exec")],
    ["gemini-cli", !!e.GEMINI_CLI], ["codex", !!(e.CODEX_SANDBOX || e.CODEX_CI || e.CODEX_THREAD_ID)],
    ["claude-code", !!(e.CLAUDECODE || e.CLAUDE_CODE)], ["antigravity", !!e.ANTIGRAVITY_AGENT],
    ["augment", !!e.AUGMENT_AGENT], ["opencode", e.OPENCODE === "1" || !!e.OPENCODE_CLIENT],
    ["replit", !!e.REPL_ID], ["github-copilot", !!(e.COPILOT_MODEL || e.COPILOT_ALLOW_ALL || e.COPILOT_GITHUB_TOKEN)],
  ];
  return hints.filter(([, active]) => active).map(([name]) => name);
}

export async function detectHarness(options: TargetOptions = {}) {
  const cwd = path.resolve(options.cwd || process.cwd()), scope = options.scope || "global";
  need(["global", "project"].includes(scope), "SCOPE", "Installation scope must be global or project.");
  need(exists(cwd) && fs.statSync(cwd).isDirectory(), "TARGET", "Project directory does not exist.");
  const supported = getSupportedAgents(), result = await determineAgent();
  let running = result.isAgent ? result.agent.name : null;
  const hints = strongRunningHints(), conflicting = !process.env.AI_AGENT?.trim() && hints.length > 1 ? hints : [];
  // A trace ID is also inherited by ordinary Cursor terminals. Match upstream's stronger check.
  if (running === "cursor" && !process.env.AI_AGENT?.trim() && !process.env.CURSOR_AGENT?.trim() && process.env.CURSOR_EXTENSION_HOST_ROLE !== "agent-exec") running = hints.length === 1 ? hints[0] : null;
  if (conflicting.length) running = null;
  const installed = (await detectAgents({ cwd })).agents;
  let selected: string | null = null, basis = "unresolved";
  if (options.harness) { selected = harnessID(options.harness); basis = "explicit-harness"; }
  else if (running) { selected = harnessID(running); basis = "running-harness"; }
  else if (conflicting.length) basis = "conflicting-running-signals";
  else if (installed.length === 1) { selected = installed[0].id; basis = "only-installed-harness"; }
  const agent = supported.find(a => a.id === selected);
  if (options.skillsDir) basis = "explicit-directory";
  const directory = options.skillsDir ? path.resolve(cwd, options.skillsDir) : agent ?
    (scope === "project" ? path.resolve(cwd, agent.projectSkillsDir) : agent.globalSkillsDir) : null;
  const candidates = directory ? [directory] : [];
  // Existing Codex installations from earlier versions remain valid candidates. New installs
  // use the current upstream directory rule; an explicit directory never searches elsewhere.
  if (!options.skillsDir && agent?.id === "codex") candidates.push(scope === "global" ?
    path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "skills") : path.join(cwd, ".codex/skills"));
  return { status: directory ? "detected" : "selection_required", harness: agent?.id || null, running_harness: running,
    selection_basis: basis, scope, cwd, skills_directory: directory, candidate_directories: [...new Set(candidates)],
    conflicting_running_harnesses: conflicting, installed_harnesses: installed.map(a => a.id), supported_harnesses: supported.map(a => a.id), engine: SKILLS_ENGINE };
}

export async function resolveInstallTarget(options: TargetOptions = {}) {
  const target = await detectHarness(options);
  need(target.skills_directory, "HARNESS_SELECTION", "Cannot select a single supported harness. Use --harness <id> or --skills-dir <directory>; inspect detect-harness for candidates.");
  return target;
}
