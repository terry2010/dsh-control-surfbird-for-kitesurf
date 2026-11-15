# Contributing

Thanks for your interest. This plugin controls a Kitesurf browser engine over CDP from DSH.

## Dev setup

```bash
npm install
npm run build   # tsc -> lib/
npm test        # unit tests
npm run check   # plugin-shape check
```

## Conventions

- Tool names keep the `surfbird_*` prefix.
- `src/` and `client/` use erasable TypeScript only (Node type stripping): no `enum`/`namespace`/parameter properties; relative imports carry `.ts`.
- `src/cdp/` is a **host-independent shared core** — it must not import `@deepseek-ai/*` or other host framework packages; only `ws`, `@mozilla/readability`, `turndown` + Node builtins. It is designed to be copied wholesale into the future OpenCode/Pi plugins.
- Engine capability limits are real (Boa + DOM shim, not Chromium): no JS dialogs, file upload/download, clipboard, drag/touch, complete keyboard events. Check `surfbird_status` `capabilities` before promising behavior.

## Live testing

Unit tests run anywhere. Live CDP tests need a real engine:

```bash
SURFBIRD_URL=http://127.0.0.1:18080 SURFBIRD_TOKEN=<token> npm run test:live
# or: ssh -L 18080:127.0.0.1:8080 user@surfbird-host
```

See `test/live/` for the smoke suite.

## Releases

Version bumps, tags and `npm publish` happen only on explicit request. `git push`/`npm publish` are never done automatically.
