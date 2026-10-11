# agentengine CLI install fails: connection dropped mid-download (macOS arm64)

**Reported during:** MongoDB SF Tech Week hackathon, 2026-10-11, Shack15 venue Wi-Fi
**Reporter:** collin@dabl.club

## Summary
`curl -fsSL https://agentengine.mongodb.com/api/v1/cli/install.sh | bash` fails and the CLI is not installed. Two distinct failures:

1. **HTTP/2 error on the default path**
   ```
   curl: (92) HTTP/2 stream 1 was not closed cleanly: INTERNAL_ERROR (err 2)
   error: could not download agentengine latest for darwin/arm64 from https://agentengine.mongodb.com.
   ```
2. **Truncated binary download over HTTP/1.1.** With `--http1.1` the install script itself downloads fine, but the ~42 MB binary transfer is closed by the server/network partway through, every time:
   ```
   curl: (18) transfer closed with 25290412 bytes remaining to read
   ```
   With `--retry 8 --retry-all-errors`, 9 consecutive attempts all failed, each after roughly 15–30 MB of the 42,313,136 bytes. The installer restarts from zero on each retry, so it never completes.

## Environment
- macOS 26.6, Apple Silicon (arm64)
- curl 8.7.1 (SecureTransport, nghttp2 1.68.1)
- Network: shared venue Wi-Fi (Shack15), so we can't rule out a proxy or middlebox. Other attendees may hit the same thing.
- Affected asset: `GET /api/v1/cli/install/releases/v0.1.119/assets/darwin/arm64` (published size 42313136, digest `sha256:30f362ad...571c7`)

## Reproduction
```bash
curl -fsSL https://agentengine.mongodb.com/api/v1/cli/install.sh | bash          # failure 1
curl --http1.1 -o /dev/null https://agentengine.mongodb.com/api/v1/cli/install/releases/v0.1.119/assets/darwin/arm64   # failure 2 (curl 18)
```

## Workaround that worked
Resume the download with HTTP range requests. The server supports `Range`, so repeated resumed attempts eventually complete:
```bash
U=https://agentengine.mongodb.com/api/v1/cli/install/releases/v0.1.119/assets/darwin/arm64
for i in $(seq 1 30); do curl -sS --http1.1 -C - -o ae.bin "$U" && break; done
shasum -a 256 ae.bin     # matched the published digest
install -m 755 ae.bin ~/.local/bin/agentengine
agentengine --version    # 0.1.119
```

## Suggested fixes
- Have `install.sh` download with resume (`curl -C -` in a retry loop, or write to a partial file), so flaky networks don't restart from zero.
- Add `--http1.1` fallback (or retry) when HTTP/2 fails with `INTERNAL_ERROR`.
- Investigate why the asset endpoint closes long transfers early (idle/duration limit on the CDN or origin? missing `Content-Length` handling?).
- Document a manual-download path (direct asset URL plus sha256 check) in the Download CLI page.
- The error message ("Check your network connection") hides the real cause. Surface the curl exit code and bytes received.
