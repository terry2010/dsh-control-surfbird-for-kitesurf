# dsh-control-surfbird-for-kitesurf

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.2.x-green.svg)](https://github.com/terry2010/dsh-control-surfbird-for-kitesurf)

**English** | [中文](#中文)

A [DSH](https://www.deepseek.com/) (DeepSeek Harness) plugin that gives an AI agent full control of a [Kitesurf](https://github.com/cloudflare/kitesurf) browser engine over the Chrome DevTools Protocol (CDP) — like a human operating a browser. Works with the self-hosted [surfbird](https://github.com/terry2010/surfbird) distribution (raw or token-auth mode) and upstream Kitesurf deployments. Exposes **25 `surfbird_*` tools**: tab management, navigation, semantic accessibility snapshots, click/type/fill, waits, JavaScript evaluation, screenshots, PDF export, and console/network inspection — with one isolated browser per agent session.

## Features

- **Per-session browser isolation** — each DSH agent session owns a dedicated CDP WebSocket, which the engine maps to an independent browser. Tabs, element refs, console buffers and network buffers never leak across sessions; sessions are evicted LRU-style under `maxSessions`.
- **Semantic snapshots, not CSS guessing** — `surfbird_snapshot` returns a bounded, budget-trimmed digest of the accessibility tree with stable `[eN]` element refs. Click, fill, type and scroll accept refs directly; refs auto-invalidate on navigation.
- **Human-like interaction primitives** — navigate/back/forward/reload, click/double-click, fill (via `Kitesurf.setControlValue` with DOM fallback), type, press_key with modifiers, scroll, and predicate waits (`load`, `url`, `text`, `visible`, `hidden`, `enabled`, custom JS).
- **JavaScript evaluation** — `surfbird_evaluate` runs `Runtime.evaluate` in the page context; `surfbird_extract` returns article text via Readability + Turndown (no in-page DOM shim issues).
- **Screenshots & PDF** — viewport, clipped-region and full-page captures (clamped to engine limits of 2560px sides / 2560×1440 px), `Page.printToPDF` with paper size, margins, orientation and CSS `@page` support. Screenshots return inline image attachments viewable in the chat.
- **Console & network inspection** — per-tab console and network buffers with sequence cursors (`sinceIndex`), error filtering, and session-aware request correlation.
- **Raw CDP escape hatch** — `surfbird_cdp` sends arbitrary CDP methods for anything the typed tools don't cover.
- **Settings UI + proactive setup** — a client-half config card (endpoint, credentials, timeouts, session limits) with hot reload, a one-time setup toast when unconfigured or unreachable, inline "open settings" buttons on connection failures, and live connection status with failure reasons.
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

The model sees all 25 tools once the plugin loads; `skills/surfbird-control/SKILL.md` is registered as a usage manual so agents know the workflow without prompting.

| Group | Tools |
|---|---|
| Session & browser | `surfbird_status` `surfbird_tabs` `surfbird_new_tab` `surfbird_select_tab` `surfbird_close_tab` `surfbird_cdp` |
| Navigation | `surfbird_navigate` `surfbird_back` `surfbird_forward` `surfbird_reload` |
| Content | `surfbird_snapshot` `surfbird_ax` `surfbird_extract` |
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

[Apache-2.0](LICENSE)

## Related projects

- [surfbird](https://github.com/terry2010/surfbird) — self-hosted Docker distribution of Kitesurf with token auth, REST proxy and MCP server
- [Kitesurf](https://github.com/cloudflare/kitesurf) — Cloudflare's experimental browser engine built for AI agents; runs on Workers and speaks CDP
- [DeepSeek Harness (DSH)](https://www.deepseek.com/) — the agent harness this plugin extends
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) — the protocol this plugin speaks

---

# 中文

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

**[English](#dsh-control-surfbird-for-kitesurf) | 中文**

DSH（DeepSeek Harness）插件：让 AI agent 通过 Chrome DevTools Protocol（CDP）像人一样操控 [Kitesurf](https://github.com/cloudflare/kitesurf) 浏览器引擎。兼容自托管 [surfbird](https://github.com/terry2010/surfbird) 发行版（raw / token-auth 模式）和上游 Kitesurf 部署。提供 **25 个 `surfbird_*` 工具**：标签页管理、导航、语义化无障碍快照、点击/输入/填充、等待、JS 执行、截图、PDF 导出、console/network 检查——每个 agent 会话独享一个隔离浏览器。

## 特性

- **每会话独立浏览器**——每个 DSH agent 会话一条 CDP WebSocket，引擎侧映射为独立浏览器。标签页、元素 ref、console/network 缓冲互不泄漏；`maxSessions` 上限下按 LRU 驱逐。
- **语义快照而非 CSS 猜测**——`surfbird_snapshot` 返回带预算截断的无障碍树摘要和稳定 `[eN]` 元素引用；点击/填充/输入/滚动直接用 ref，导航后自动失效。
- **类人交互原语**——navigate/back/forward/reload、click/double_click、fill（`Kitesurf.setControlValue` 优先 + DOM 兜底）、type、带修饰键的 press_key、scroll，以及谓词等待（load/url/text/visible/hidden/enabled/自定义 JS）。
- **JavaScript 执行**——`surfbird_evaluate` 在页面上下文跑 `Runtime.evaluate`；`surfbird_extract` 用 Readability + Turndown 提取正文（不受页面 DOM shim 影响）。
- **截图与 PDF**——视口/选区/整页截图（钳制到引擎上限 2560px 边长 / 2560×1440 像素），`Page.printToPDF` 支持纸张尺寸、页边距、方向和 CSS `@page`。截图以内联图片附件显示在对话里。
- **Console 与网络检查**——按标签页的 console/network 缓冲，序号游标（`sinceIndex`）、错误过滤、会话感知的请求关联。
- **裸 CDP 逃逸口**——`surfbird_cdp` 直发任意 CDP 方法，覆盖类型化工具没有的能力。
- **设置 UI + 主动引导**——client half 提供配置卡（端点、凭据、超时、会话上限）热生效；未配置或不可达时每会话弹一次设置提示；连接类失败的工具行内带"打开设置"按钮；状态横幅显示实时连接状态和失败原因。
- **机器绑定加密密钥文件**——`tokenFile` 支持明文或 `surfbird-v1:` AES-256-GCM 密文，密钥由本机 UUID（macOS `IOPlatformUUID` / Windows `MachineGuid` / Linux `machine-id`）派生，换机器无法解密，可安全提交/同步。附 `surfbird-token` CLI（`encrypt`/`decrypt`/`id`）和浏览器文件选择器一键导入加密。
- **可移植共享核心**——`src/cdp/` 零 DSH 依赖（仅 `ws` + Node 内置模块），可整目录复制进 OpenCode 或 Pi 宿主。

## 环境要求

- DSH `0.2.x`（基于 `0.2.2-rc.3` 开发；旧版槽位 API 会优雅降级）
- Node.js `>= 22.18`（type-stripping 运行时，安装无需构建）
- Kitesurf 兼容的 CDP 端点：
  - **surfbird 容器**——`surfbird` Docker 镜像，建议 `auth` 模式（设 `SURFBIRD_TOKEN`）
  - **上游 Kitesurf**——`wrangler dev` 或已部署引擎
  - **raw surfbird**——无需 token

## 安装

```bash
dsh plugin --profile <name> add dsh-control-surfbird-for-kitesurf
```

本地开发：在 profile 的 `package.json` 加 `"file:/path/to/dsh-control-surfbird-for-kitesurf"`，把 `cordis.patch.yml` 合并进 profile 的 patch 文件后重装。

装完后打开插件设置页（或等设置提示）配置端点和凭据——配置热生效，无需重启。

## 配置项

| 字段 | 说明 |
|---|---|
| `endpoint` | CDP 端点，如 `http://127.0.0.1:8787` 或 `http://123.123.123.123:8787`。`http(s)://` 会自动归一化为浏览器 WebSocket。SSH 隧道（`ssh -L 8787:127.0.0.1:8080 host`）可避免把引擎暴露公网。 |
| `token` | surfbird auth 模式的 Bearer token。建议优先用 `tokenFile`，避免密钥落配置文件。 |
| `tokenFile` | 密钥文件路径——明文或 `surfbird-v1:` 机器绑定密文（优先级高于 `token`）。 |

高级可选：`requestTimeoutMs`、`keepaliveMs`、`maxSessions`、`idleEvictMs`、`screenshotDir`、`debugLog`。

端口说明：raw 引擎与上游 Kitesurf `wrangler dev` 默认监听 `:8787`；surfbird `auth` 代理默认监听 `:8080`（`SURFBIRD_PORT` 可改）。

无头/CI 环境变量兜底：端点 `SURFBIRD_URL`/`SURFBIRD_ENDPOINT`/`KITESURF_URL`/`KITESURF_ENDPOINT`，密钥 `SURFBIRD_TOKEN`/`KITESURF_TOKEN`。

### 加密密钥文件

`tokenFile` 按内容自动识别两种格式：

- **明文**——原始 Bearer token（建议 `chmod 600`）。
- **`surfbird-v1:` 密文**——AES-256-GCM，密钥 = `scrypt(本机 UUID)`。用自带 CLI 生成：

```bash
echo -n 'your-token' | npx surfbird-token encrypt -o ~/.surfbird-token
surfbird-token decrypt ~/.surfbird-token   # 验证
surfbird-token id                          # 查看本机标识
```

密文不含机器标识——可以放心提交、同步、备份，只是换机器解不开。注意：Windows/Linux 重装系统可能更换 UUID（重跑 `encrypt` 即可）；机器绑定≠用户绑定，同用户进程仍可推导密钥，要更强隔离请用系统凭据存储。

## 使用方式

插件加载后模型即可见全部 25 个工具；`skills/surfbird-control/SKILL.md` 作为使用手册注册，无需提示词引导。

| 分组 | 工具 |
|---|---|
| 会话与浏览器 | `surfbird_status` `surfbird_tabs` `surfbird_new_tab` `surfbird_select_tab` `surfbird_close_tab` `surfbird_cdp` |
| 导航 | `surfbird_navigate` `surfbird_back` `surfbird_forward` `surfbird_reload` |
| 内容 | `surfbird_snapshot` `surfbird_ax` `surfbird_extract` |
| 交互 | `surfbird_click` `surfbird_double_click` `surfbird_fill` `surfbird_type` `surfbird_press_key` `surfbird_scroll` |
| 等待与执行 | `surfbird_wait` `surfbird_evaluate` |
| 输出 | `surfbird_screenshot` `surfbird_pdf` |
| 诊断 | `surfbird_console` `surfbird_network` |

典型流程：

```
surfbird_status                    → 验证连接和引擎
surfbird_new_tab url=https://…     → 开标签页（默认等加载）
surfbird_snapshot                  → 带 [eN] ref 的语义摘要
surfbird_fill ref=e3 value=…       → 按 ref 交互
surfbird_screenshot                → 截图验证（内联图片）
```

## 引擎边界

Kitesurf 是 Boa + DOM shim 引擎，不是 Chromium/V8。已知限制：

- 一条 CDP WebSocket = 一个浏览器；连接约 60 分钟硬上限、约 10 分钟空闲超时（keepalive 远低于此）
- 无 JS 弹窗、文件上传/下载、剪贴板、拖拽/触摸；`KeyboardEvent` 支持不完整；命中测试部分实现
- 截图钳制为单边 2560px / 总像素 2560×1440；`fullPage` 通过临时拉伸视口近似实现
- 截图/PDF 失败时引擎返回占位 `data` + `error` 字段而非抛 CDP 错误——工具层已处理

## 开发

```bash
npm install
npm run build      # tsc → lib/
npm test           # 单元测试（无需引擎）
npm run check      # 插件形态检查
npm run test:live  # live 冒烟——需要 SURFBIRD_URL/TOKEN 或：
                   #   ssh -L 8787:127.0.0.1:8080 <surfbird-host>
npm pack --dry-run
```

`src/cdp/` 必须保持零 `@deepseek-ai/*` 引用——它是预留给 OpenCode/Pi 移植的可移植核心。

## 常见问题

**只支持 surfbird 还是也支持上游 Kitesurf？**
都支持。插件走标准 CDP；surfbird auth 模式只是多一个 Bearer token。raw surfbird 和上游 `wrangler dev` 引擎免 token 直连。

**为什么每会话一个浏览器而不是共享标签页？**
引擎把每条 WebSocket 映射为隔离的 `BrowserState`——连接断开标签页即销毁。每会话连接实现真隔离：并发 agent 互相看不到、关不掉对方标签页，`maxSessions` 还能限制资源占用。

**密钥存得安全吗？**
三种方式按优先级：`tokenFile`（明文 `chmod 600`，或换机无法解密的 `surfbird-v1:` 密文）、`token` 字段、`SURFBIRD_TOKEN` 环境变量。设置 UI 支持选文件一键导入并在宿主侧加密。

**不能做什么？**
引擎做不到的都不行：JS 弹窗、文件上传/下载、剪贴板、拖拽/触摸、真实键盘事件、跨连接持久状态。详见上文"引擎边界"——SKILL.md 也会把这些边界写给模型。

## 许可证

[Apache-2.0](LICENSE)

## 相关项目

- [surfbird](https://github.com/terry2010/surfbird) —— Kitesurf 的自托管 Docker 发行版，含 token 认证、REST 代理和 MCP 服务
- [Kitesurf](https://github.com/cloudflare/kitesurf) —— Cloudflare 的实验性浏览器引擎，为 AI agent 而生；跑在 Workers 上，讲 CDP
- [DeepSeek Harness（DSH）](https://www.deepseek.com/) —— 本插件所扩展的 agent 运行时
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) —— 本插件使用的协议
