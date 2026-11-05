import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { fail, sleep } from './utils.mjs'

/**
 * axe-core is what Lighthouse runs for Accessibility and for Agentic Browsing's accessibility tree: the WCAG 2 A and AA
 * rules, and the best-practice ones Lighthouse also grades. `region` (all content in landmarks) Lighthouse leaves out.
 */
const AXE = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  rules: {
    'heading-order': { enabled: true },
    'empty-heading': { enabled: true },
    tabindex: { enabled: true },
    'duplicate-id-aria': { enabled: true },
    'image-redundant-alt': { enabled: true },
    'skip-link': { enabled: true },
    'landmark-one-main': { enabled: true },
    list: { enabled: true },
    listitem: { enabled: true },
    region: { enabled: false },
  },
  resultTypes: ['violations'],
}
/** axe rules with a code of their own; every other violation is L004, with the rule's id. */
const RULES = {
  ...Object.fromEntries(
    [
      'button-name',
      'link-name',
      'input-button-name',
      'label',
      'select-name',
      'aria-command-name',
      'aria-input-field-name',
      'aria-toggle-field-name',
      'aria-progressbar-name',
      'aria-meter-name',
      'aria-tooltip-name',
      'aria-treeitem-name',
      'aria-dialog-name',
      'frame-title',
      'summary-name',
    ].map((r) => [r, 'L001']),
  ),
  ...Object.fromEntries(
    ['image-alt', 'role-img-alt', 'svg-img-alt', 'input-image-alt', 'object-alt', 'area-alt'].map(
      (r) => [r, 'L002'],
    ),
  ),
  'color-contrast': 'L003',
}
let axe
const axeSource = () =>
  (axe ??= readFileSync(fileURLToPath(import.meta.resolve('axe-core/axe.min.js')), 'utf8'))
/** The issue types Lighthouse's `inspector-issues` audit counts (low contrast is axe's, as L003). */
const ISSUES = new Set([
  'MixedContentIssue',
  'CookieIssue',
  'BlockedByResponseIssue',
  'HeavyAdIssue',
  'ContentSecurityPolicyIssue',
  'SharedArrayBufferIssue',
  'CorsIssue',
  'AttributionReportingIssue',
  'QuirksModeIssue',
  'FederatedAuthRequestIssue',
  'BounceTrackingIssue',
  'StylesheetLoadingIssue',
])

/** In the page: how far the layout moved without a person asking (CLS, summed), and the first elements that moved. */
const SHIFT = `new Promise(ok => {
  let cls = 0
  const moved = []
  new PerformanceObserver(list => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue
      cls += e.value
      for (const s of e.sources ?? []) {
        if (!s.node || s.node.nodeType !== 1 || moved.length === 3) continue
        const open = s.node.outerHTML.slice(0, s.node.outerHTML.indexOf('>') + 1)
        moved.push(open.length > 120 ? open.slice(0, 117) + '…>' : open)
      }
    }
  }).observe({ type: 'layout-shift', buffered: true })
  setTimeout(() => ok({ cls: Math.round(cls * 1000) / 1000, moved }), 50)
})`

/** In the page: what a crawler reads from the head, and what pokes past a phone's right edge. */
const HEAD = `(() => {
  const meta = n => document.querySelector('meta[name="' + n + '"]')?.getAttribute('content')?.trim() ?? null
  const wide = []
  const edge = innerWidth + 1
  if (document.documentElement.scrollWidth > edge) {
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.right > edge && r.width > 0 && getComputedStyle(el).position !== 'fixed' && !(el.parentElement && el.parentElement.getBoundingClientRect().right > edge)) {
        const open = el.outerHTML.slice(0, el.outerHTML.indexOf('>') + 1)
        wide.push(open.length > 120 ? open.slice(0, 117) + '…>' : open)
        if (wide.length === 3) break
      }
    }
  }
  return {
    title: document.title.trim(), lang: document.documentElement.getAttribute('lang') ?? '', description: meta('description'),
    viewport: meta('viewport'), robots: meta('robots'), scroll: document.documentElement.scrollWidth - innerWidth, wide,
    icon: !!document.querySelector('link[rel~="icon"]'),
  }
})()`

function listenPage(browser, sessionId, found, statics, served, loaded, document) {
  const where = (u, line) =>
    u
      ? `${u.replace(/^https?:\/\/127\.0\.0\.1:\d+/, '')}${line === undefined ? '' : `:${line + 1}`}`
      : ''
  const off = browser.on((m) => {
    if (m.sessionId !== sessionId) return
    const p = m.params
    if (m.method === 'Page.loadEventFired') loaded()
    else if (m.method === 'Network.responseReceived' && p.type === 'Document' && !document.value)
      document.value = p.response
    else if (m.method === 'Runtime.exceptionThrown') {
      const d = p.exceptionDetails
      found.push({
        code: 'L010',
        key: d.exception?.description?.split('\n')[0] ?? d.text,
        at: where(d.url, d.lineNumber),
        text: d.exception?.description?.split('\n')[0] ?? d.text,
      })
    } else if (
      m.method === 'Runtime.consoleAPICalled' &&
      (p.type === 'error' || p.type === 'assert')
    ) {
      const text = p.args
        .map((a) => a.value ?? a.description ?? '')
        .join(' ')
        .split('\n')[0]
      const top = p.stackTrace?.callFrames?.[0]
      found.push({ code: 'L010', key: text, at: where(top?.url, top?.lineNumber), text })
    } else if (m.method === 'Log.entryAdded' && p.entry.level === 'error') {
      // a build's pages served as files have no server: its realtime and function routes answer 404 here and nowhere else
      if (statics && /\/_weft\/(rt|ws|fn|data|m|x)\b/.test(`${p.entry.url ?? ''} ${p.entry.text}`))
        return
      if (
        statics &&
        p.entry.url &&
        /status of 404/.test(p.entry.text) &&
        served(new URL(p.entry.url).pathname)
      )
        return
      // the favicon: Chrome asks for it lazily, once a session, so the head probe asks instead (below)
      if ((p.entry.url ?? '').endsWith('/favicon.ico')) return
      found.push({
        code: 'L011',
        key: `${p.entry.url ?? ''} ${p.entry.text}`,
        at: where(p.entry.url),
        text: p.entry.text,
      })
    } else if (m.method === 'Audits.issueAdded') {
      const { code, details } = p.issue
      if (code === 'DeprecationIssue') {
        const d = details.deprecationIssueDetails
        found.push({
          code: 'L012',
          key: d.type,
          at: where(d.sourceCodeLocation?.url, d.sourceCodeLocation?.lineNumber),
          text: d.type,
        })
      } else if (ISSUES.has(code))
        found.push({
          code: 'L013',
          key: code,
          text: code.replace(/Issue$/, '').replace(/([a-z])([A-Z])/g, '$1 $2'),
        })
    }
  })
  return off
}

