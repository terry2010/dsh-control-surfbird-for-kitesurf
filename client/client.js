/**
 * dsh-control-surfbird-for-kitesurf — web 端 client half。
 *
 * 三块职责：
 * 1. configForms 配置卡（plugins.bundle.config 槽位）：endpoint/token/tokenFile
 *    + advanced 折叠组；写 handle.set/mutate → host Config volatile 热生效。
 * 2. 设置页内状态横幅 + "测试连接"（GET /plugins/control-surfbird/status?probe=1）。
 * 3. shell.overlay 启动 toast：未配置/不可达时强提示 + 一键跳设置页
 *    （pluginNavigation.openBundle 包名，每会话一次）。
 * 4. tool.call.toolview 键控行：surfbird_* 工具失败且属连接类错误时，
 *    行内给"打开设置"按钮。
 *
 * 参考：dsh-loop-recover/client/client.js（configForms 范式）、
 * dshmarket InstallToast（shell.overlay 范式）、dsh-client-ui-tool 契约
 * （tool.call.toolview keyed slot）。手写 __ModuleLoader__，无 tsc 覆盖——
 * API 细节以真机验证为准，全部做了防御性降级。
 */
window.__ModuleLoader__.load({
  // 模块 id = 包名（dsh-client-modules 按包名注册 factory；用 cordis entry id
  // 'control-surfbird' 会与宿主插件注册冲突 → duplicate factory registration）
  id: 'dsh-control-surfbird-for-kitesurf',
  factory: (require) => {
    const ID = 'dsh-control-surfbird-for-kitesurf'   // 包名：slot key / locale / 模块 id
    const NS = 'control-surfbird'                    // configForms 命名空间 = cordis.patch.yml entry id
    const STATUS_URL = '/plugins/control-surfbird/status'
    const TOKENFILE_URL = '/plugins/control-surfbird/tokenfile'
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
        'f.endpoint': 'CDP 端点', 'f.token': '密钥', 'f.tokenFile': '密钥文件',
        'hint.tokenFile': '明文或 surfbird-v1: 机器绑定密文（surfbird-token encrypt 生成）',
        'err.unreadable': '密钥文件读取失败', 'err.empty': '密钥文件为空',
        'err.no_machine_id': '无法识别本机标识', 'err.decrypt_failed': '密钥文件解密失败（可能是别的机器生成的）',
        'browse': '选择文件…', 'import.enc': '已保存（机器绑定加密）', 'import.plain': '已保存（未加密）',
        'import.fail': '导入失败', 'import.busy': '导入中…',
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
        'hint.tokenFile': 'Plaintext or surfbird-v1: machine-bound ciphertext (surfbird-token encrypt)',
        'err.unreadable': 'token file unreadable', 'err.empty': 'token file is empty',
        'err.no_machine_id': 'machine id not detectable', 'err.decrypt_failed': 'token file decrypt failed (possibly created on another machine)',
        'browse': 'Choose file…', 'import.enc': 'Saved (machine-bound encrypted)', 'import.plain': 'Saved (unencrypted)',
        'import.fail': 'Import failed', 'import.busy': 'Importing…',
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
      { group: 'main', key: 'tokenFile', type: 'text', label: 'tokenFile', placeholder: '/path/to/token', hint: true },
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

    /** 从工具结果值里抠错误码（envelope {ok:false,error:{code}}）。
     *  block 结构不固定——全字段递归扫描（深度≤6），字符串值尝试 JSON.parse。 */
    function toolErrorCode(value) {
      const seen = new Set()
      const walk = (x, depth) => {
        if (depth > 6 || x === null || x === undefined) return undefined
        if (typeof x === 'string') {
          const t = x.trim()
          if (t.startsWith('{') || t.startsWith('[')) {
            try { return walk(JSON.parse(t), depth + 1) } catch { /* 非 JSON 文本 */ }
          }
          return undefined
        }
        if (typeof x !== 'object' || seen.has(x)) return undefined
        seen.add(x)
        if (x.ok === false && x.error && typeof x.error === 'object' && typeof x.error.code === 'string') {
          return x.error.code
        }
        for (const v of Object.values(x)) {
          const r = walk(v, depth + 1)
          if (r) return r
        }
        return undefined
      }
      return walk(value, 0)
    }

    function makePanel(React, handle, nav) {
      const el = React.createElement
      const P = (() => { try { return require('@deepseek-ai/dsh-client-ui-primitives') } catch { return {} } })()

      const row = (label, control, hint) => el('div', { style: { padding: '4px 0' } },
        el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, gap: 8 } },
          el('span', { style: { flexShrink: 0 } }, label), control),
        hint ? el('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary,#888)', paddingTop: 2 } }, hint) : null)

      const inputStyle = P.Input
        ? { width: 220, fontSize: 13 }
        : { width: 220, fontSize: 13, padding: '3px 8px', borderRadius: 6,
            border: '1px solid var(--dsw-alias-border-l2,#d9d9d9)',
            background: 'var(--dsw-alias-bg-layer-2,#f5f5f5)' }

      // 受控输入 + config 回写存在竞态：每次击键都走 handle.set→snapshot→value prop，
      // 快速输入时旧值会把 DOM 吃回去（实测连输数字出现字符错乱/变 0）。
      // 改为本地 state 即时显示 + 400ms 防抖提交；外部写入（导入回写）经 lastWrite 比对同步。
      function DebouncedInput({ f, value, write, extraStyle }) {
        const [local, setLocal] = React.useState(value ?? '')
        const timerRef = React.useRef(undefined)
        const lastWrite = React.useRef(value)
        React.useEffect(() => () => clearTimeout(timerRef.current), [])
        React.useEffect(() => {
          const ext = value ?? ''
          if (String(ext) !== String(lastWrite.current ?? '')) {
            lastWrite.current = ext
            setLocal(ext)
          }
        }, [value])
        const commit = (raw) => {
          const v = typeof raw === 'string' ? raw : String(raw ?? '')
          if (f.type === 'num') {
            if (v === '') { lastWrite.current = undefined; write(f.key, undefined); return }
            const n = Number(v)
            if (Number.isNaN(n)) return
            lastWrite.current = n
            write(f.key, n)
          } else {
            const out = v === '' ? undefined : v
            lastWrite.current = out
            write(f.key, out)
          }
        }
        const onChange = (e) => {
          const v = typeof e === 'string' ? e : e?.target?.value
          if (v === undefined) return
          setLocal(v)
          clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => commit(v), 400)
        }
        const onBlur = (e) => {
          clearTimeout(timerRef.current)
          commit(typeof e === 'string' ? e : e?.target?.value ?? local)
        }
        const props = {
          type: f.secret ? 'password' : (f.type === 'num' ? 'number' : 'text'),
          value: local, placeholder: f.placeholder ?? '',
          ...(f.type === 'num' ? { min: f.min } : {}),
          onChange, onBlur,
          style: extraStyle ? { ...inputStyle, ...extraStyle } : inputStyle,
        }
        return P.Input ? el(P.Input, props) : el('input', props)
      }

      const control = (f, value, write, extraStyle) => {
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
        return el(DebouncedInput, { f, value, write, extraStyle })
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
        // 失败原因：fetch 异常 > probeError > probeStatus > 泛化文案
        const reason = !ok && st
          ? (st.error ?? st.probeError ?? (st.probeStatus ? `HTTP ${st.probeStatus}` : null))
          : null
        return el('div', { style: { padding: '6px 0' } },
          el('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color } },
            el('span', { style: { width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' } }),
            el('span', null, st === null ? t('status.unknown') : ok ? `${t('status.ok')}${st.product ? ` · ${st.product}` : ''}` : t('status.bad')),
            st?.tokenFileError ? el('span', { style: { color: '#cf222e', fontSize: 11 } },
              t(`err.${st.tokenFileError}`) === `err.${st.tokenFileError}` ? st.tokenFileError : t(`err.${st.tokenFileError}`)) : null,
            el('button', {
              onClick: test, disabled: busy,
              style: { marginLeft: 'auto', fontSize: 12, padding: '2px 10px', borderRadius: 6,
                border: '1px solid var(--dsw-alias-border-l2,#d9d9d9)', background: 'transparent', cursor: 'pointer' },
            }, busy ? t('testing') : t('test'))),
          reason ? el('div', {
            style: { fontSize: 11, color: '#cf222e', paddingTop: 2, wordBreak: 'break-all' },
            title: String(reason),
          }, String(reason).slice(0, 160)) : null)
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
        // authMode: null=跟随配置推导（tokenFile 非空→file），否则用户显式选择
        const [authMode, setAuthMode] = React.useState(null)
        const [importNote, setImportNote] = React.useState(null) // {text, bad}
        const mode = authMode ?? (data.tokenFile ? 'file' : 'token')
        const write = (path, value) => {
          try {
            handle.set(path, value)
            setStatus(t('saved'))
          } catch (e2) { setStatus(`${t('writeFail')}: ${String(e2).slice(0, 60)}`) }
        }
        // 文件选择器 → 读内容 POST /tokenfile → host 加密落盘 ~/.dsh/surfbird-token
        // → 回写 tokenFile 路径。密文原样存；明文由 host 用本机 UUID 加密。
        const pickTokenFile = () => {
          const inp = document.createElement('input')
          inp.type = 'file'
          inp.onchange = async () => {
            const file = inp.files && inp.files[0]
            if (!file) return
            setImportNote({ text: t('import.busy'), bad: false })
            try {
              const res = await fetch(TOKENFILE_URL, {
                method: 'POST',
                headers: { 'content-type': 'text/plain', 'x-surfbird-ui': '1' },
                body: await file.text(),
              })
              const j = await res.json().catch(() => ({}))
              if (!res.ok || j.ok !== true) throw new Error(j.error || `HTTP ${res.status}`)
              write('tokenFile', j.path)
              setAuthMode('file')
              setImportNote({ text: j.encrypted ? t('import.enc') : t('import.plain'), bad: false })
            } catch (e) {
              setImportNote({ text: `${t('import.fail')}: ${String(e?.message ?? e).slice(0, 80)}`, bad: true })
            }
          }
          inp.click()
        }
        const groups = {}
        for (const f of FIELDS) (groups[f.group] ??= []).push(f)
        const children = [
          el(StatusBanner, { key: 'banner', t }),
        ]
        // 密钥/密钥文件 二选一 toggle：tokenFile 非空→file，否则 token；
        // 切回 token 会清掉 tokenFile（tokenFile 优先级更高，不清则不生效）。
        const segBtn = (modeKey, fieldKey) => el('button', {
          key: modeKey,
          onClick: () => {
            setAuthMode(modeKey)
            setImportNote(null)
            if (modeKey === 'token') write('tokenFile', undefined)
          },
          style: {
            flex: 1, fontSize: 12, padding: '5px 0', borderRadius: 6, cursor: 'pointer',
            border: '1px solid var(--dsw-alias-border-l2,#d9d9d9)',
            background: mode === modeKey ? 'var(--dsw-alias-button-primary-fill,#4a6cf7)' : 'transparent',
            color: mode === modeKey ? '#fff' : 'inherit',
          },
        }, t(`f.${fieldKey}`))
        const browseBtn = el('button', {
          onClick: pickTokenFile,
          style: { fontSize: 12, padding: '3px 10px', borderRadius: 6, whiteSpace: 'nowrap', cursor: 'pointer',
            border: '1px solid var(--dsw-alias-border-l2,#d9d9d9)', background: 'transparent' },
        }, t('browse'))
        const authSection = (() => {
          const tokenF = groups.main?.find((f) => f.key === 'token')
          const fileF = groups.main?.find((f) => f.key === 'tokenFile')
          if (!tokenF || !fileF) return null
          return el('div', { key: 'auth', style: { padding: '4px 0' } },
            el('div', { style: { display: 'flex', gap: 6, marginBottom: 2, maxWidth: 220 } }, segBtn('token', 'token'), segBtn('file', 'tokenFile')),
            mode === 'token'
              ? el('div', { style: { padding: '4px 0' } }, control(tokenF, data.token, write))
              : el('div', null,
                  el('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
                    control(fileF, data.tokenFile, write, { width: '100%', minWidth: 0, flex: 1 }), browseBtn),
                  el('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary,#888)', paddingTop: 2 } }, t('hint.tokenFile')),
                  importNote ? el('div', {
                    style: { fontSize: 11, paddingTop: 2, color: importNote.bad ? '#cf222e' : '#1a7f37' },
                  }, importNote.text) : null))
        })()
        for (const g of ['main', 'advanced']) {
          const items = groups[g] ?? []
          if (!items.length) continue
          const skip = g === 'main' ? new Set(['token', 'tokenFile']) : new Set()
          const fields = items.filter((f) => !skip.has(f.key))
            .map((f) => row(t(`f.${f.key}`), control(f, data[f.key], write), f.hint ? t(`hint.${f.key}`) : undefined))
          if (g === 'main' && authSection) fields.push(authSection)
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

    /** 启动 toast：sessionStorage 每会话一次；探测不可达才弹。React 由 apply 注入。 */
    function SetupToast(React, { t, onDone, onOpenSettings }) {
      const [show, setShow] = React.useState(false)
      React.useEffect(() => {
        try {
          if (sessionStorage.getItem('sb-setup-toast')) return
          sessionStorage.setItem('sb-setup-toast', '1')
        } catch { /* sessionStorage 不可用仍检查一次 */ }
        // 必须 probe：非探测响应不含 reachable，"已配置但端点不可达"会漏提示。
        // 服务端探活自带 3s 超时，且 sessionStorage 保证每会话至多一次。
        fetchStatus(true).then((st) => {
          // 未配置（无 endpoint 信息）或探测不可达 → 提示；status 字段缺失时保守不弹
          if (st && (st.configured === false || st.reachable === false)) setShow(true)
        })
      }, [])
      if (!show) return null
      const P = (() => { try { return require('@deepseek-ai/dsh-client-ui-primitives') } catch { return {} } })()
      // Toast 原语签名：{text, icon?, tone?, anchor?, holdMs?, actions:[{label,onClick}], onDone}
      // onDone 必填（自动消失回调）；actions 是行内按钮。自定义 children 会拿不到
      // 定位/层叠上下文，且缺 onDone 会让原语内部 c.current() 崩溃。
      if (!P.Toast) return null
      const done = () => { setShow(false); onDone?.() }
      return React.createElement(P.Toast, {
        text: `${t('toast.title')} — ${t('toast.body')}`,
        holdMs: 15000,
        actions: [
          { label: t('toast.action'), onClick: () => { done(); onOpenSettings?.() } },
          { label: t('toast.dismiss'), onClick: done },
        ],
        onDone: done,
      })
    }

    /** tool.call.toolview 行：连接类失败 → 行内"打开设置"。 */
    function makeToolRow(React, nav, t) {
      const el = React.createElement
      return function SurfbirdToolRow(props) {
        const { toolName, block } = props ?? {}
        // 递归扫描整个 props（含 block 结果节点）找 {ok:false,error:{code}}
        const code = toolErrorCode(props) ?? (block !== props?.block ? toolErrorCode(block) : undefined)
        const connFail = code && CONN_CODES.has(code)
        const name = toolName ?? 'surfbird_*'
        const base = el('div', {
          'data-surfbird-row': name,
          style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
            fontFamily: 'monospace', opacity: 0.85 },
        },
          el('span', null, name),
          connFail
            ? el('button', {
                onClick: () => nav?.openBundle?.(ID),
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

      // pluginNavigation（0.2.1+）由 plugin-manager 后激活——必须 inject 延迟等，
      // apply 时 ctx.get 多半还拿不到。缺失时按钮退化为无操作。
      let nav
      try {
        ctx.inject(['pluginNavigation'], (c) => { nav = c.pluginNavigation ?? c.get?.('pluginNavigation') })
      } catch { /* 服务缺失 → nav 保持 undefined */ }
      const openSettings = () => { try { nav?.openBundle?.(ID) } catch { /* */ } }

      // 优先宿主 locale（zh/en 字典已注册）；bind 不可用时回退固定中文
      const t0 = (() => {
        try {
          const t = ctx.locale?.bind?.(ID)
          if (typeof t === 'function') return t
        } catch { /* */ }
        return (key) => DICT.zh[key] ?? key
      })()

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
        // 绑定组件需稳定引用——内联箭头函数会让 React 每次 render 都 remount
        const BoundToast = (p) => SetupToast(React, p)
        ctx.inject(['slots'], (inner) => {
          inner.effect(() => inner.slots.inject('shell.overlay', () =>
            inner.slots.register({
              name: 'shell.overlay', id: 'control-surfbird-setup', label: 'surfbird setup',
            }, (slotProps) => React.createElement(BoundToast, { ...slotProps, t: t0, onDone: () => {}, onOpenSettings: openSettings })),
          ), 'control-surfbird: setup toast')
        })
      } catch { /* shell.overlay 缺失 → 无 toast */ }

      // ---- toolview 行 ----
      // 必须 slots.inject 等槽位就绪——直接 register 时槽位可能尚未 provide，
      // 25 个 key 会全部静默失败（每个都在 try/catch 里）。
      try {
        ctx.inject(['slots'], (inner) => {
          const Row = makeToolRow(React, nav, t0)
          inner.effect(() => inner.slots.inject('tool.call.toolview', () => {
            const disposers = []
            for (const name of TOOL_NAMES) {
              try {
                disposers.push(inner.slots.register({
                  name: 'tool.call.toolview', key: name,
                }, (props) => React.createElement(Row, { ...props, toolName: name })))
              } catch { /* 单个注册失败不影响其余 */ }
            }
            return () => { for (const d of disposers) { try { d() } catch { /* */ } } }
          }), 'control-surfbird: toolview rows')
        })
      } catch { /* toolview 槽位缺失 → 通用行 */ }
    }

    return { name: ID, inject: ['slots', 'locale'], apply }
  },
})
