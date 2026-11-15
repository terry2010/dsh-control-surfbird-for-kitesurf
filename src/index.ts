/**
 * dsh-control-kitesurf：通过 Kitesurf CDP 协议控制浏览器引擎。
 *
 * 连接目标是任意 Kitesurf CDP 端点：surfbird raw 镜像（:8787）、surfbird auth
 * 镜像（:8080 + Bearer token）、上游 kitesurf（wrangler dev）。每个 agent
 * session 独占一条 WS 连接 = 一台独立浏览器；agent/disposed 时断开，
 * 引擎侧该 session 的所有 tab 随之销毁。
 *
 * 设计文档：docs/design.md（本地，不提交）
 *
 * @module dsh-control-kitesurf
 */

import z from '@deepseek-ai/schemastery'

export const name = 'control-kitesurf'

/** v1 不需要 agents/sessions 服务：session 归属走 exec.agent.session。 */
export const inject: string[] = []

export const Config = z.object({
  endpoint: z.string().default('http://127.0.0.1:8080').volatile()
    .description('Kitesurf CDP 端点：http(s) base（自动转 ws://…/devtools/browser）或完整 ws(s):// URL；env 兜底 KITESURF_ENDPOINT→KITESURF_URL→SURFBIRD_URL'),
  token: z.string().volatile()
    .description('Bearer token（surfbird auth 镜像需要）；env 兜底 KITESURF_TOKEN→SURFBIRD_TOKEN，空=无认证'),
  requestTimeoutMs: z.natural().min(1000).default(120000).volatile()
    .description('单条 CDP 调用超时（毫秒）'),
  keepaliveMs: z.natural().min(30000).default(300000).volatile()
    .description('WS 心跳间隔（毫秒）；引擎 idle 上限 10 分钟，必须小于它'),
  maxSessions: z.natural().min(1).default(8).volatile()
    .description('并发 agent session 上限；超限只驱逐 idle session，否则报 too_many_sessions'),
  idleEvictMs: z.natural().min(60000).default(300000).volatile()
    .description('session 闲置超过此时长（毫秒）才允许被 maxSessions 驱逐'),
  screenshotDir: z.string().volatile()
    .description('可选：截图同时落盘到该目录'),
  debugLog: z.boolean().default(false).volatile()
    .description('写诊断日志到 ~/.dsh/kitesurf-debug.log；默认关'),
})

export function apply(ctx: any, config: any): () => void {
  // M1 脚手架：工具注册在 src/tools.ts（M2+ 实现）。
  return () => {}
}
