# dsh-control-surfbird-for-kitesurf

DSH plugin that lets an agent drive a [Kitesurf](https://github.com/cloudflare/kitesurf) browser engine — standalone or via the self-hosted [surfbird](https://github.com/terry2010/surfbird) distribution (raw or token-auth) — over CDP. Exposes 25 `surfbird_*` tools with per-agent-session browser isolation.

## Features

- **Per-session browsers**: each DSH agent session gets its own CDP WebSocket (= one independent engine browser). Tabs, refs, console and network buffers never leak across sessions.
- **Semantic snapshots**: `surfbird_snapshot` returns a bounded digest with `[eN]` element refs — click/fill/type by ref, no CSS-selector guessing.
- **Full interaction set**: navigate/back/forward/reload, click/dblclick/fill/type/press_key/scroll, waits (load/url/text/visible/…), `Runtime.evaluate`, Readability+Turndown article extraction, console/network inspection with cursors, raw `surfbird_cdp` passthrough.
- **Screenshots & PDF**: viewport/clip/fullPage capture (engine-clamped), `Page.printToPDF` to file.
- **Settings UI + setup prompts**: client half renders a config card on the plugin settings page, toasts once per session when unconfigured/unreachable, and failed tool calls show an inline "open settings" button.
- **Shared core**: `src/cdp/` has zero DSH dependencies — designed to be copied wholesale into opencode/pi hosts later.

## Requirements

- DSH `0.2.1+` (uses `pluginNavigation`, `configForms`, `tool.call.toolview` slots; degrades gracefully when absent)
- A Kitesurf-compatible CDP endpoint:
  - surfbird container (auth mode recommended): `http(s)://<host>:<port>`
  - upstream kitesurf `wrangler dev`/deployed engine
  - raw surfbird (no token) also works

## Install

```bash
dsh plugin --profile <name> add dsh-control-surfbird-for-kitesurf
# or for local development:
#   add "file:/path/to/dsh-control-surfbird-for-kitesurf" to the profile's package.json
#   and merge cordis.patch.yml into the profile's cordis.patch.yml, then reinstall
```

After install, open the plugin's settings page (or wait for the setup toast) and set:

| Field | Description |
|---|---|
| `endpoint` | CDP endpoint, e.g. `http://127.0.0.1:8080` or `http://123.123.123.123:8787`. `http(s)://` is normalized to the browser WS automatically. |
| `token` | Bearer token (surfbird auth mode). Prefer `tokenFile` to keep secrets out of config. |
| `tokenFile` | Path to a file containing the token — plaintext or `surfbird-v1:` machine-bound ciphertext (takes precedence over `token`). |

Optional: `requestTimeoutMs`, `keepaliveMs`, `maxSessions`, `idleEvictMs`, `screenshotDir`, `debugLog`.

Values are hot-reloaded — no restart needed after editing.

### Encrypted token file (machine-bound)

`tokenFile` accepts two formats, auto-detected by content:

- **Plaintext** — the file contains the raw Bearer token (chmod 600 recommended).
- **`surfbird-v1:` ciphertext** — AES-256-GCM encrypted; the key is derived from this machine's UUID (`IOPlatformUUID` / `MachineGuid` / `machine-id`), so the file is useless on any other computer. Generate it with the bundled CLI:

```bash
echo -n 'your-token' | npx surfbird-token encrypt -o ~/.surfbird-token   # or: surfbird-token encrypt > file
surfbird-token decrypt ~/.surfbird-token    # verify / recover the token
surfbird-token id                           # show detected machine id (debug)
```

The ciphertext contains no machine id — it can be committed, synced, or backed up safely; it simply won't decrypt elsewhere. Caveats:

- **OS reinstall may change the UUID** (Windows `MachineGuid`, Linux `machine-id`; macOS `IOPlatformUUID` survives reinstall) — after that, re-run `encrypt`.
- Machine-binding ≠ user-binding: other local user accounts and same-user processes can still derive the key. For stronger isolation keep the plaintext file with tight permissions (`chmod 600`) or fetch the token from an OS credential store / password manager.
- Decrypt failure surfaces as `tokenFileError` in `surfbird_status` and the settings banner, and falls back to `token`/env sources.

### Environment fallback (headless / CI)

```
SURFBIRD_URL → SURFBIRD_ENDPOINT → KITESURF_URL → KITESURF_ENDPOINT   (endpoint)
SURFBIRD_TOKEN → KITESURF_TOKEN                                      (token)
```

## Usage

The model sees all 25 `surfbird_*` tools once the plugin is loaded; `skills/surfbird-control/SKILL.md` is registered as a usage manual. Typical flow:

```
surfbird_status          → verify connection
surfbird_new_tab url=…   → open a tab (waits for load by default)
surfbird_snapshot        → semantic digest with [eN] refs
surfbird_click ref=…     → interact
surfbird_screenshot      → visual verification
```

Refs are scoped to `(tabId, document generation)`: any navigation invalidates them — re-snapshot after navigating.

## Engine limits (Kitesurf is Boa + DOM shim, not Chromium)

- Per-WS connection = one browser; ~60 min hard lifetime, ~10 min idle timeout (keepalive stays well under)
- No JS dialogs, file upload/download, clipboard, drag/touch; KeyboardEvent support is partial
- Screenshot viewport clamps to 2560px sides / 2560×1440 px total; fullPage is approximated by temporary viewport resize
- Engine quirk: failed screenshot/PDF return placeholder `data` + `error` field instead of a CDP error — the tools check it

See `docs/design.md` (repo, gitignored) for the full audit.

## Development

```bash
npm install
npm run build     # tsc → lib/
npm test          # unit tests (no engine needed)
npm run check     # plugin shape check
npm run test:live # live smoke — needs SURFBIRD_URL/TOKEN or an SSH tunnel:
                  #   ssh -L 18080:127.0.0.1:8080 user@surfbird-host
npm pack --dry-run
```

`src/cdp/` must stay free of `@deepseek-ai/*` imports — it is the shared core for future opencode/pi ports.
