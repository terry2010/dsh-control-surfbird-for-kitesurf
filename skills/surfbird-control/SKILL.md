---
name: surfbird-control
description: Control a Kitesurf browser engine (surfbird deployment) over CDP — tabs, navigation, semantic snapshots with element refs, click/fill/type, wait conditions, screenshots/PDF, console and network inspection, JS evaluation, and article extraction.
whenToUse: Use when the user asks to browse the web, inspect a page, fill forms, click through a site, take screenshots, extract article content, or debug console/network behavior in a real browser engine.
---

# Surfbird browser control

You control a real Kitesurf browser engine through `surfbird_*` tools. Each agent session owns an isolated browser: tabs, cookies and page state never leak between sessions, and closing the session destroys its tabs.

## Setup (first use)

1. Call `surfbird_status`. If it fails with a connection error, the engine is unreachable — tell the user to open **设置 → 插件 → control-surfbird** and set the endpoint/token (or env `SURFBIRD_URL`/`SURFBIRD_TOKEN`). Do not ask the user for credentials in chat.
2. `surfbird_status` reports `product`, tab count and session budget. Cheap — call it when unsure of state.

## Core workflow: observe → act → verify

- **Observe**: `surfbird_snapshot` returns a semantic digest — `[eN] role "name" → href` for interactive elements, `[hN]` headings, `[tN]` text. Use `surfbird_ax` for the accessibility tree when semantics matter. Use `surfbird_extract` for article→Markdown on content pages.
- **Act**: click/fill/type/press_key/scroll/navigate using `eN` refs or CSS selectors.
- **Verify**: after every mutating action, confirm the effect — `surfbird_wait` for conditions, `surfbird_snapshot` for state, `surfbird_console`/`surfbird_network` for diagnostics.

## Refs and document tokens

- `eN` refs come from `surfbird_snapshot` and are **tab-scoped and generation-scoped**. Any navigation, reload, or `setDocumentContent` invalidates them (`doc_changed`). Always re-snapshot before reusing a ref after page changes.
- `truncated`/`omitted` in snapshot output means you hit the budget — narrow with `selector` or raise `maxChars`/`maxNodes`.
- `surfbird_wait` accepts `target: {ref}` or `{selector}` for visible/hidden/enabled checks.

## Waiting

`Page.navigate` returns **before** load finishes. After navigate/back/forward/reload — or any click that may navigate — call `surfbird_wait state=load` (or `domcontentloaded`). Other states: `url` (substring match), `text`/`text_gone` (substring in page text or a selector's text), `visible`/`hidden`/`enabled` (needs target ref or selector). Default timeout 30s; raise `timeoutMs` for slow pages.

## Input caveats (engine limits)

- `surfbird_click`/`double_click`/`fill`/`type`/`press_key` may silently no-op on some pages — the engine swallows input errors. **Always verify** with wait/snapshot afterwards.
- `fill` replaces the whole value (native `setControlValue`, falls back to DOM events). `type` inserts text at the caret — it does not fire complete keyboard events.
- `press_key` supports ~60 named keys (enter, tab, escape, arrows, f1-f12, punctuation); `modifiers` bitmask: Alt=1 Ctrl=2 Meta=4 Shift=8.
- No JS dialogs, file upload/download, clipboard, drag/touch, or real keyboard events — do not promise these.

## Tabs

`surfbird_tabs` lists tabs; `new_tab`/`select_tab`/`close_tab` manage them. `tabId` is a **string** id from `surfbird_tabs`. `select_tab` only changes which tab your calls default to — there is no OS-level tab focus. Closing your last tab leaves an empty browser; `new_tab` again.

## Screenshots and PDF

- `surfbird_screenshot` returns an image attachment when available; otherwise a file path (`attachmentUnavailable`). `fullPage` is capped ~1440px tall by the engine.
- `surfbird_pdf` always returns a file path — PDFs are not image attachments.

## Diagnostics

- `surfbird_console`: console messages + exceptions captured since attach. Use `since` cursor + `only=errors` for incremental error reads.
- `surfbird_network`: request list (url/method/status/size/failure). `action=body&requestId=…` fetches a retained response body (~256KB cap per body).
- `surfbird_cdp`: raw CDP passthrough for anything the dedicated tools don't cover. Prefer dedicated tools — raw calls bypass ref/doc-token safety.

## Error codes

`browser_reset` (connection dropped — all tabs gone, retry), `no_tab`/`bad_tab_id`/`not_attached` (tab problems — `surfbird_tabs`), `ref_stale`/`doc_changed` (re-snapshot), `no_article` (use snapshot instead), `timeout` (raise timeoutMs or check state), `element_not_visible` (scroll into view or pick another target), `too_many_sessions` (too many concurrent agent sessions), `cdp_error` (engine/protocol error — message has details), `not_configured` (endpoint/token missing — direct user to plugin settings).

## Session lifetime

Each session browser lives up to **60 minutes** and is reclaimed after **10 minutes idle** (the plugin sends keepalives). Long tasks should checkpoint progress; a `browser_reset` means start over with `surfbird_status` + `surfbird_new_tab`/`navigate`.
