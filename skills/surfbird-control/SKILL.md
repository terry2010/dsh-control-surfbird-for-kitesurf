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

- **Observe**: `surfbird_snapshot` returns a semantic digest — `[eN] role "name" → href` for interactive elements, `[hN]` headings, `[tN]` text. Use `surfbird_ax` for the accessibility tree when semantics matter. Use `surfbird_extract` for article→Markdown on content pages. Use `surfbird_find` to locate text on the page (Ctrl+F semantics: counts matches, scrolls to each, returns context snippet — no visual highlight).
- **Act**: click/fill/type/press_key/scroll/navigate using `eN` refs or CSS selectors.
- **Verify**: after every mutating action, confirm the effect — `surfbird_wait` for conditions, `surfbird_snapshot` for state, `surfbird_console`/`surfbird_network` for diagnostics.

## Refs and document tokens

- `eN` refs come from `surfbird_snapshot` and are **tab-scoped and generation-scoped**. Any navigation, reload, or `setDocumentContent` bumps the generation — refs then attempt a selector re-resolve (same element survives, `doc_changed` only if it can't); re-snapshot when a call still reports `doc_changed`.
- `truncated`/`omitted` in snapshot output means you hit the budget — narrow with `selector` or raise `maxChars`/`maxNodes`.
- `surfbird_wait` accepts `target: {ref}` or `{selector}` for visible/hidden/enabled checks.

## Finding text

`surfbird_find text=…` scans visible text (skips script/style/hidden subtrees), scrolls the match into view and returns `{count, index, snippet}` — the snippet is ±80 chars of context. `action=next|prev` walks matches; state persists per document and resets on navigation. `action=count` returns only the total; `clear` resets. `caseSensitive`/`wholeWord` flags supported. There is **no visual highlight** — follow up with `surfbird_screenshot` to see the scrolled position or `surfbird_extract`/`evaluate` for surrounding content.

## Waiting

`Page.navigate` returns **before** load finishes. After navigate/back/forward/reload — or any click that may navigate — call `surfbird_wait state=load` (or `domcontentloaded`). Other states: `url` (substring match), `text`/`text_gone` (substring in page text or a selector's text), `visible`/`hidden`/`enabled` (needs target ref or selector), `networkidle` (no in-flight requests for ~500ms), `stable` (no DOM mutations for ~500ms). Default timeout 30s; raise `timeoutMs` for slow pages. `load` fires before async content finishes — for SPA/JS-rendered pages prefer `networkidle` or `stable` before snapshot/screenshot.

## Input caveats (engine limits)

- `surfbird_click`/`double_click`/`fill`/`type`/`press_key` may silently no-op on some pages — the engine swallows input errors. **Always verify** with wait/snapshot afterwards.
- `fill` replaces the whole value and fires `input`/`change` events (works on React/Vue controlled inputs). `type` inserts text at the caret — it does not fire complete keyboard events.
- `press_key` supports ~60 named keys (enter, tab, escape, arrows, f1-f12, punctuation); `modifiers` bitmask: Alt=1 Ctrl=2 Meta=4 Shift=8.
- No JS dialogs, file upload/download, clipboard, drag/touch, or real keyboard events — do not promise these.

## Tabs

`surfbird_tabs` lists tabs; `new_tab`/`select_tab`/`close_tab` manage them. `tabId` is a **string** id from `surfbird_tabs`. `select_tab` only changes which tab your calls default to — there is no OS-level tab focus. Closing your last tab leaves an empty browser; `new_tab` again.

## Screenshots and PDF

- `surfbird_screenshot` waits for `load` by default before capturing (`waitFor` param: `none`/`load`/`domcontentloaded`/`networkidle`/`stable`, `timeoutMs` caps the wait). Pass `waitFor=networkidle` or `stable` when the page keeps mutating after load — a `load`-only wait can still capture a half-rendered SPA. Returns an image attachment when available; otherwise a file path (`attachmentUnavailable`). `fullPage` is capped ~1440px tall by the engine.
- `surfbird_pdf` has the same `waitFor`/`timeoutMs` params and always returns a file path — PDFs are not image attachments.

## Diagnostics

- `surfbird_console`: console messages + exceptions captured since attach. Use `since` cursor + `only=errors` for incremental error reads.
- `surfbird_network`: request list (url/method/status/size/failure). `action=body&requestId=…` fetches a retained response body (~256KB cap per body).
- `surfbird_cdp`: raw CDP passthrough for anything the dedicated tools don't cover. Prefer dedicated tools — raw calls bypass ref/doc-token safety.

## Error codes

`browser_reset` (connection dropped — all tabs gone, retry), `no_tab`/`bad_tab_id`/`not_attached` (tab problems — `surfbird_tabs`), `ref_stale`/`doc_changed` (re-snapshot), `no_article` (use snapshot instead), `bad_args` (invalid tool argument), `timeout` (raise timeoutMs or check state), `element_not_visible` (scroll into view or pick another target), `too_many_sessions` (too many concurrent agent sessions), `cdp_error` (engine/protocol error — message has details), `not_configured` (endpoint/token missing — direct user to plugin settings).

## Session lifetime

Each session browser lives up to **60 minutes** and is reclaimed after **10 minutes idle** (the plugin sends keepalives). Long tasks should checkpoint progress; a `browser_reset` means start over with `surfbird_status` + `surfbird_new_tab`/`navigate`.
