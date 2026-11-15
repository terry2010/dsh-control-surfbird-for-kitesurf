# dsh-control-surfbird-for-kitesurf 开发规范

DSH 插件：通过 Kitesurf CDP 协议控制浏览器引擎（surfbird raw/auth、上游 kitesurf 均可）。
工具前缀 `surfbird_*`（对齐发行版品牌；官方 kitesurf 插件可用 `kitesurf_*`，互不占位）。
设计文档在 `docs/design.md`（docs/ 已 gitignore，不提交）。

## 推送/发布规则（用户明确要求）

- **git push 和 npm publish 只在用户明确说"推"时才执行**
- 平时所有改动只做本地 commit（不 push）
- 版本号 bump 也只在发布前做

## 开发流程

- `npm run build`（tsc → lib/）+ `npm test`（unit）+ `npm run check`（插件形态）全绿才能提交
- `test/live/` 需要真实引擎：`SURFBIRD_URL`+`SURFBIRD_TOKEN`（或 `KITESURF_ENDPOINT`+`KITESURF_TOKEN`）环境变量，
  或 `ssh -L 18080:127.0.0.1:8080 user@surfbird-host` 隧道到 surfbird 容器
- `npm run check` 只验证插件形态；真实 CDP 行为靠 live 测试和 DSH 手动验证

## 共享代码约定（与 opencode-control-surfbird-for-kitesurf）

- `src/cdp/` 是将来要整目录复制到 opencode 仓库的共享核心
- `src/cdp/` 内**禁止** import `@deepseek-ai/*` 或 `src/` 其他模块，只依赖 `ws` + node builtins
- 改 `src/cdp/` 后需人工同步 opencode 仓库（在 commit message 注明）

## 引擎边界（不要假设）

- 每 WS 连接 = 一台独立浏览器（per-connection BrowserState），断线=所有 tab 蒸发
- 单 WS 60 分钟硬上限、10 分钟 idle 超时（keepalive 必须 <10min）
- Kitesurf 是 Boa + DOM shim 不是 V8/Chromium：无 JS dialog、无文件上传/下载、
  无剪贴板、无 drag/touch、KeyboardEvent 不完整、hit-testing partial
- 详见 docs/design.md §8 能力边界清单——新工具先对照清单再承诺
