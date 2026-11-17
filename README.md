# dsh-control-surfbird-for-kitesurf

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](https://github.com/terry2010/dsh-control-surfbird-for-kitesurf/blob/master/LICENSE)
[![npm](https://img.shields.io/npm/v/dsh-control-surfbird-for-kitesurf)](https://www.npmjs.com/package/dsh-control-surfbird-for-kitesurf)
[![npm downloads](https://img.shields.io/npm/dm/dsh-control-surfbird-for-kitesurf)](https://www.npmjs.com/package/dsh-control-surfbird-for-kitesurf)
[![DSH](https://img.shields.io/badge/DSH-0.2.x-green.svg)](https://github.com/terry2010/dsh-control-surfbird-for-kitesurf)

**English** | [中文](https://github.com/terry2010/dsh-control-surfbird-for-kitesurf/blob/master/i18n/README.zh-CN.md)

A [DSH](https://www.deepseek.com/) (DeepSeek Harness) plugin that gives an AI agent full control of a [Kitesurf](https://github.com/cloudflare/kitesurf) browser engine over the Chrome DevTools Protocol (CDP) — like a human operating a browser. Works with the self-hosted [surfbird](https://github.com/terry2010/surfbird) distribution (raw or token-auth mode) and upstream Kitesurf deployments. Exposes **28 `surfbird_*` tools**: tab management, navigation, semantic accessibility snapshots, click/type/fill, waits, JavaScript evaluation, screenshots, PDF export, and console/network inspection — with one isolated browser per agent session.

## Contents

[Features](#features) · [Requirements](#requirements) · [Install](#install) · [Configuration](#configuration) · [Usage](#usage) · [Test prompts](#test-prompts) · [Engine limits](#engine-limits) · [Development](#development) · [FAQ](#faq) · [License](#license) · [Related projects](#related-projects)

## Features

- **Per-session browser isolation** — each DSH agent session owns a dedicated CDP WebSocket, which the engine maps to an independent browser. Tabs, element refs, console buffers and network buffers never leak across sessions; sessions are evicted LRU-style under `maxSessions`.
- **Semantic snapshots, not CSS guessing** — `surfbird_snapshot` returns a bounded, budget-trimmed digest of the accessibility tree with stable `[eN]` element refs. Click, fill, type and scroll accept refs directly; refs auto-invalidate on navigation.
- **Human-like interaction primitives** — navigate/back/forward/reload, click/double-click, fill (via `Kitesurf.setControlValue` with DOM fallback), type, press_key with modifiers, scroll, and predicate waits (`load`, `url`, `text`, `visible`, `hidden`, `enabled`, `networkidle`, `stable`).
- **Page-declared tools (WebMCP)** — `surfbird_webmcp` lists and invokes tools a page registers about itself via `document.modelContext`, so capable pages can expose actions ("search", "add-to-cart") without DOM guessing.
- **JavaScript evaluation** — `surfbird_evaluate` runs `Runtime.evaluate` in the page context; `surfbird_extract` returns article text via Readability + Turndown (no in-page DOM shim issues); `surfbird_links` extracts all page links as `{url,text}` pairs.
- **Screenshots & PDF** — viewport, element-targeted (`target`+`padding`), clipped-region and full-page captures (clamped to engine limits of 2560px sides / 2560×1440 px), `Page.printToPDF` with paper size, margins, orientation and CSS `@page` support. Screenshots return inline image attachments viewable in the chat.
- **Console & network inspection** — per-tab console and network buffers with sequence cursors (`sinceIndex`), error filtering, and session-aware request correlation.
- **Raw CDP escape hatch** — `surfbird_cdp` sends arbitrary CDP methods for anything the typed tools don't cover.
- **Settings UI + proactive setup** — a client-half config card (endpoint, credentials, timeouts, session limits) with hot reload, a setup toast when unconfigured or unreachable (at most 3 times, re-armed on disable/enable/reinstall), inline "open settings" buttons on connection failures, and live connection status with failure reasons.
- **Machine-bound encrypted token file** — `tokenFile` accepts plaintext or `surfbird-v1:` AES-256-GCM ciphertext whose key derives from the host machine UUID (macOS `IOPlatformUUID`, Windows `MachineGuid`, Linux `machine-id`). The ciphertext is useless on any other computer and can be safely committed or synced. Includes a `surfbird-token` CLI (`encrypt`/`decrypt`/`id`) and a browser file-picker import that encrypts on the host.
- **Portable shared core** — `src/cdp/` has zero DSH dependencies (only `ws` + Node builtins) and is designed to be copied wholesale into OpenCode or Pi hosts.

## Requirements

- DSH `0.2.x` (developed against `0.2.2-rc.3`; degrades gracefully on older slot APIs)
- Node.js `>= 22.18` (type-stripping runtime, no build step required at install)
- A Kitesurf-compatible CDP endpoint:
  - **surfbird container** — `surfbird` Docker image, `auth` mode recommended (`SURFBIRD_TOKEN` set)
  - **upstream Kitesurf** — `wrangler dev` or a deployed engine
  - **raw surfbird** — no token required

## Install

```bash
dsh plugin --profile <name> add dsh-control-surfbird-for-kitesurf
```

For local development, add `"file:/path/to/dsh-control-surfbird-for-kitesurf"` to the profile's `package.json`, merge `cordis.patch.yml` into the profile's patch file, then reinstall.

After install, open the plugin settings page (or wait for the setup toast) and configure the endpoint and credentials — values hot-reload, no restart needed.

## Configuration

| Field | Description |
|---|---|
| `endpoint` | CDP endpoint, e.g. `http://127.0.0.1:8787` or `http://123.123.123.123:8787`. `http(s)://` URLs are normalized to the browser WebSocket automatically. An SSH tunnel (`ssh -L 8787:127.0.0.1:8080 host`) keeps the engine off the public internet. |
| `token` | Bearer token for surfbird auth mode. Prefer `tokenFile` to keep secrets out of the config file. |
| `tokenFile` | Path to a token file — plaintext or `surfbird-v1:` machine-bound ciphertext (takes precedence over `token`). |

Optional advanced fields: `requestTimeoutMs`, `keepaliveMs`, `maxSessions`, `idleEvictMs`, `screenshotDir`, `debugLog`.

Port note: the raw engine and upstream Kitesurf `wrangler dev` listen on `:8787` by default; the surfbird `auth` proxy listens on `:8080` by default (`SURFBIRD_PORT` overrides it).

Environment fallback for headless/CI: `SURFBIRD_URL`/`SURFBIRD_ENDPOINT`/`KITESURF_URL`/`KITESURF_ENDPOINT` for the endpoint, `SURFBIRD_TOKEN`/`KITESURF_TOKEN` for the token.

### Encrypted token file

`tokenFile` auto-detects two formats:

- **Plaintext** — raw Bearer token (use `chmod 600`).
- **`surfbird-v1:` ciphertext** — AES-256-GCM; key = `scrypt(machine UUID)`. Generate with the bundled CLI:

```bash
echo -n 'your-token' | npx surfbird-token encrypt -o ~/.surfbird-token
surfbird-token decrypt ~/.surfbird-token   # verify
surfbird-token id                          # show detected machine id
```

The ciphertext contains no machine id — it can be committed, synced or backed up; it simply won't decrypt elsewhere. Caveats: OS reinstall may change the UUID on Windows/Linux (re-run `encrypt`); machine-binding is not user-binding — same-user processes can still derive the key, so for stronger isolation use OS credential stores.

## Usage

The model sees all 28 tools once the plugin loads; `skills/surfbird-control/SKILL.md` is registered as a usage manual so agents know the workflow without prompting.

| Group | Tools |
|---|---|
| Session & browser | `surfbird_status` `surfbird_tabs` `surfbird_new_tab` `surfbird_select_tab` `surfbird_close_tab` `surfbird_cdp` |
| Navigation | `surfbird_navigate` `surfbird_back` `surfbird_forward` `surfbird_reload` |
| Content | `surfbird_snapshot` `surfbird_ax` `surfbird_extract` `surfbird_find` `surfbird_links` `surfbird_webmcp` |
| Interaction | `surfbird_click` `surfbird_double_click` `surfbird_fill` `surfbird_type` `surfbird_press_key` `surfbird_scroll` |
| Wait & eval | `surfbird_wait` `surfbird_evaluate` |
| Output | `surfbird_screenshot` `surfbird_pdf` |
| Diagnostics | `surfbird_console` `surfbird_network` |

Typical flow:

```
surfbird_status                    → verify connection + engine product
surfbird_new_tab url=https://…     → open tab (waits for load)
surfbird_snapshot                  → semantic digest with [eN] refs
surfbird_fill ref=e3 value=…       → interact by ref
surfbird_screenshot                → visual verification (inline image)
```

## Test prompts

Paste these into a DSH session to exercise every tool. All examples use [zhuikan.com](https://zhuikan.com) (a GitHub trending rank site with a search box and detail pages). Start with the first block.

**Session & browser**

| Prompt | Exercises |
|---|---|
| `Check the surfbird connection status` | `surfbird_status` (incl. `capabilities`) |
| `List all open tabs and tell me which is current` | `surfbird_tabs` |
| `Open https://zhuikan.com in a new tab` | `surfbird_new_tab` |
| `Open https://zhuikan.com but don't wait for it to load` | `surfbird_new_tab wait=none` |
| `Switch to the other tab, then close this one` | `surfbird_select_tab` + `surfbird_close_tab` |
| `Use raw CDP to get the current page's layout metrics` | `surfbird_cdp` |

**Navigation**

| Prompt | Exercises |
|---|---|
| `Navigate this tab to https://zhuikan.com` | `surfbird_navigate` |
| `Open https://zhuikan.com/repos/aws__aws-emulator, then go back and forward` | `surfbird_navigate` + `surfbird_back` + `surfbird_forward` |
| `Hard-reload zhuikan.com bypassing cache` | `surfbird_reload hard=true` |

**Content**

| Prompt | Exercises |
|---|---|
| `Give me a semantic snapshot of zhuikan.com` | `surfbird_snapshot` |
| `Show me zhuikan.com's accessibility tree instead` | `surfbird_ax` |
| `Open a repo detail page on zhuikan.com and extract the article as markdown` | `surfbird_extract` |
| `How many times does "GitHub" appear on zhuikan.com? Jump to the second match.` | `surfbird_find` |
| `List all the links on zhuikan.com` | `surfbird_links` |
| `Check whether zhuikan.com registered any WebMCP tools` | `surfbird_webmcp action=list` |

**Interaction** (zhuikan.com has a search box, board tabs and repo links)

| Prompt | Exercises |
|---|---|
| `On zhuikan.com, click the first repo link in the rankings and wait for the result` | `surfbird_click` + `surfbird_wait` |
| `Double-click the main heading on zhuikan.com` | `surfbird_double_click` |
| `On zhuikan.com, fill the search box with "GitHub Trending Rank Radar"` | `surfbird_fill` |
| `Type "rust" into zhuikan.com's search box` | `surfbird_type` |
| `On zhuikan.com, press Enter to submit the search` | `surfbird_press_key` |
| `Scroll down 1000 pixels on zhuikan.com to see more rankings` | `surfbird_scroll` |

**Wait & eval**

| Prompt | Exercises |
|---|---|
| `On zhuikan.com, wait until the page text contains "GitHub"` | `surfbird_wait state=text` |
| `Wait for zhuikan.com's network to go idle, then tell me the page title` | `surfbird_wait state=networkidle` + `surfbird_evaluate` |
| `Evaluate document.title and window.location.href on zhuikan.com` | `surfbird_evaluate` |

**Output**

| Prompt | Exercises |
|---|---|
| `Take a screenshot of zhuikan.com's viewport` | `surfbird_screenshot` |
| `Screenshot only the rankings area element` (grab its ref from snapshot first) | `surfbird_screenshot target={ref}` |
| `Take a full-page screenshot of zhuikan.com` | `surfbird_screenshot fullPage=true` |
| `Export zhuikan.com as a PDF` | `surfbird_pdf` |

**Diagnostics**

| Prompt | Exercises |
|---|---|
| `Show me console errors from zhuikan.com` | `surfbird_console only=errors` |
| `List the network requests zhuikan.com made` | `surfbird_network` |
| `Get the response body of zhuikan.com's first request` | `surfbird_network action=body` |

**Multi-step walkthrough** — one prompt that chains many tools:

```
打开 https://zhuikan.com，在搜索框输入 "GitHub Trending Rank Radar" 并回车提交，
等结果页加载完成后告诉我最终停在哪个页面 URL，
然后用 surfbird_find 确认 "GitHub Trending Rank Radar" 在页面上出现了几次，
最后只截图结果页里的仓库标题区域元素。
```

Expected chain: `navigate` → `snapshot`(find searchbox ref) → `fill` → `press_key enter` → `wait`(url/text/networkidle) → `evaluate`/`snapshot` → `find` → `screenshot target=…`. This is the real-world flow that exercises ref handling, controlled-input events, page-settle waits and element screenshots in one go.

**WebMCP invoke** (needs a page that registers tools — inject one first)

```
Open https://zhuikan.com, then use surfbird_evaluate to run:
document.modelContext.registerTool({name:'getTitle',description:'返回页面标题',
execute:async()=>document.title})
Then call surfbird_webmcp action=list, then action=invoke tool=getTitle.
```

## Engine limits

Kitesurf is a Boa + DOM-shim engine, not Chromium/V8. Known boundaries:

- One CDP WebSocket = one browser; ~60 min hard connection lifetime, ~10 min idle timeout (keepalive stays well under)
- No JS dialogs, file upload/download, clipboard, drag/touch; `KeyboardEvent` support is partial; hit-testing is partial
- Screenshots clamp to 2560px per side / 2560×1440 px total; `fullPage` is approximated via temporary viewport resize
- Failed screenshot/PDF return a placeholder `data` field plus `error` instead of raising a CDP error — the tools check for it

## Development

```bash
npm install
npm run build      # tsc → lib/
npm test           # unit tests (no engine needed)
npm run check      # plugin shape check
npm run test:live  # live smoke — needs SURFBIRD_URL/TOKEN or:
                   #   ssh -L 8787:127.0.0.1:8080 <surfbird-host>
npm pack --dry-run
```

`src/cdp/` must stay free of `@deepseek-ai/*` imports — it is the portable core intended for future OpenCode/Pi ports.

## FAQ

**Does this work with upstream Kitesurf or only surfbird?**
Both. The plugin speaks plain CDP; surfbird auth mode just adds a Bearer token. Raw surfbird and upstream `wrangler dev` engines work with no token.

**Why per-session browsers instead of shared tabs?**
The engine maps each WebSocket to an isolated `BrowserState` — tabs die with the connection. Per-session connections give true isolation: concurrent agents can't see or close each other's tabs, and `maxSessions` bounds resource use.

**Is the token stored safely?**
Three options, in precedence order: `tokenFile` (plaintext `chmod 600`, or `surfbird-v1:` machine-bound ciphertext that can't be decrypted on another machine), `token` field, or `SURFBIRD_TOKEN` env. The settings UI can import a token file and encrypt it on the host in one click.

**What can't it do?**
Anything the engine can't: JS dialogs, file upload/download, clipboard, drag/touch, real keyboard events, and anything requiring persistent state across connections. See *Engine limits* above — the SKILL.md repeats these boundaries for the model.

## License

[Apache-2.0](https://github.com/terry2010/dsh-control-surfbird-for-kitesurf/blob/master/LICENSE)

## Related projects

- [opencode-control-surfbird-for-kitesurf](https://github.com/terry2010/opencode-control-surfbird-for-kitesurf) — sibling plugin: the same 28 `surfbird_*` tools for [OpenCode](https://opencode.ai/) (desktop + TUI, with a settings page/dialog); shares this repo's host-independent `src/cdp/` core
- [pi-control-surfbird-for-kitesurf](https://github.com/terry2010/pi-control-surfbird-for-kitesurf) — sibling plugin: the same 28 `surfbird_*` tools for the [Pi](https://pi.dev/) coding agent; shares this repo's host-independent `src/cdp/` core
- [surfbird](https://github.com/terry2010/surfbird) — self-hosted Docker distribution of Kitesurf with token auth, REST proxy and MCP server
- [Kitesurf](https://github.com/cloudflare/kitesurf) — Cloudflare's experimental browser engine built for AI agents; runs on Workers and speaks CDP
- [DeepSeek Harness (DSH)](https://www.deepseek.com/) — the agent harness this plugin extends
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) — the protocol this plugin speaks
