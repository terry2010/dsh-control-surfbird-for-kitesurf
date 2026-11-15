/**
 * dsh-control-surfbird-for-kitesurf — web 端 client half。
 *
 * 三块职责：
 * 1. configForms 配置卡（plugins.bundle.config 槽位）：endpoint/token/tokenFile
 *    + advanced 折叠组；写 handle.set/mutate → host Config volatile 热生效。
 * 2. 设置页内状态横幅 + "测试连接"（GET /plugins/control-surfbird/status?probe=1）。
 * 3. shell.overlay 启动 toast：未配置/不可达时强提示 + 一键跳设置页
 *    （pluginNavigation.openBundle('control-surfbird')，每会话一次）。
 * 4. tool.call.toolview 键控行：surfbird_* 工具失败且属连接类错误时，
 *    行内给"打开设置"按钮。
 *
 * 参考：dsh-loop-recover/client/client.js（configForms 范式）、
 * dshmarket InstallToast（shell.overlay 范式）、dsh-client-ui-tool 契约
 * （tool.call.toolview keyed slot）。手写 __ModuleLoader__，无 tsc 覆盖——
 * API 细节以真机验证为准，全部做了防御性降级。
 */
window.__ModuleLoader__.load({
  id: 'control-surfbird',
  factory: (require) => {
    const ID = 'control-surfbird'
    const NS = 'control-surfbird'
    const STATUS_URL = '/plugins/control-surfbird/status'
    const TOOL_NAMES = [
      'surfbird_status', 'surfbird_tabs', 'surfbird_new_tab', 'surfbird_close_tab',
      'surfbird_select_tab', 'surfbird_navigate', 'surfbird_back', 'surfbird_forward',
      'surfbird_reload', 'surfbird_wait', 'surfbird_snapshot', 'surfbird_ax',
      'surfbird_click', 'surfbird_double_click', 'surfbird_fill', 'surfbird_type',
      'surfbird_press_key', 'surfbird_scroll', 'surfbird_screenshot', 'surfbird_pdf',
      'surfbird_evaluate', 'surfbird_extract', 'surfbird_console', 'surfbird_network',
      'surfbird_cdp',
    ]
    // 连接类错误 → 行内给设置入口
    const CONN_CODES = new Set(['cdp_error', 'browser_reset', 'timeout', 'not_configured', 'no_tab'])

    const DICT = {
      zh: {
        'group.main': '连接', 'group.advanced': '高级',
        'f.endpoint': 'CDP 端点', 'f.token': 'Token', 'f.tokenFile': 'Token 文件',
        'f.requestTimeoutMs': '请求超时 (ms)', 'f.keepaliveMs': '心跳间隔 (ms)',
        'f.maxSessions': '最大会话数', 'f.idleEvictMs': '空闲回收 (ms)',
        'f.screenshotDir': '截图/PDF 目录', 'f.debugLog': '诊断日志',
        'status.ok': '已连接', 'status.bad': '未连接', 'status.unknown': '未检测',
        'test': '测试连接', 'testing': '检测中…', 'openSettings': '打开设置',
        'saved': '已保存', 'writeFail': '写入失败',
        'toast.title': 'surfbird 浏览器插件需要配置',
        'toast.body': '尚未配置 Kitesurf CDP 端点或无法连接。点击下方按钮前往插件设置完成配置。',
        'toast.action': '去设置', 'toast.dismiss': '暂不',
        'row.fail': 'surfbird 调用失败',
      },
      en: {
        'group.main': 'Connection', 'group.advanced': 'Advanced',
        'f.endpoint': 'CDP endpoint', 'f.token': 'Token', 'f.tokenFile': 'Token file',
        'f.requestTimeoutMs': 'Request timeout (ms)', 'f.keepaliveMs': 'Keepalive (ms)',
        'f.maxSessions': 'Max sessions', 'f.idleEvictMs': 'Idle eviction (ms)',
        'f.screenshotDir': 'Screenshot/PDF dir', 'f.debugLog': 'Debug log',
        'status.ok': 'Connected', 'status.bad': 'Unreachable', 'status.unknown': 'Unknown',
        'test': 'Test connection', 'testing': 'Testing…', 'openSettings': 'Open settings',
        'saved': 'saved', 'writeFail': 'write failed',
        'toast.title': 'surfbird browser plugin needs setup',
        'toast.body': 'The Kitesurf CDP endpoint is not configured or unreachable. Open plugin settings to finish setup.',
        'toast.action': 'Open settings', 'toast.dismiss': 'Later',
        'row.fail': 'surfbird call failed',
      },
    }

    const FIELDS = [
      { group: 'main', key: 'endpoint', type: 'text', label: 'endpoint', placeholder: 'http://127.0.0.1:8080' },
      { group: 'main', key: 'token', type: 'text', label: 'token', secret: true },
      { group: 'main', key: 'tokenFile', type: 'text', label: 'tokenFile', placeholder: '/path/to/token' },
      { group: 'advanced', key: 'requestTimeoutMs', type: 'num', min: 1000 },
      { group: 'advanced', key: 'keepaliveMs', type: 'num', min: 30000 },
      { group: 'advanced', key: 'maxSessions', type: 'num', min: 1 },
      { group: 'advanced', key: 'idleEvictMs', type: 'num', min: 60000 },
      { group: 'advanced', key: 'screenshotDir', type: 'text' },
      { group: 'advanced', key: 'debugLog', type: 'bool' },
    ]

    const vol = (v) => {
      if (v === null || typeof v !== 'object' || typeof v.get !== 'function') return v
      return v.get()
    }
    const deepVol = (v) => {
      const r = vol(v)
      if (r !== v) return r
      if (Array.isArray(r)) return r.map(deepVol)
      if (r !== null && typeof r === 'object') {
        const o = {}; for (const k of Object.keys(r)) o[k] = deepVol(r[k]); return o
      }
      return r
    }

    async function fetchStatus(probe) {
      try {
        const res = await fetch(STATUS_URL + (probe ? '?probe=1' : ''), { cache: 'no-store' })
        if (!res.ok) return { reachable: false, error: `HTTP ${res.status}` }
        return await res.json()
      } catch (e) {
        return { reachable: false, error: String(e?.message ?? e) }
      }
    }

    /** 从工具结果值里抠错误码（envelope {ok:false,error:{code}} 或嵌套 result）。 */
    function toolErrorCode(value) {
      try {
        let v = value
        if (typeof v === 'string') v = JSON.parse(v)
        const walk = (x, depth) => {
          if (depth > 4 || x === null || typeof x !== 'object') return undefined
          if (x.ok === false && x.error && typeof x.error === 'object') return x.error.code
          for (const k of ['value', 'result', 'data', 'output']) {
            const r = walk(x[k], depth + 1)
            if (r) return r
          }
          return undefined
        }
        return walk(v, 0)
      } catch { return undefined }
    }

    function makePanel(React, handle, nav) {
      const el = React.createElement
      const P = (() => { try { return require('@deepseek-ai/dsh-client-ui-primitives') } catch { return {} } })()

      const row = (label, control) => el('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, gap: 8 },
      }, el('span', { style: { flexShrink: 0 } }, label), control)

      const inputStyle = P.Input
        ? { width: 220, fontSize: 13 }
        : { width: 220, fontSize: 13, padding: '3px 8px', borderRadius: 6,
            border: '1px solid var(--dsw-alias-border-l2,#d9d9d9)',
            background: 'var(--dsw-alias-bg-layer-2,#f5f5f5)' }

      const control = (f, value, write) => {
        if (f.type === 'bool') {
          const on = !!value
          return el('label', {
            style: {
              display: 'inline-flex', alignItems: 'center', cursor: 'pointer',
              width: 32, height: 18, borderRadius: 9, position: 'relative',
              background: on ? 'var(--dsw-alias-button-primary-fill,#4a6cf7)' : 'var(--dsw-alias-border-l3,#d1d5db)',
              transition: 'background .15s', flexShrink: 0,
            },
          },
            el('input', { type: 'checkbox', checked: on, onChange: (e) => write(f.key, e.target.checked),
              style: { position: 'absolute', opacity: 0, pointerEvents: 'none' } }),
            el('span', { style: { position: 'absolute', left: on ? 16 : 2, top: 2, width: 14, height: 14,
              borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)', transition: 'left .15s' } }))
        }
        const props = {
          type: f.secret ? 'password' : (f.type === 'num' ? 'number' : 'text'),
          value: value ?? '', placeholder: f.placeholder ?? '',
          ...(f.type === 'num' ? { min: f.min } : {}),
          onChange: (e) => write(f.key, e.target.value === '' ? undefined : (f.type === 'num' ? Number(e.target.value) : e.target.value)),
          style: inputStyle,
        }
        return P.Input ? el(P.Input, props) : el('input', props)
      }

      function StatusBanner({ t }) {
        const [st, setSt] = React.useState(null) // null=未测
        const [busy, setBusy] = React.useState(false)
        React.useEffect(() => { fetchStatus(true).then(setSt) }, [])
        const test = async () => {
          setBusy(true)
          setSt(await fetchStatus(true))
          setBusy(false)
        }
        const ok = st?.reachable === true
        const color = st === null ? '#888' : ok ? '#1a7f37' : '#cf222e'
        return el('div', {
          style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12, color },
        },
          el('span', { style: { width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' } }),
          el('span', null, st === null ? t('status.unknown') : ok ? `${t('status.ok')}${st.product ? ` · ${st.product}` : ''}` : t('status.bad')),
          el('button', {
            onClick: test, disabled: busy,
            style: { marginLeft: 'auto', fontSize: 12, padding: '2px 10px', borderRadius: 6,
              border: '1px solid var(--dsw-alias-border-l2,#d9d9d9)', background: 'transparent', cursor: 'pointer' },
          }, busy ? t('testing') : t('test')))
      }

      return function ConfigPanel({ t: slotT } = {}) {
        const t = (key) => {
          try { const v = slotT?.(key); if (typeof v === 'string' && v && v !== key) return v } catch { /* */ }
          return DICT.zh[key] ?? key
        }
        const cfg = React.useSyncExternalStore(
          (cb) => handle.subscribe(cb),
          () => handle.getSnapshot(),
        )
        const data = deepVol(cfg?.value ?? cfg ?? {})
        const [status, setStatus] = React.useState('')
        const write = (path, value) => {
          try {
            handle.set(path, value)
            setStatus(t('saved'))
          } catch (e2) { setStatus(`${t('writeFail')}: ${String(e2).slice(0, 60)}`) }
        }
        const groups = {}
        for (const f of FIELDS) (groups[f.group] ??= []).push(f)
        const children = [
          el(StatusBanner, { key: 'banner', t }),
        ]
        for (const g of ['main', 'advanced']) {
          const items = groups[g] ?? []
          if (!items.length) continue
          const fields = items.map((f) => row(t(`f.${f.key}`), control(f, data[f.key], write)))
          children.push(g === 'advanced'
            ? el('details', { key: g, style: { marginBottom: 12 } },
                el('summary', { style: { cursor: 'pointer', fontWeight: 600, padding: '6px 0',
                  borderBottom: '0.5px solid var(--dsw-alias-border-l3,#ddd)' } }, t(`group.${g}`)),
                ...fields)
            : el('div', { key: g, style: { marginBottom: 12 } },
                el('div', { style: { fontWeight: 600, padding: '6px 0',
                  borderBottom: '0.5px solid var(--dsw-alias-border-l3,#ddd)' } }, t(`group.${g}`)),
                ...fields))
        }
        children.push(el('div', { key: 'status', style: { fontSize: 11, opacity: 0.6 } }, status))
        return el('div', { style: { padding: '4px 0' } }, ...children)
      }
    }

    /** 启动 toast：sessionStorage 每会话一次；探测不可达才弹。 */
    function SetupToast({ t, onDone, onOpenSettings }) {
      const [show, setShow] = React.useState(false)
      React.useEffect(() => {
        try {
          if (sessionStorage.getItem('sb-setup-toast')) return
          sessionStorage.setItem('sb-setup-toast', '1')
        } catch { /* sessionStorage 不可用仍检查一次 */ }
        fetchStatus(false).then((st) => {
          // 未配置（无 endpoint 信息）或探测不可达 → 提示；status 字段缺失时保守不弹
          if (st && (st.configured === false || st.reachable === false)) setShow(true)
        })
      }, [])
      if (!show) return null
      const P = (() => { try { return require('@deepseek-ai/dsh-client-ui-primitives') } catch { return {} } })()
      const card = el('div', {
        style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          borderRadius: 10, fontSize: 13,
          background: 'var(--dsw-alias-bg-layer-1,#fff)',
          border: '1px solid var(--dsw-alias-border-l2,#e0e0e0)',
          boxShadow: '0 4px 16px rgba(0,0,0,.12)' },
      },
        el('div', { style: { flex: 1 } },
          el('div', { style: { fontWeight: 600 } }, t('toast.title')),
          el('div', { style: { opacity: 0.75, marginTop: 2 } }, t('toast.body'))),
        el('button', {
          onClick: () => { setShow(false); onDone?.(); onOpenSettings?.() },
          style: { padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: 'var(--dsw-alias-button-primary-fill,#4a6cf7)', color: '#fff', fontSize: 13 },
        }, t('toast.action')),
        el('button', {
          onClick: () => { setShow(false); onDone?.() },
          style: { padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: 'transparent', opacity: 0.6, fontSize: 13 },
        }, t('toast.dismiss')))
      return P.Toast ? el(P.Toast, { children: card }) : card
    }

    /** tool.call.toolview 行：连接类失败 → 行内"打开设置"。 */
    function makeToolRow(React, nav, t) {
      const el = React.createElement
      return function SurfbirdToolRow(props) {
        const { toolName, block } = props ?? {}
        // 尝试从 props 各层找结果值
        const candidates = [props?.result, props?.value, props?.block?.result, props?.block?.value, block]
        let code
        for (const c of candidates) {
          code = toolErrorCode(c)
          if (code) break
        }
        const connFail = code && CONN_CODES.has(code)
        const name = toolName ?? 'surfbird_*'
        const base = el('div', {
          style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
            fontFamily: 'monospace', opacity: 0.85 },
        },
          el('span', null, name),
          connFail
            ? el('button', {
                onClick: () => nav?.openBundle?.('control-surfbird'),
                style: { fontSize: 11, padding: '1px 8px', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid #cf222e', color: '#cf222e', background: 'transparent' },
                title: code,
              }, `⚠ ${t('row.fail')} · ${t('openSettings')}`)
            : null)
        return base
      }
    }

    function apply(ctx) {
      try { ctx.locale?.register?.(ID, DICT) } catch { /* */ }
      const React = (() => { try { return require('react') } catch { return undefined } })()
      if (!React) return

      // pluginNavigation（0.2.1+）；缺失时按钮退化为无操作
      let nav
      try { nav = ctx.get?.('pluginNavigation') ?? ctx.pluginNavigation } catch { nav = undefined }
      const openSettings = () => { try { nav?.openBundle?.('control-surfbird') } catch { /* */ } }

      const t0 = (key) => DICT.zh[key] ?? key

      // ---- 配置卡 ----
      try {
        ctx.inject(['configForms'], (inner) => {
          const cf = inner.configForms
          if (!cf || typeof cf.get !== 'function' || typeof cf.whileServed !== 'function') return
          const handle = (() => { try { return cf.get(NS) } catch { return undefined } })()
          if (!handle) return
          const Panel = makePanel(React, handle, nav)
          class Boundary extends React.Component {
            constructor(p) { super(p); this.state = { err: null } }
            static getDerivedStateFromError(err) { return { err } }
            render() {
              if (this.state.err) {
                return React.createElement('div', { style: { padding: 8, fontSize: 12, color: '#c33' } },
                  `control-surfbird render error: ${String(this.state.err?.message ?? this.state.err).slice(0, 200)}`)
              }
              return React.createElement(Panel, this.props)
            }
          }
          inner.effect(() => cf.whileServed([NS], () =>
            inner.slots.inject('plugins.bundle.config', () =>
              inner.slots.register({
                name: 'plugins.bundle.config', key: ID, locale: ID, inject: () => ({}),
              }, (slotProps) => React.createElement(Boundary, slotProps)),
            )), 'control-surfbird: config card')
        })
      } catch { /* configForms 缺失 → 无设置卡 */ }

      // ---- 启动 toast ----
      try {
        ctx.inject(['slots'], (inner) => {
          const Toast = function SetupToastSlot(props) {
            return React.createElement(SetupToast, { ...props, t: t0, onDone: () => {}, onOpenSettings: openSettings })
          }
          inner.effect(() => inner.slots.inject('shell.overlay', () =>
            inner.slots.register({
              name: 'shell.overlay', id: 'control-surfbird-setup', label: 'surfbird setup',
            }, Toast)), 'control-surfbird: setup toast')
        })
      } catch { /* shell.overlay 缺失 → 无 toast */ }

      // ---- toolview 行 ----
      try {
        ctx.inject(['slots'], (inner) => {
          const Row = makeToolRow(React, nav, t0)
          const disposers = []
          for (const name of TOOL_NAMES) {
            try {
              disposers.push(inner.slots.register({
                name: 'tool.call.toolview', key: name,
              }, (props) => React.createElement(Row, { ...props, toolName: name })))
            } catch { /* 单个注册失败不影响其余 */ }
          }
          inner.effect(() => () => { for (const d of disposers) { try { d() } catch { /* */ } } },
            'control-surfbird: toolview rows')
        })
      } catch { /* toolview 槽位缺失 → 通用行 */ }
    }

    return { name: ID, inject: ['slots', 'locale'], apply }
  },
})
