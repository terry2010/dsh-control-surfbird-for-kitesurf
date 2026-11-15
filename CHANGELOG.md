# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.1]: https://github.com/terry2010/dsh-control-surfbird-for-kitesurf/releases/tag/v0.1.1
[0.1.0]: https://github.com/terry2010/dsh-control-surfbird-for-kitesurf/releases/tag/v0.1.0
