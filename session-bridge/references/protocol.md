# Bundle v1.1, transfer v1

The v0.3 standalone implementation creates ZIP32 bundles with STORE/DEFLATE support and reads previous v1.0 session bundles. Bun and encryption are embedded. It uses built-in zlib/CRC32, bounded expansion, strict path/member validation and no system extraction command. Limits: 100 MB ZIP/ciphertext, 128 MiB file, 256 MiB total expansion, 10,000 files, 8 MiB metadata. The file limit permits a bundled native Skill executable; compressed archives must still fit the separate transfer limit. Unsupported ZIP encryption, ZIP64, links, special files, case/Unicode aliases, duplicate paths, absolute/traversal names and overlapping ZIP members are refused.

All extraction comes from one stable input byte snapshot, so replacing the external ZIP after validation cannot introduce new write paths. Original evidence is read-only on POSIX; working projects and usable Skill copies are separate. Inventory accounts for every member except manifest/inventory themselves, with lengths, SHA-256 and executable bits. No setup code runs during validation/extraction.

v1.1 adds:

```text
skills/index.json
skills/packages/<name--content-id>/SKILL.md
skills/packages/<name--content-id>/scripts/...
skills/packages/<name--content-id>/references/...
skills/packages/<name--content-id>/assets/...
reports/skills.json
```

Each Skill records name, description, source paths, usage evidence, tree hash, omissions, runtime hints and declared tool requirements. Full folders are captured within the declared exclusion policy. Declared dependencies via cross-Skill links and explicit invocations are followed transitively; identical versions deduplicate, ambiguous name-only matches stay unresolved. Catalog presence alone does not mean use. Incomplete history cannot prove an exhaustive dependency set.

Receive creates `skills/<name>/` (or version IDs for name collisions), SKILL_INDEX.md and recovery/skills.json. Markdown references to other packaged Skills may be relocated in usable copies; both original tree hash and working tree hash, plus the changes, are logged. Executable source and original evidence are never globally rewritten. Scripts that rely on files outside their own Skill folder or runtime-specific absolute paths may still need adaptation; helper runtimes and remote permissions are not recreated.

`--skills-dir` registers nonconflicting working copies in the caller-selected host registry. Existing matching snapshots are reused. Conflicts keep preexisting files and leave the imported set portable; no global hooks, plugins or MCP settings are applied. The receiving agent can always read the portable Skill index and use the provided helper paths directly.

The rest of the bundle preserves context/HANDOFF.md, state.json, references, original history bytes, normalized source_document events, workspace trees and omission/redaction reports. Generic history capture never fabricates original roles/tool calls. Coverage remains partial/unknown where full host records cannot be enumerated.

The secret transfer JSON is delimited by `<session-bridge-transfer>` tags. It contains version=1, provider, stable download URL, bundle ID, ciphertext length/hash, encryption=age-v1-x25519, private identity, expiry reports/estimates and delete_after_restore=false. Keys come from the cryptographic RNG through age-encryption, not a model. The embedded [age-encryption](https://github.com/FiloSottile/typage) library implements the existing age format; v0.1/v0.2 prompts/archives remain compatible. No age/age-keygen process is launched. HTTP requests never contain the private identity. The whole prompt is a bearer secret, and enters the source/target chat histories by user choice.

Hashes validate bytes relative to a trusted copied prompt, not the sender's identity if the whole prompt is replaced. age authenticates decrypted bytes. Neither an expiry string nor deleting a remote entry retracts downloaded copies. Private keys/tokens in earlier prompts need explicit redaction before re-exporting histories; heuristic content detection is not a guarantee of secret-free content.
