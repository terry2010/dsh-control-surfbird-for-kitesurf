/**
 * dsh-control-surfbird-for-kitesurf：通过 Kitesurf CDP 协议控制浏览器引擎。
 *
 * 连接目标是任意 Kitesurf CDP 端点：surfbird raw 镜像（:8787）、surfbird auth
 * 镜像（:8080 + Bearer token）、上游 kitesurf（wrangler dev）。每个 agent
 * session 独占一条 WS 连接 = 一台独立浏览器；agent/disposed 时断开，
 * 引擎侧该 session 的所有 tab 随之销毁。
 *
 * 工具前缀 surfbird_*：对齐本发行版品牌；官方 kitesurf 若发布插件可使用
 * kitesurf_* 命名空间，互不占位。
 *
 * 设计文档：docs/design.md（本地，不提交）
 *
 * @module dsh-control-surfbird-for-kitesurf
 */

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import z from '@deepseek-ai/schemastery'
import { SessionRegistry } from './cdp/session.ts'
import type { SessionOptions } from './cdp/session.ts'
import { registerSurfbirdTools } from './tools.ts'
import { registerSurfbirdSkill } from './skill.ts'
import { normalizeEndpoint } from './cdp/transport.ts'
import { encryptToken, isEncryptedBlob, readTokenFile } from './tokenfile.ts'

export const name = 'control-surfbird'

/** 硬依赖 tools 服务（25 个工具是插件主体）；attachments/skills/webServer/settings 均为可选，走 ctx.get/ctx.inject 软获取。 */
export const inject: string[] = ['tools']

const DEFAULT_ENDPOINT = 'http://127.0.0.1:8080'
const ENDPOINT_ENVS = ['SURFBIRD_URL', 'SURFBIRD_ENDPOINT', 'KITESURF_URL', 'KITESURF_ENDPOINT'] as const
const TOKEN_ENVS = ['SURFBIRD_TOKEN', 'KITESURF_TOKEN'] as const
const SETTINGS_NAMESPACE = 'control-surfbird'

export const Config = z.object({
  endpoint: z.string().default(DEFAULT_ENDPOINT).volatile()
    .description('Kitesurf CDP 端点：http(s) base（自动转 ws://…/devtools/browser）或完整 ws(s):// URL；env 兜底 SURFBIRD_URL→SURFBIRD_ENDPOINT→KITESURF_URL→KITESURF_ENDPOINT'),
  token: z.string().volatile()
    .description('Bearer token（surfbird auth 镜像需要）；tokenFile 优先；env 兜底 SURFBIRD_TOKEN→KITESURF_TOKEN，空=无认证'),
  tokenFile: z.string().volatile()
    .description('可选：token 文件路径；内容为 Bearer token 明文或 surfbird-v1: 机器绑定密文（surfbird-token encrypt 生成，拷到别的机器解不开）；优先于 token 字段，token 不落配置文件'),
  requestTimeoutMs: z.natural().min(1000).default(120000).volatile()
    .description('单条 CDP 调用超时（毫秒）'),
  keepaliveMs: z.natural().min(30000).default(300000).volatile()
    .description('WS 心跳间隔（毫秒）；引擎 idle 上限 10 分钟，必须小于它'),
  maxSessions: z.natural().min(1).default(8).volatile()
    .description('并发 agent session 上限；超限只驱逐 idle session，否则报 too_many_sessions'),
  idleEvictMs: z.natural().min(60000).default(300000).volatile()
    .description('session 闲置超过此时长（毫秒）才允许被 maxSessions 驱逐'),
  screenshotDir: z.string().volatile()
    .description('可选：截图/PDF 同时落盘到该目录（attachments 服务不可用时的兜底）'),
  debugLog: z.boolean().default(false).volatile()
    .description('写诊断日志到 ~/.dsh/surfbird-debug.log；默认关'),
})

export interface ResolvedConfig {
  endpoint: string
  token: string
  tokenFile?: string
  /** tokenFile 读取/解密失败原因（诊断用；此时回退到 token/env 源）。 */
  tokenFileError?: string
  /** tokenFile 内容是 surfbird-v1: 密文。 */
  tokenFileEncrypted?: boolean
  requestTimeoutMs: number
  keepaliveMs: number
  maxSessions: number
  idleEvictMs: number
  screenshotDir?: string
  debugLog: boolean
  /** endpoint/token 的实际来源（status 路由用）。 */
  configSource: string
}

function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : undefined
}

function firstEnv(names: readonly string[]): string | undefined {
  for (const n of names) {
    const v = env(n)
    if (v) return v
  }
  return undefined
}

/** cordis volatile 字段解析后是 {get} 描述符（宿主原地热更）；裸值原样返回。 */
function volatileValue(v: unknown): unknown {
  if (v !== null && typeof v === 'object' && typeof (v as { get?: unknown }).get === 'function'
    && Object.keys(v).every((k) => k === 'get')) {
    return (v as { get: () => unknown }).get()
  }
  return v
}

