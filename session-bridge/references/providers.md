# Public relay providers

Provider and TTL must be explicit; no automatic fallback, renamed file types or restriction bypass. Only randomized names and age ciphertext are uploaded, but hosts still see lengths, IPs and timing. The standalone implementation uses its embedded runtime's native fetch, validates HTTPS hosts and limits every body; no curl is required.

## Filebin

[API](https://filebin.net/api), [specification](https://filebin.net/api.yaml), [terms](https://filebin.net/terms). Raw binary POST to a random bin/file returns length, SHA-256 and `bin.expired_at`; independent binary readback remains required. `--provider filebin --ttl provider-default` uses that reported expiry, currently approximately seven days. It cannot promise 24h.

The documented flow sets a verification cookie and then redirects on one replay to a short-lived storage URL. Only `filebin.net` and `storage.filebin.net` are allowed; the cookie is sent only to filebin.net. The stable original locator goes into the prompt, not the short-lived redirect. No JavaScript/challenge bypass is performed.

The original locator also grants delete capability. `revoke` sends DELETE then verifies the public entry returns 404. It cannot prove physical erasure or remove downloaded copies. Prior synthetic transfers passed; check current live test results before claiming availability, as storage/rate constraints may reject later requests.

## Litterbox and tmpfiles (explicit alternatives, not guaranteed)

[Litterbox official tools](https://litterbox.catbox.moe/tools.php) document anonymous multipart fileupload with 1h/12h/24h/72h. Allowed hosts: litterbox.catbox.moe and litter.catbox.moe. The URL reply provides no confirmed expiry timestamp; this adapter estimates it. Prior local uploads returned HTTP 412 Invalid uploader; do not bypass the rejection. No deletion is implemented.

[tmpfiles API](https://tmpfiles.org/api) exposes file upload with expiry seconds; this adapter offers 1h/6h/24h/48h. It resolves the returned share-page locator to the same-host direct download and verifies actual ciphertext. [Terms](https://tmpfiles.org/tos) prohibit commercial automation without permission. Prior local connections failed; current availability is not established. No deletion API is implemented and expiry is estimated.

TempFile.org is not implemented because its [terms](https://tempfile.org/terms) require permission for automated use. Do not confuse a documented candidate with verified support.
