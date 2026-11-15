# dsh-control-surfbird-for-kitesurf

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.2.x-green.svg)](https://github.com/terry2010/dsh-control-surfbird-for-kitesurf)

[English](README.md) | **中文**

DSH（DeepSeek Harness）插件：让 AI agent 通过 Chrome DevTools Protocol（CDP）像人一样操控 [Kitesurf](https://github.com/cloudflare/kitesurf) 浏览器引擎。兼容自托管 [surfbird](https://github.com/terry2010/surfbird) 发行版（raw / token-auth 模式）和上游 Kitesurf 部署。提供 **28 个 `surfbird_*` 工具**：标签页管理、导航、语义化无障碍快照、点击/输入/填充、等待、JS 执行、截图、PDF 导出、console/network 检查——每个 agent 会话独享一个隔离浏览器。

## 特性

- **每会话独立浏览器**——每个 DSH agent 会话一条 CDP WebSocket，引擎侧映射为独立浏览器。标签页、元素 ref、console/network 缓冲互不泄漏；`maxSessions` 上限下按 LRU 驱逐。
- **语义快照而非 CSS 猜测**——`surfbird_snapshot` 返回带预算截断的无障碍树摘要和稳定 `[eN]` 元素引用；点击/填充/输入/滚动直接用 ref，导航后自动失效。
- **类人交互原语**——navigate/back/forward/reload、click/double_click、fill（`Kitesurf.setControlValue` 优先 + DOM 兜底）、type、带修饰键的 press_key、scroll，以及谓词等待（load/url/text/visible/hidden/enabled/networkidle/stable）。
- **页面自声明工具（WebMCP）**——`surfbird_webmcp` 列出并调用页面通过 `document.modelContext` 自注册的工具，有能力的页面可以直接暴露动作（"搜索"、"加入购物车"），不必猜 DOM。
- **JavaScript 执行**——`surfbird_evaluate` 在页面上下文跑 `Runtime.evaluate`；`surfbird_extract` 用 Readability + Turndown 提取正文（不受页面 DOM shim 影响）；`surfbird_links` 提取页面全部链接为 `{url,text}` 列表。
- **截图与 PDF**——视口、元素级（`target`+`padding`）、选区、整页截图（钳制到引擎上限 2560px 边长 / 2560×1440 像素），`Page.printToPDF` 支持纸张尺寸、页边距、方向和 CSS `@page`。截图以内联图片附件显示在对话里。
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

插件加载后模型即可见全部 28 个工具；`skills/surfbird-control/SKILL.md` 作为使用手册注册，无需提示词引导。

| 分组 | 工具 |
|---|---|
| 会话与浏览器 | `surfbird_status` `surfbird_tabs` `surfbird_new_tab` `surfbird_select_tab` `surfbird_close_tab` `surfbird_cdp` |
| 导航 | `surfbird_navigate` `surfbird_back` `surfbird_forward` `surfbird_reload` |
| 内容 | `surfbird_snapshot` `surfbird_ax` `surfbird_extract` `surfbird_find` `surfbird_links` `surfbird_webmcp` |
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

## 测试提示词

把下面这些提示词粘到 DSH 会话里即可逐个验证工具。示例统一使用 [zhuikan.com](https://zhuikan.com)（GitHub 趋势榜站，带搜索框和详情页）。从第一组开始。

**会话与浏览器**

| 提示词 | 验证 |
|---|---|
| `检查 surfbird 连接状态` | `surfbird_status`（含 `capabilities`） |
| `列出所有打开的标签页，告诉我当前是哪个` | `surfbird_tabs` |
| `在新标签页打开 https://zhuikan.com` | `surfbird_new_tab` |
| `打开 https://zhuikan.com，但不要等它加载完` | `surfbird_new_tab wait=none` |
| `切换到另一个标签页，然后关掉当前这个` | `surfbird_select_tab` + `surfbird_close_tab` |
| `用裸 CDP 获取当前页面的布局指标` | `surfbird_cdp` |

**导航**

| 提示词 | 验证 |
|---|---|
| `把当前标签页导航到 https://zhuikan.com` | `surfbird_navigate` |
| `打开 https://zhuikan.com/repos/openfilm__openfilm，然后后退再前进` | `surfbird_navigate` + `surfbird_back` + `surfbird_forward` |
| `绕过缓存硬刷新 zhuikan.com` | `surfbird_reload hard=true` |

**内容**

| 提示词 | 验证 |
|---|---|
| `给我 zhuikan.com 的语义快照` | `surfbird_snapshot` |
| `改用无障碍树给我看 zhuikan.com` | `surfbird_ax` |
| `打开 zhuikan.com 的一个仓库详情页，把正文提取成 markdown` | `surfbird_extract` |
| `zhuikan.com 页面上 "GitHub" 出现了几次？跳到第二个匹配处。` | `surfbird_find` |
| `列出 zhuikan.com 所有链接` | `surfbird_links` |
| `看看 zhuikan.com 有没有注册 WebMCP 工具` | `surfbird_webmcp action=list` |

**交互**（zhuikan.com 有搜索框、榜单 tab 和仓库链接）

| 提示词 | 验证 |
|---|---|
| `在 zhuikan.com 点击榜单里第一个仓库链接并等结果` | `surfbird_click` + `surfbird_wait` |
| `双击 zhuikan.com 的主标题` | `surfbird_double_click` |
| `在 zhuikan.com 的搜索框填入 "openfilm"` | `surfbird_fill` |
| `向 zhuikan.com 的搜索框输入 "rust"` | `surfbird_type` |
| `在 zhuikan.com 按回车提交搜索` | `surfbird_press_key` |
| `在 zhuikan.com 向下滚动 1000 像素看更多榜单` | `surfbird_scroll` |

**等待与执行**

| 提示词 | 验证 |
|---|---|
| `在 zhuikan.com 等页面文本出现 "GitHub"` | `surfbird_wait state=text` |
| `等 zhuikan.com 网络空闲后告诉我页面标题` | `surfbird_wait state=networkidle` + `surfbird_evaluate` |
| `在 zhuikan.com 执行 document.title 和 window.location.href` | `surfbird_evaluate` |

**输出**

| 提示词 | 验证 |
|---|---|
| `截一张 zhuikan.com 视口截图` | `surfbird_screenshot` |
| `只截 zhuikan.com 榜单区域的那个元素`（先 snapshot 拿 ref） | `surfbird_screenshot target={ref}` |
| `截 zhuikan.com 整页图` | `surfbird_screenshot fullPage=true` |
| `把 zhuikan.com 导出成 PDF` | `surfbird_pdf` |

**诊断**

| 提示词 | 验证 |
|---|---|
| `显示 zhuikan.com 的 console 错误` | `surfbird_console only=errors` |
| `列出 zhuikan.com 发出的网络请求` | `surfbird_network` |
| `取 zhuikan.com 第一个请求的响应体` | `surfbird_network action=body` |

**多步实战**——一条提示词串起多个工具：

```
打开 https://zhuikan.com，在搜索框输入 "openfilm" 并回车提交，
等结果页加载完成后告诉我最终停在哪个页面 URL，
然后用 surfbird_find 确认 "openfilm" 在页面上出现了几次，
最后只截图结果页里的仓库标题区域元素。
```

预期链路：`navigate` → `snapshot`（找搜索框 ref）→ `fill` → `press_key enter` → `wait`（url/text/networkidle）→ `evaluate`/`snapshot` → `find` → `screenshot target=…`。这是真实工作流，一次跑通 ref 处理、受控输入事件、页面静置等待和元素截图。

**WebMCP 调用**（需要页面注册了工具——先注入一个）

```
打开 https://zhuikan.com，然后用 surfbird_evaluate 执行：
document.modelContext.registerTool({name:'getTitle',description:'返回页面标题',
execute:async()=>document.title})
再调用 surfbird_webmcp action=list，然后 action=invoke tool=getTitle。
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