/** 解析生效配置：config（settings scope 或 apply 入参，volatile 字段就地热更）> env > 默认。 */
export function resolveConfig(config: Record<string, unknown>): ResolvedConfig {
  // 每个字段读取都过 volatileValue——resolved() 每次调用重解，配置页改值即时生效
  const raw = (k: string): unknown => volatileValue(config[k])
  const cfgEndpoint = typeof raw('endpoint') === 'string' && (raw('endpoint') as string).trim() ? (raw('endpoint') as string).trim() : undefined
  const envEndpoint = firstEnv(ENDPOINT_ENVS)
  // config.endpoint 有 schemastery 默认值——等于默认值时让 env 优先
  const endpoint = cfgEndpoint && cfgEndpoint !== DEFAULT_ENDPOINT ? cfgEndpoint : (envEndpoint ?? cfgEndpoint ?? DEFAULT_ENDPOINT)
  const endpointSource = cfgEndpoint && cfgEndpoint !== DEFAULT_ENDPOINT ? 'config' : envEndpoint ? 'env' : 'default'

  const tokenFile = typeof raw('tokenFile') === 'string' && (raw('tokenFile') as string).trim() ? (raw('tokenFile') as string).trim() : undefined
  const cfgToken = typeof raw('token') === 'string' && (raw('token') as string).trim() ? (raw('token') as string).trim() : undefined
  const envToken = firstEnv(TOKEN_ENVS)
  const fileRes = readTokenFile(tokenFile)
  const fileToken = fileRes.token
  const token = fileToken ?? cfgToken ?? envToken ?? ''
  const tokenSource = fileToken ? 'tokenFile' : cfgToken ? 'config' : envToken ? 'env' : 'none'
  const num = (k: string, d: number): number => typeof raw(k) === 'number' ? (raw(k) as number) : d

  return {
    endpoint,
    token,
    tokenFile,
    tokenFileError: fileRes.error,
    tokenFileEncrypted: fileRes.encrypted,
    requestTimeoutMs: num('requestTimeoutMs', 120000),
    keepaliveMs: num('keepaliveMs', 300000),
    maxSessions: num('maxSessions', 8),
    idleEvictMs: num('idleEvictMs', 300000),
    screenshotDir: typeof raw('screenshotDir') === 'string' && (raw('screenshotDir') as string).trim() ? (raw('screenshotDir') as string).trim() : undefined,
    debugLog: raw('debugLog') === true,
    configSource: `${endpointSource}+${tokenSource}`,
  }
}

/** ws(s)://…/devtools/browser → http(s)://host（探活 /json/version 用）。 */
function httpBase(endpoint: string): string | undefined {
  try {
    const ws = normalizeEndpoint(endpoint)
    const u = new URL(ws)
    u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:'
    u.pathname = ''
    u.search = ''
    return u.toString().replace(/\/$/, '')
  } catch {
    return undefined
  }
}