async function inspectHead(send, document, f, found) {
  if (document.value && document.value.status >= 400)
    found.push({
      code: 'L025',
      key: String(document.value.status),
      text: `HTTP ${document.value.status}`,
    })
  const header = Object.entries(document.value?.headers ?? {}).find(
    ([k]) => k.toLowerCase() === 'x-robots-tag',
  )?.[1]
  const head = (await send('Runtime.evaluate', { expression: HEAD, returnByValue: true })).result
    .value
  if (!head.icon) {
    const status = (
      await send('Runtime.evaluate', {
        expression: `fetch('/favicon.ico', { method: 'HEAD' }).then(r => r.status, () => 0)`,
        awaitPromise: true,
        returnByValue: true,
      })
    ).result.value
    if (status >= 400)
      found.push({ code: 'L011', key: 'favicon', at: '/favicon.ico', text: `HTTP ${status}` })
  }
  if (!head.title) found.push({ code: 'L020', key: 'title' })
  if (!head.description) found.push({ code: 'L021', key: 'description' })
  if (!head.lang) found.push({ code: 'L022', key: 'lang' })
  if (!head.viewport || !/width=device-width/.test(head.viewport))
    found.push({ code: 'L023', key: 'viewport' })
  const noindex = [
    header && /noindex|none/i.test(header) && `the \`x-robots-tag: ${header}\` header`,
    head.robots &&
      /noindex|none/i.test(head.robots) &&
      `<meta name="robots" content="${head.robots}">`,
  ].filter(Boolean)
  if (noindex.length)
    found.push({
      code: 'L024',
      key: noindex.join(),
      text: noindex.join(' and '),
      header: !!header,
    })
  if (f.mobile && head.scroll > 0)
    found.push({
      code: 'L030',
      key: head.wide.join() || 'page',
      text: `${head.scroll}px`,
      wide: head.wide,
    })
}

async function inspectAxe(send, url, found) {
  await send('Runtime.evaluate', { expression: axeSource() })
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression: `axe.run(document, ${JSON.stringify(AXE)}).then(r => r.violations)`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (exceptionDetails)
    throw fail(
      'E_AUDIT',
      `axe-core failed on ${url}: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`,
    )
  for (const v of result.value) {
    for (const n of v.nodes) {
      const tag = n.html.slice(0, n.html.indexOf('>') + 1)
      found.push({
        code: RULES[v.id] ?? 'L004',
        key: `${v.id} ${n.target.join(' ')}`,
        rule: v.id,
        help: v.help,
        fix: n.failureSummary
          ?.replace(/^Fix (any|all) of the following:\s*/, '')
          .split('\n')[0]
          .trim(),
        selector: n.target.join(' '),
        tag: tag.length > 160 ? `${tag.slice(0, 157)}…>` : tag,
        contrast: v.id === 'color-contrast' ? n.any[0]?.data : undefined,
      })
    }
  }
}

/** Audit one page in one form factor: what Chrome said while it loaded, its head, its layout, and axe-core's rules. */
export async function auditPage(browser, url, form, statics, served, forms) {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true })
  const send = (m, p) => browser.send(m, p, sessionId)
  const found = []
  const document = { value: null }
  let loaded
  const load = new Promise((ok) => {
    loaded = ok
  })
  const off = listenPage(browser, sessionId, found, statics, served, loaded, document)

  try {
    const f = forms[form]
    await Promise.all(
      ['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable', 'Audits.enable'].map((m) =>
        send(m),
      ),
    )
    await send('Emulation.setDeviceMetricsOverride', {
      width: f.width,
      height: f.height,
      deviceScaleFactor: f.deviceScaleFactor,
      mobile: f.mobile,
    })
    await send('Emulation.setTouchEmulationEnabled', {
      enabled: f.mobile,
      maxTouchPoints: f.mobile ? 5 : 1,
    })
    await send('Page.navigate', { url })
    await Promise.race([load, sleep(15_000)])
    await sleep(800) // hydration's errors, and a font swap's shift, land after load
    await inspectHead(send, document, f, found)
    const shift = (
      await send('Runtime.evaluate', { expression: SHIFT, awaitPromise: true, returnByValue: true })
    ).result.value
    if (shift.cls > 0.05)
      found.push({
        code: 'L031',
        key: shift.moved.join() || 'page',
        cls: shift.cls,
        moved: shift.moved,
      })
    await inspectAxe(send, url, found)
    return found
  } finally {
    off()
    await browser.send('Target.closeTarget', { targetId }).catch(() => {})
  }
}
