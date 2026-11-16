# Public relay providers

## Automatic selection from the current network

`--provider auto --ttl provider-default` races Filebin and Temp.sh using the same first real encrypted part, capped at 256 KiB. Each candidate must complete both upload and independent hash-checked readback. The first verified roundtrip wins, and its upload is reused. Reachability alone is insufficient. Other accepted probe receipts remain in the private checkpoint; unsupported deletion means some probes may persist until expiry. No age identity, source filename or plaintext is uploaded.

The checkpoint retains the selected route and a hash of local interface/proxy configuration, without logging addresses or proxy credentials. A network change or failed auto transfer triggers a new measurement when resumed. Verified parts stay reused across route changes; only incomplete parts move to the newly selected site. Explicit `--provider` pins a site.

After the first sample, parts default to at most 8 MiB with 3 workers. Slow measured links shrink parts down to 256 KiB and may increase workers to 6; explicit settings override tuning. Parts and the small manifest are independently encrypted and verified. Transient network errors and HTTP 408/425/429/5xx retry up to four times with backoff/Retry-After. Permanent denials, bad hashes and TLS failures are not bypassed. Active downloads reset a 45-second idle timer; a separate size-aware total deadline replaces the old fixed 60 seconds.

Only randomized names and age ciphertext reach the advertised auto candidates. Providers see lengths, IPs and timing. All requests use native embedded HTTP, HTTPS host allowlists and bounded bodies. Speed depends on the current network and service load; a successful probe does not promise future availability.

## Filebin

[API](https://filebin.net/api), [specification](https://filebin.net/api.yaml), [terms](https://filebin.net/terms). Raw binary POST to a random bin/file returns length, SHA-256 and `bin.expired_at`; independent binary readback remains required. `--provider filebin --ttl provider-default` uses that reported expiry, currently approximately seven days. It cannot promise 24h.

The documented flow sets a verification cookie and then redirects on one replay to a short-lived storage URL. Only `filebin.net` and `storage.filebin.net` are allowed; the cookie is sent only to filebin.net. The stable original locator goes into the prompt, not the short-lived redirect. No JavaScript/challenge bypass is performed.

The original locator also grants delete capability. Multipart `revoke --receipt` checks the matching local checkpoint and deletes all known owned Filebin objects, including manifests and accepted probes, then confirms 404. It reports unsupported objects separately. It cannot prove physical erasure or remove downloaded copies. Prior synthetic transfers passed; live routing still verifies bytes before selecting it.

## Temp.sh

[Official instructions](https://temp.sh/) document anonymous multipart upload to `https://temp.sh/upload`, a 4 GB service limit and a three-day expiry policy. The current share page has a POST download form; the adapter follows that form method on the same returned HTTPS URL. GET returns HTML and must not count as ciphertext. A synthetic encrypted upload and exact-byte readback have passed. Expiry is estimated from policy, not a confirmed server timestamp. No deletion API is implemented.

## Uguu (explicit alternative)

[API](https://uguu.se/api), [limits](https://uguu.se/), [FAQ](https://uguu.se/faq): anonymous `files[]` uploads, a 128 MiB limit and a three-hour expiry policy. Allowed download hosts are uguu.se, a.uguu.se and files.uguu.se. Recent live probes returned 502, so it is not an automatic candidate. Expiry is estimated; deletion is unsupported.

## Litterbox and tmpfiles (explicit alternatives, not guaranteed)

[Litterbox official tools](https://litterbox.catbox.moe/tools.php) document anonymous multipart fileupload with 1h/12h/24h/72h. Allowed hosts: litterbox.catbox.moe and litter.catbox.moe. The URL reply provides no confirmed expiry timestamp; this adapter estimates it. Prior local uploads returned HTTP 412 Invalid uploader; do not bypass the rejection. No deletion is implemented.

[tmpfiles API](https://tmpfiles.org/api) exposes file upload with expiry seconds; this adapter offers 1h/6h/24h/48h. It resolves the returned share-page locator to the same-host direct download and verifies actual ciphertext. [Terms](https://tmpfiles.org/tos) prohibit commercial automation without permission. Prior local connections failed; current availability is not established. No deletion API is implemented and expiry is estimated.

TempFile.org is not implemented because its [terms](https://tempfile.org/terms) require permission for automated use. Do not confuse a documented candidate with verified support.

Gofile and Pixeldrain are not anonymous defaults: [Gofile](https://gofile.io/api) restricts listing/direct-link features to Premium; [Pixeldrain](https://pixeldrain.com/api) requires an upload API key. Do not silently add destinations beyond the documented auto policy.