export function apply(ctx: Context, config: Record<string, unknown>): () => void {
  // settings scope：让 client configForms 的写入实时生效（服务缺失时退化为 apply 入参）
  let currentSource: () => Record<string, unknown> = () => config
  try {
    ctx.inject(['settings'], (settingsCtx) => {
      const scope = (settingsCtx as { settings?: { register?: (ns: string, schema: unknown, opts: { base: unknown }) => { get: () => Record<string, unknown> } } }).settings
      if (scope?.register) {
        const s = scope.register(SETTINGS_NAMESPACE, Config, { base: config })
        currentSource = () => s.get()
      }
    })
  } catch { /* settings 服务缺失 → 静态 config */ }

  const resolved = (): ResolvedConfig => resolveConfig(currentSource())
  const registry = new SessionRegistry({ maxSessions: resolved().maxSessions, idleEvictMs: resolved().idleEvictMs })
  // attachments 服务延迟解析：apply 时服务可能尚未激活，截图时再取
  const getAttachments = (): AttachmentStore | undefined => {
    try { return ctx.get('attachments') as AttachmentStore | undefined } catch { return undefined }
  }

  const sessionOpts = (): SessionOptions => {
    const c = resolved()
    return { endpoint: c.endpoint, token: c.token, requestTimeoutMs: c.requestTimeoutMs, keepaliveMs: c.keepaliveMs }
  }

  const deps = {
    registry,
    sessionOpts,
    get requestTimeoutMs() { return resolved().requestTimeoutMs },
    get attachments() { return getAttachments() },
    get outputDir() { return resolved().screenshotDir },
    configInfo: () => {
      const c = resolved()
      return { configSource: c.configSource, endpoint: c.endpoint, tokenSet: !!c.token, tokenFileError: c.tokenFileError, tokenFileEncrypted: c.tokenFileEncrypted }
    },
    onSessionError: (_key: string, err: unknown) => {
      if (resolved().debugLog) logDebug(`session error: ${err instanceof Error ? err.message : String(err)}`)
    },
  }

  const disposeTools = registerSurfbirdTools(ctx, deps)
  // skills 服务可能晚于 apply 激活——inject 回调等到就注册；缺失则静默降级
  try {
    ctx.inject(['skills'], (skillsCtx) => { registerSurfbirdSkill(skillsCtx) })
  } catch { /* skills 服务缺失 → 无 skill */ }

  // agent 销毁 → 断开该 session 的浏览器（引擎侧 tab 全灭）
  const offDisposed = ctx.on('agent/disposed', ({ agent }: { agent?: { id?: unknown; session?: { id?: unknown } } }) => {
    const id = agent?.session?.id ?? agent?.id
    if (typeof id === 'string' && id) void registry.release(id).catch(() => undefined)
  })

  // 状态路由：client toast/设置页探活用；?probe=1 才真实请求 /json/version
  // webServer 服务可能缺失（headless profile）——inject 回调等到就注册
  let unregisterStatus: (() => void) | undefined
  let unregisterImport: (() => void) | undefined
  try {
    ctx.inject(['webServer'], (webCtx) => {
      const webServer = webCtx.get('webServer') as { register?: (r: unknown) => () => void } | undefined
      if (!webServer?.register) return
      const sendJson = (res: ServerResponse, body: unknown, status = 200) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(body))
      }
      // tokenFile 导入：client 文件选择器读到的内容 POST 到这里——
      // surfbird-v1: 密文原样存；明文用本机 UUID 加密后存 ~/.dsh/surfbird-token（0600）。
      // x-surfbird-ui 自定义头挡跨站 simple-request CSRF（跨域带不了该头，会触发 preflight 被拒）。
      // 注意：webServer 的 resource 路由只放行 GET/HEAD，POST 必须走 handler（裸 req/res）。
      unregisterImport = webServer.register({
        kind: 'exact',
        path: '/plugins/control-surfbird/tokenfile',
        handler: (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.writeHead(405, { allow: 'POST' })
            res.end()
            return
          }
          if (req.headers['x-surfbird-ui'] !== '1') {
            sendJson(res, { ok: false, error: 'forbidden' }, 403)
            return
          }
          let body = ''
          let tooLarge = false
          req.on('data', (chunk: Buffer) => {
            if (tooLarge) return
            body += chunk.toString('utf8')
            if (body.length > 8192) {
              tooLarge = true
              sendJson(res, { ok: false, error: 'too large' }, 413)
              req.destroy()
            }
          })
          req.on('end', () => {
            if (tooLarge) return
            const content = body.trim()
            if (!content) {
              sendJson(res, { ok: false, error: 'empty' }, 400)
              return
            }
            const dir = join(homedir(), '.dsh')
            mkdirSync(dir, { recursive: true })
            const file = join(dir, 'surfbird-token')
            let encrypted = isEncryptedBlob(content)
            if (!encrypted) {
              try {
                writeFileSync(file, encryptToken(content) + '\n', { mode: 0o600 })
                encrypted = true
              } catch {
                // 本机无 machine id → 明文落盘（0600），返回 encrypted:false 让 UI 如实提示
                writeFileSync(file, content + '\n', { mode: 0o600 })
              }
            } else {
              writeFileSync(file, content + '\n', { mode: 0o600 })
            }
            sendJson(res, { ok: true, path: file, encrypted })
          })
          req.on('error', () => {
            if (!res.headersSent) sendJson(res, { ok: false, error: 'read failed' }, 400)
          })
        },
      })
      unregisterStatus = webServer.register({
        kind: 'exact',
        path: '/plugins/control-surfbird/status',
        resource: async (request: Request) => {
          const c = resolved()
          const url = new URL(request.url)
          const body: Record<string, unknown> = {
            configSource: c.configSource,
            endpointSet: !!c.endpoint,
            tokenSet: !!c.token,
            tokenFileSet: !!c.tokenFile,
            tokenFileEncrypted: c.tokenFileEncrypted === true,
            tokenFileError: c.tokenFileError,
            configured: !!c.endpoint,
            activeSessions: registry.size(),
          }
          if (url.searchParams.get('probe') === '1') {
            const base = httpBase(c.endpoint)
            if (base) {
              try {
                const ctrl = new AbortController()
                const t = setTimeout(() => ctrl.abort(), 3000)
                const headers: Record<string, string> = {}
                if (c.token) headers.authorization = `Bearer ${c.token}`
                const res = await fetch(`${base}/json/version`, { signal: ctrl.signal, headers })
                clearTimeout(t)
                if (res.ok) {
                  const v = (await res.json()) as Record<string, unknown>
                  body.reachable = true
                  body.product = v.Browser ?? v.product
                  body.webSocketDebuggerUrl = v.webSocketDebuggerUrl
                } else {
                  body.reachable = false
                  body.probeStatus = res.status
                }
              } catch (e) {
                body.reachable = false
                body.probeError = e instanceof Error ? e.message : String(e)
              }
            } else {
              body.reachable = false
              body.probeError = 'endpoint is not a valid URL'
            }
          }
          return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
        },
      })
    })
  } catch { /* webServer 服务缺失 → 无状态路由 */ }

  return () => {
    offDisposed?.()
    unregisterStatus?.()
    unregisterImport?.()
    disposeTools()
    void registry.disposeAll()
  }
}

function logDebug(msg: string): void {
  try {
    const dir = join(homedir(), '.dsh')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'surfbird-debug.log'), `${new Date().toISOString()} ${msg}\n`)
  } catch { /* debug log 尽力而为 */ }
}
