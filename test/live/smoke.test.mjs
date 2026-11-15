// Live smoke: real Kitesurf engine over SSH tunnel.
// env: SURFBIRD_URL=http://127.0.0.1:18080 SURFBIRD_TOKEN=your-token
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SessionBrowser } from '../../src/cdp/session.ts'
import { snapshot } from '../../src/cdp/snapshot.ts'
import { waitFor } from '../../src/cdp/wait.ts'
import { click, fill } from '../../src/cdp/input.ts'

const URL = process.env.SURFBIRD_URL ?? process.env.KITESURF_URL
const TOKEN = process.env.SURFBIRD_TOKEN ?? process.env.KITESURF_TOKEN
const opts = { endpoint: URL, token: TOKEN, requestTimeoutMs: 30000, keepaliveMs: 0 }

test('live smoke: connect→navigate→snapshot→evaluate→screenshot', { timeout: 120000 }, async (t) => {
  if (!URL) return t.skip('SURFBIRD_URL not set')
  const sess = new SessionBrowser('smoke', opts)
  t.after(() => sess.disconnect())

  // status/connect
  const tabs = await sess.listTabs()
  assert.ok(Array.isArray(tabs), 'listTabs')

  // new tab + navigate example.com
  const tab = await sess.newTab('https://example.com')
  assert.ok(tab.targetId, 'newTab targetId')
  await waitFor(sess, { state: 'load', timeoutMs: 30000 })

  // evaluate
  const title = await sess.evaluate(await sess.resolveTab(), 'document.title')
  assert.match(String(title), /Example/i)

  // snapshot（example.com 的标题是 SVG 不是 h1——只断言标题/链接/文本）
  const snap = await snapshot(sess, {})
  assert.match(snap.text, /# Example Domain\s+https:\/\/example\.com/)
  assert.match(snap.text, /\[e\d+\] link "Learn more"/)
  assert.ok(snap.refs >= 1, `refs=${snap.refs}`)
  assert.ok(snap.docToken.includes('#'))

  // navigate to a form page via setDocumentContent (hermetic)
  const r = await sess.resolveTab()
  await sess.cdp('Page.setDocumentContent', {
    frameId: (await sess.cdp('Page.getFrameTree', {}, { sessionId: r.sessionId })).frameTree.frame.id,
    html: `<!doctype html><html><body><h1>Test Form</h1><input id="q" type="text" placeholder="Search"><button id="b">Go</button><a href="/next">Next</a><script>window.__clicked=0;document.getElementById('b').onclick=()=>{window.__clicked++;document.title='Clicked'}</script></body></html>`,
  }, { sessionId: r.sessionId })
  await waitFor(sess, { state: 'load', timeoutMs: 10000 })

  const snap2 = await snapshot(sess, {})
  assert.match(snap2.text, /Test Form/)
  assert.match(snap2.text, /\[e\d+\] button "Go"/)
  assert.match(snap2.text, /\[e\d+\] link "Next"/)
  assert.match(snap2.text, /textbox "Search"/)

  // fill + click + verify（refs 是计数；eN 从 text 正则取）
  const btnId = Number(/\[e(\d+)\] button "Go"/.exec(snap2.text)?.[1])
  const inId = Number(/\[e(\d+)\] textbox "Search"/.exec(snap2.text)?.[1])
  assert.ok(btnId > 0 && inId > 0, `refs btn=${btnId} in=${inId}`)

  const fr = await sess.resolveTab()
  const fillRes = await fill(sess, fr, { ref: inId }, 'hello surfbird')
  assert.equal(fillRes.changed, true, `fill: ${JSON.stringify(fillRes)}`)

  await click(sess, fr, { ref: btnId })
  await waitFor(sess, { state: 'url', url: 'example.com', timeoutMs: 5000 }).catch(() => undefined)
  await new Promise((r2) => setTimeout(r2, 800))
  const clicked = await sess.evaluate(fr, 'window.__clicked')
  assert.equal(clicked, 1, `__clicked=${clicked}`)

  // console capture
  await sess.evaluate(fr, 'console.log("smoke-marker-123")')
  await new Promise((r2) => setTimeout(r2, 300))
  const buf = sess.buffersFor(fr.sessionId)
  const con = buf?.console.read({})
  assert.ok(con?.entries.some((e) => e.text.includes('smoke-marker-123')), 'console captured')

  // screenshot
  const shot = await sess.cdp('Page.captureScreenshot', { format: 'png' }, { sessionId: fr.sessionId })
  assert.ok(typeof shot.data === 'string' && shot.data.length > 1000, 'screenshot data')
  assert.equal(shot.error, undefined, `screenshot error: ${shot.error}`)

  // pdf
  const pdf = await sess.cdp('Page.printToPDF', {}, { sessionId: fr.sessionId })
  assert.ok(typeof pdf.data === 'string' && pdf.data.length > 100, 'pdf data')
  assert.equal(pdf.error, undefined, `pdf error: ${pdf.error}`)

  console.log('SMOKE OK — tabs:', tabs.length, 'refs:', snap2.refs)
})
