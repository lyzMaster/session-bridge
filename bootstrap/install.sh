#!/bin/bash
# Session Bridge bootstrap. macOS system tools only; no Node, Bun, Git or Python.
set -euo pipefail
shopt -s nullglob
repo="lyzMaster/session-bridge"
release="latest"
offline=0
upgrade=0
skills_dir=""
scope="global"
project_dir="$PWD"
forward=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --release) release="${2:?Missing release tag}"; shift 2 ;;
    --offline) offline=1; shift ;;
    --upgrade|--replace) upgrade=1; forward+=(--replace); shift ;;
    --skills-dir) skills_dir="${2:?Missing directory}"; forward+=(--skills-dir "$2"); shift 2 ;;
    --cwd) project_dir="${2:?Missing project}"; forward+=(--cwd "$2"); shift 2 ;;
    --scope) scope="${2:?Missing scope}"; shift 2 ;;
    --harness) forward+=("$1" "${2:?Missing option value}"); shift 2 ;;
    --help|-h)
      printf '%s\n' 'Usage: /bin/bash install.sh [--harness ID] [--scope global|project] [--cwd DIR] [--skills-dir DIR] [--release vX.Y.Z] [--offline] [--upgrade]'
      exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; exit 2 ;;
  esac
done
forward+=(--scope "$scope")
[[ "$OSTYPE" == darwin* ]] || { printf '%s\n' 'This bootstrap supports macOS. Use install.ps1 on Windows.' >&2; exit 2; }
[[ "$release" == latest || "$release" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { printf '%s\n' 'Invalid release tag.' >&2; exit 2; }
project_dir="$(cd "$project_dir" && pwd -P)"
read_json() { printf '%s' "$1" | /usr/bin/plutil -extract "$2" raw -o - - 2>/dev/null; }
usable() {
  local candidate="$1" data
  [[ -f "$candidate" && -x "$candidate" ]] || return 1
  data="$("$candidate" doctor 2>/dev/null)" || return 1
  [[ "$(read_json "$data" ready)" == true && "$(read_json "$data" standalone)" == true &&
     "$(read_json "$data" skills_engine.package)" == skills &&
     "$(read_json "$data" compatibility.installation_receipt_version)" == 1 ]]
}
if [[ "$upgrade" == 0 ]]; then
  candidates=()
  if [[ -n "$skills_dir" ]]; then
    [[ "$skills_dir" == /* ]] || skills_dir="$project_dir/$skills_dir"
    candidates+=("$skills_dir/session-bridge/session-bridge")
  else
    # Discovery hints only. The native installer owns harness identity and directory rules.
    registries=("$project_dir/.agents/skills" "$project_dir/.codex/skills" "$project_dir/.claude/skills" "$project_dir/skills"
      "$HOME/.agents/skills" "$HOME/.codex/skills" "$HOME/.claude/skills" "$HOME/.cursor/skills")
    registries+=("$HOME"/.*/skills "$HOME"/.config/*/skills "$project_dir"/.*/skills)
    if [[ -n "${XDG_CONFIG_HOME:-}" ]]; then registries+=("$XDG_CONFIG_HOME"/*/skills); fi
    if [[ -n "${CODEX_HOME:-}" ]]; then registries+=("$CODEX_HOME/skills"); fi
    if [[ -n "${CLAUDE_CONFIG_DIR:-}" ]]; then registries+=("$CLAUDE_CONFIG_DIR/skills"); fi
    for registry in "${registries[@]}"; do candidates+=("$registry/session-bridge/session-bridge"); done
  fi
  for candidate in "${candidates[@]}"; do
    if usable "$candidate"; then exec "$candidate" install "${forward[@]}"; fi
  done
fi
[[ "$offline" == 0 ]] || { printf '%s\n' 'No compatible local installation found; offline mode did not download anything.' >&2; exit 2; }
temp_dir="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/session-bridge-bootstrap.XXXXXX")"
trap '/bin/rm -rf "$temp_dir"' EXIT
if [[ "$release" == latest ]]; then
  manifest_url="https://github.com/$repo/releases/latest/download/release-manifest.json"
else
  manifest_url="https://github.com/$repo/releases/download/$release/release-manifest.json"
fi
/usr/bin/curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --connect-timeout 15 --max-time 90 --retry 2 \
  --max-filesize 131072 "$manifest_url" --output "$temp_dir/manifest.json"
manifest="$(<"$temp_dir/manifest.json")"
[[ "$(read_json "$manifest" schema_version)" == 1 && "$(read_json "$manifest" repository)" == "$repo" ]] || { printf '%s\n' 'Invalid release manifest identity.' >&2; exit 2; }
tag="$(read_json "$manifest" tag)"
[[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { printf '%s\n' 'Invalid release version.' >&2; exit 2; }
[[ "$release" == latest || "$release" == "$tag" ]] || { printf '%s\n' 'Release version does not match request.' >&2; exit 2; }
filename="$(read_json "$manifest" platforms.macos-universal.filename)"
download_url="$(read_json "$manifest" platforms.macos-universal.url)"
expected_hash="$(read_json "$manifest" platforms.macos-universal.sha256)"
expected_bytes="$(read_json "$manifest" platforms.macos-universal.bytes)"
[[ "$filename" == session-bridge-macos-universal && "$download_url" == "https://github.com/$repo/releases/download/$tag/$filename" &&
   "$expected_hash" =~ ^[a-f0-9]{64}$ && "$expected_bytes" =~ ^[0-9]+$ ]] || { printf '%s\n' 'Invalid macOS artifact metadata.' >&2; exit 2; }
[[ "$expected_bytes" -gt 0 && "$expected_bytes" -le 160000000 ]] || exit 2
binary="$temp_dir/$filename"
/usr/bin/curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --connect-timeout 15 --max-time 600 --retry 2 \
  --max-filesize "$expected_bytes" "$download_url" --output "$binary"
actual_bytes="$(/usr/bin/wc -c < "$binary")"
actual_hash="$(/usr/bin/shasum -a 256 "$binary")"; actual_hash="${actual_hash%% *}"
[[ "$actual_bytes" -eq "$expected_bytes" && "$actual_hash" == "$expected_hash" ]] || { printf '%s\n' 'Downloaded executable failed integrity verification.' >&2; exit 2; }
/bin/chmod 700 "$binary"
"$binary" install "${forward[@]}"
