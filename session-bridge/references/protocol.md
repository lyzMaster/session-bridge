# Bundle v1.1, transfer v1/v2

The v0.6 standalone implementation creates ZIP32 bundles with STORE/DEFLATE support and reads previous v1.0 session bundles. Bun and encryption are embedded. It uses built-in zlib/CRC32, bounded expansion, strict path/member validation and no system extraction command. Limits: 512 MiB ZIP, 512 MiB file, 1 GiB total expansion, 10,000 files and 8 MiB metadata. Unsupported ZIP encryption, ZIP64, links, special files, case/Unicode aliases, duplicate paths, absolute/traversal names and overlapping ZIP members are refused.

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

The secret transfer JSON is delimited by `<session-bridge-transfer>` tags. It contains version=1 or 2, provider, stable download URL, bundle ID, ciphertext length/hash, encryption=age-v1-x25519, private identity, expiry reports/estimates and delete_after_restore=false. Keys come from the cryptographic RNG through age-encryption, not a model. The embedded [age-encryption](https://github.com/FiloSottile/typage) library implements the existing age format; old prompts/archives remain compatible. No age/age-keygen process is launched. HTTP requests never contain the private identity. The whole prompt is a bearer secret, and enters source/target chat histories by user choice.

For v1 the ciphertext is one ZIP. For v2 it is a small encrypted part manifest, keeping the prompt short regardless of part count. The manifest binds the bundle ID, whole archive length/SHA-256, and an ordered list of parts. Each part binds an allowlisted HTTPS provider/URL, ciphertext length/hash and plaintext length/hash. The entire manifest is validated before fetching parts: indexes must be consecutive, URLs unique, lengths bounded, and the sum must equal archive size. Use v2 for bundles exceeding legacy expansion limits even when only one part is needed.

Each part is a complete, independently randomized age file using the same recipient identity, not a plaintext fragment. Source checkpoints save accepted receipts before readback and atomically mark verified parts. No prompt is ready until all required parts and the manifest pass independent readback. Target caches contain verified ciphertext; the identity is not copied to cache or recovery reports. Parts authenticate independently, then the assembled ZIP's complete SHA-256 and existing inventory are validated before destination commit. Interrupted downloads, missing parts and hash errors never publish a partial recovery directory.

Hashes validate bytes relative to a trusted copied prompt, not the sender's identity if the whole prompt is replaced. age authenticates decrypted bytes. Neither an expiry string nor deleting a remote entry retracts downloaded copies. Private keys/tokens in earlier prompts need explicit redaction before re-exporting histories; heuristic content detection is not a guarantee of secret-free content.
