# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `surfbird_wait` gains `networkidle` (no in-flight requests for ~500ms,
  tracked via the network buffer) and `stable` (no DOM mutations for
  ~500ms via MutationObserver) states — for SPA/async pages that keep
  changing after the `load` event.
- `surfbird_screenshot` and `surfbird_pdf` accept `waitFor`
  (`none`/`load`/`domcontentloaded`/`networkidle`/`stable`, default
  `load`) + `timeoutMs`, so captures wait for the page to settle instead
  of racing a still-loading document.
- Refs now carry their element tag, and `doc_changed` first attempts a
  selector re-resolve (with tag verification) before failing — same-page
  navigations that bump the document generation no longer kill refs that
  still point at the same element.

### Fixed

- `surfbird_fill` via `Kitesurf.setControlValue` now dispatches
  `input`/`change` events (re-setting the value through the native
  prototype setter first, so framework value trackers see the change) —
  React/Vue controlled inputs previously ignored fills entirely.
- `Kitesurf.setControlValue` now passes `targetId` explicitly; the
  engine-level method defaulted to the first page target, which could
  fail with `no PageScript` or write into the wrong tab.
- `fill`'s DOM fallback passed `{value}` where a raw string was expected,
  so `input.value` became `[object Object]` instead of the typed text.

## [0.2.0] - 2026-11-15

### Added

- `surfbird_find` — in-page text search with Ctrl+F semantics: counts
  matches across visible text (skips script/style/hidden subtrees),
  scrolls each match into view via Range geometry, returns a ±80-char
  context snippet, and supports `first`/`next`/`prev`/`count`/`clear`
  actions plus `caseSensitive`/`wholeWord` flags. No visual highlight —
  pair with `surfbird_screenshot` or `surfbird_extract`. Match state is
  kept per document in the page and resets on navigation.
- New `bad_args` tool error code for invalid tool arguments.

## [0.1.1] - 2026-11-15

### Fixed

- `npm install` failed outside DSH with `ETARGET`: npm auto-installs peer
  dependencies and the prerelease-only `@deepseek-ai/*` ranges could not
  resolve. All host-provided peers are now marked optional via
  `peerDependenciesMeta` (same convention as `dsh-plugin-health`) and use the
  ecosystem-standard `>=0.2.0-rc.0 <0.3.0-0` ranges.

## [0.1.0] - 2026-11-15

### Added

- 25 `surfbird_*` tools for DSH agents: session/tab management, navigation,
  semantic accessibility snapshots with stable `[eN]` refs, click/fill/type/
  scroll/key interaction, predicate waits, `Runtime.evaluate`, article
  extraction, screenshots (inline image attachments), PDF export, and
  console/network inspection buffers, plus a raw `surfbird_cdp` escape hatch.
- One isolated browser (CDP WebSocket) per DSH agent session with LRU
  eviction under `maxSessions`; no cross-session leakage of tabs, refs, or
  console/network buffers.
- Client-half settings UI: endpoint/token/token-file configuration with hot
  reload, compact auth toggle, file picker that encrypts on the host, live
  connection status with failure reasons, one-time setup toast, and inline
  "open settings" actions on connection failures.
- Machine-bound encrypted `tokenFile` (`surfbird-v1:` AES-256-GCM, key derived
  from host machine UUID) with `surfbird-token` CLI (`encrypt`/`decrypt`/`id`)
  and plaintext-file compatibility.
- Screenshot rendering in tool rows with click-to-zoom lightbox.
- Bundled `skills/surfbird-control/SKILL.md` so models learn the tool workflow.
- Portable DSH-free `src/cdp/` core (only `ws` + Node builtins) intended for
  future OpenCode/Pi ports.

### Notes

- Requires DSH `0.2.x` and a Kitesurf-compatible CDP endpoint (surfbird
  raw/auth container or upstream Kitesurf).
- Kitesurf engine limits apply: no JS dialogs, file upload/download,
  clipboard, drag/touch; screenshots clamp to 2560px sides / 2560×1440 px.

[0.2.0]: https://github.com/terry2010/dsh-control-surfbird-for-kitesurf/releases/tag/v0.2.0
[0.1.1]: https://github.com/terry2010/dsh-control-surfbird-for-kitesurf/releases/tag/v0.1.1
[0.1.0]: https://github.com/terry2010/dsh-control-surfbird-for-kitesurf/releases/tag/v0.1.0
