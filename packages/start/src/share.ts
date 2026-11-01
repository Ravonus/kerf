// PROTOTYPE (research 40 §5): `share`'s tabs and socket, the only layer that knows the network. Importing this module
// is what turns `interaction({ share })` from same-page into same-browser and cross-client.
//
//   tabs    every tab posts its bits to one BroadcastChannel and keeps every sibling's, so there is no relay to run.
//   leader  one tab holds a Web Lock and the socket. It ORs the tabs' bits, sends them, and posts what it hears.
//   death   each tab also holds a lock of its own, and siblings queue on it: it comes through the moment the tab is gone,
//           crash included, with no heartbeat. Without Web Locks a tab has its own socket, and tabs age out by beat.
//   stall   a frozen leader doesn't lose its lock, so a tab that gets no pong steals it.
//   remote  each key's other clients, cleared by `gone`, by a socket down past GRACE, or after TTL with no beat.

import { seams, type Counts, type ShareLine } from 'weft/interaction'

export const GAP_TAB = 16, GAP_NET = 60, BEAT = 5000, TTL = 15_000, GRACE = 1500, PONG = 1500
const BASE = 200, CAP = 5000, PING = 20_000

export interface ShareConfig {
  /** The `channel` spreading `shareRoom`. Built in, in the spec. */
  channel: { $id: string }
  /** Tabs of another build share nothing: another lock, another channel, another socket. */
  build?: string
  /** Each new tab takes the socket. */
  newest?: boolean
}

type Msg =
  | { t: 'tab'; tab: string; keys: [string, number][]; k?: string } | { t: 'bits'; tab: string; key: string; bits: number } | { t: 'roll' } | { t: 'bye'; tab: string }
  | { t: 'client'; key: string; id: string; bits: number } | { t: 'gone'; id: string } | { t: 'link'; up: boolean }
  | { t: 'ping'; tab: string } | { t: 'pong'; to: string }

interface Line { key: string; heard: (c: Counts) => void; clients: Map<string, { bits: number; at: number; stale?: boolean }> }

let cfg: ShareConfig | undefined
export const configureShare = (c: ShareConfig) => void (cfg = c)

const lines = new Map<string, Line>()
/** key → bits, per tab. Mine included. */
const tabs = new Map<string, Map<string, number>>()
const tabAt = new Map<string, number>()
const mine = new Map<string, number>()
const watched = new Set<string>()
const siblings = new Set<string>()
const tab = typeof crypto === 'undefined' ? '' : crypto.randomUUID().slice(0, 8)

export const stats = { role: 'none' as 'none' | 'leader' | 'follower', tab, conn: undefined as string | undefined, opened: 0, sent: 0, received: 0, bc: 0, handed: 0, steals: 0 }

let bc: BroadcastChannel | undefined
let running = false
let lockReady = false
const early: Msg[] = []
let release: (() => void) | undefined
let abort: AbortController | undefined
let tabRelease: (() => void) | undefined
let timer: ReturnType<typeof setInterval> | undefined

const locks = () => (typeof navigator !== 'undefined' ? (navigator as any).locks : undefined)
const names = () => ({ channel: `weft:ui:${cfg?.build ?? ''}`, leader: `weft:ui:leader:${cfg?.build ?? ''}`, tab: (t: string) => `weft:ui:tab:${cfg?.build ?? ''}:${t}` })

function post(m: Msg) {
  if (locks() && !lockReady) return void early.push(m)
  stats.bc++
  bc?.postMessage(m)
}

// ---- what a tab shows ------------------------------------------------------------------------------------------------

function render(key: string) {
  const l = lines.get(key)
  if (!l) return
  const c = { hover: 0, focus: 0, pressed: 0 }
  const add = (bits: number) => { if (bits & 1) c.hover++; if (bits & 2) c.focus++; if (bits & 4) c.pressed++ }
  for (const [t, keys] of tabs) if (t !== tab) add(keys.get(key) ?? 0)
  for (const e of l.clients.values()) add(e.bits)
  l.heard(c)
}
const renderAll = () => { for (const k of lines.keys()) render(k) }

function dropTab(t: string) {
  if (!tabs.delete(t)) return
  tabAt.delete(t)
  watched.delete(t)
  renderAll()
  reconcile()
}

/** The lock comes through when the tab is gone, however it went. It was held before the tab first said anything. */
function watch(t: string) {
  if (t === tab || watched.has(t) || !locks()) return
  watched.add(t)
  locks().request(names().tab(t), () => dropTab(t)).catch(() => {})
}

function clientSaid(key: string, id: string, bits: number) {
  if (siblings.has(id)) return
  const l = lines.get(key)
  if (!l) return
  if (bits) l.clients.set(id, { bits, at: Date.now() })
  else if (!l.clients.delete(id)) return
  render(key)
}

function clientGone(id: string) {
  for (const l of lines.values()) if (l.clients.delete(id)) render(l.key)
}

/** The socket went or came back. Down: what's held stands for GRACE, so a handover doesn't flash. Up: it must be re-said. */
let down: ReturnType<typeof setTimeout> | undefined
function link(up: boolean) {
  clearTimeout(down)
  if (!up) {
    down = setTimeout(() => { for (const l of lines.values()) { l.clients.clear(); render(l.key) } }, GRACE)
    return
  }
  for (const l of lines.values()) for (const e of l.clients.values()) e.stale = true
  down = setTimeout(() => {
    for (const l of lines.values()) {
      let changed = false
      for (const [id, e] of l.clients) if (e.stale) changed = l.clients.delete(id)
      if (changed) render(l.key)
    }
  }, GRACE)
}

function receive(m: Msg) {
  if (m.t === 'tab') {
    tabs.set(m.tab, new Map(m.keys))
    tabAt.set(m.tab, Date.now())
    if (m.k && siblings.add(m.k)) clientGone(m.k)
    watch(m.tab)
    renderAll()
    reconcile()
  } else if (m.t === 'bits') {
    const keys = tabs.get(m.tab) ?? new Map()
    tabs.set(m.tab, keys)
    tabAt.set(m.tab, Date.now())
    keys.set(m.key, m.bits)
    watch(m.tab)
    render(m.key)
    reconcile()
  } else if (m.t === 'roll') announce()
  else if (m.t === 'bye') dropTab(m.tab)
  else if (m.t === 'client') clientSaid(m.key, m.id, m.bits)
  else if (m.t === 'gone') clientGone(m.id)
  else if (m.t === 'link') link(m.up)
  else if (m.t === 'ping') { if (stats.role === 'leader') post({ t: 'pong', to: m.tab }) }
  else if (m.t === 'pong' && m.to === tab) { clearTimeout(waiting); waiting = undefined }
}

function announce() { post({ t: 'tab', tab, keys: [...mine], ...(locks() ? {} : { k: stats.conn }) }) }

// ---- sending to tabs, once a frame ------------------------------------------------------------------------------------

const dirtyTab = new Set<string>()
let tabLast = 0
let tabTimer: ReturnType<typeof setTimeout> | undefined
function flushTab() {
  tabTimer = undefined
  tabLast = performance.now()
  for (const key of dirtyTab) post({ t: 'bits', tab, key, bits: mine.get(key) ?? 0 })
  dirtyTab.clear()
}
function queueTab(key: string) {
  dirtyTab.add(key)
  if (tabTimer !== undefined) return
  const wait = GAP_TAB - (performance.now() - tabLast)
  if (wait <= 0) flushTab()
  else tabTimer = setTimeout(flushTab, wait)
}

// ---- the leader: one socket, the OR of every tab ----------------------------------------------------------------------

let ws: WebSocket | undefined
let attempt = 0
let retry: ReturnType<typeof setTimeout> | undefined
let ping: ReturnType<typeof setInterval> | undefined
let nth = 0, ack = 0
const joins = new Map<string, { n: number; joined: boolean; sent: number; refused?: boolean }>()
const byN = new Map<number, string>()
const dirtyNet = new Set<string>()
const queue: string[] = []
let netLast = 0
let netTimer: ReturnType<typeof setTimeout> | undefined

const leading = () => stats.role === 'leader'

function netTick() {
  netTimer = undefined
  if (!ws || ws.readyState !== 1) return
  let frame = queue.shift()
  if (!frame) {
    const key = dirtyNet.values().next().value as string | undefined
    if (key !== undefined) {
      dirtyNet.delete(key)
      const j = joins.get(key)
      if (j?.joined) {
        j.sent = upstream(key)
        frame = JSON.stringify(['m', j.n, ++ack, 'set', { bits: j.sent }])
      }
    }
  }
  if (frame) {
    netLast = performance.now()
    stats.sent++
    ws.send(frame)
  }
  if (queue.length || dirtyNet.size) netSoon()
}
function netSoon() {
  if (netTimer !== undefined) return
  netTimer = setTimeout(netTick, Math.max(0, GAP_NET - (performance.now() - netLast)))
}
function frameOut(f: unknown[]) { queue.push(JSON.stringify(f)); netSoon() }

function upstream(key: string) {
  if (!locks()) return mine.get(key) ?? 0
  let bits = 0
  for (const keys of tabs.values()) bits |= keys.get(key) ?? 0
  return bits
}

function wanted() {
  if (!locks()) return new Set(mine.keys())
  const out = new Set<string>()
  for (const keys of tabs.values()) for (const k of keys.keys()) out.add(k)
  return out
}

/** Whatever changed in `tabs`, the socket follows: a pure diff, so a new leader runs the same code as an old one. */
function reconcile() {
  if (!leading() || !ws || ws.readyState !== 1 || !stats.conn) return
  const want = wanted()
  for (const key of want) {
    if (joins.has(key)) continue
    const n = ++nth
    joins.set(key, { n, joined: false, sent: 0 })
    byN.set(n, key)
    frameOut(['j', n, cfg!.channel.$id, { key }])
  }
  for (const [key, j] of joins) {
    if (want.has(key)) {
      if (j.joined && upstream(key) !== j.sent) { dirtyNet.add(key); netSoon() }
      continue
    }
    joins.delete(key)
    byN.delete(j.n)
    dirtyNet.delete(key)
    if (j.joined) frameOut(['l', j.n])
  }
}

function onFrame(d: any[]) {
  stats.received++
  if (d[0] === 'h') {
    stats.conn = d[1].k
    attempt = 0
    if (!locks()) announce()
    link(true)
    post({ t: 'link', up: true })
    post({ t: 'roll' })
    reconcile()
    return
  }
  const key = byN.get(d[1])
  if (key === undefined) return
  const j = joins.get(key)!
  if (d[0] === 'j') {
    j.joined = true
    frameOut(['m', j.n, ++ack, 'ask', {}])
    reconcile()
  } else if (d[0] === 'e') j.refused = true
  else if (d[0] === 'm') {
    const [name, msg] = [d[3], d[4]]
    if (name === 'state') { clientSaid(key, msg.id, msg.bits); if (locks()) post({ t: 'client', key, id: msg.id, bits: msg.bits }) }
    else if (name === 'gone') { clientGone(msg.id); if (locks()) post({ t: 'gone', id: msg.id }) }
    else if (name === 'ask' && j.sent) frameOut(['m', j.n, ++ack, 'answer', { to: msg.id, bits: j.sent }])
  }
}

function connect() {
  if (!leading() || ws || navigator.onLine === false) return // `online` calls this
  stats.opened++
  const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/_weft/ws`)
  ws = socket
  socket.onmessage = e => onFrame(JSON.parse(e.data))
  socket.onclose = () => lost(socket)
  ping = setInterval(() => { if (socket.readyState === 1) socket.send('["p"]') }, PING)
}

/** Not from `close()`: offline, a socket's close event can take as long as it likes. */
function lost(socket: WebSocket) {
  if (ws !== socket) return
  ws = undefined
  socket.close()
  closed()
  link(false)
  post({ t: 'link', up: false })
  if (leading()) retry = setTimeout(connect, Math.random() * Math.min(CAP, BASE * 2 ** attempt++))
}

function closed() {
  clearInterval(ping)
  clearTimeout(netTimer)
  netTimer = undefined
  joins.clear()
  byN.clear()
  dirtyNet.clear()
  queue.length = 0
  stats.conn = undefined
}

function hangUp() {
  clearTimeout(retry)
  const socket = ws
  ws = undefined
  closed()
  socket?.close()
}

function lead() {
  stats.role = 'leader'
  stats.handed++
  link(false)
  post({ t: 'link', up: false })
  post({ t: 'roll' })
  connect()
}

function elect(steal = false) {
  const l = locks()
  if (!l) return lead()
  stats.role = 'follower'
  const ctl = new AbortController()
  abort = ctl
  l.request(names().leader, steal ? { steal: true } : { signal: ctl.signal }, () => new Promise<void>(ok => {
    release = ok
    lead()
  })).catch(() => {
    if (!running || abort !== ctl) return // ours gave up the queue on purpose
    if (leading()) { hangUp(); stats.role = 'follower' } // stolen
    elect()
  })
}

/** A frozen leader keeps its lock and answers nobody. */
let waiting: ReturnType<typeof setTimeout> | undefined
function probe() {
  if (!locks() || leading() || waiting !== undefined || !running) return
  post({ t: 'ping', tab })
  waiting = setTimeout(() => {
    waiting = undefined
    stats.steals++
    const queued = abort
    elect(true)
    queued?.abort()
  }, PONG)
}

// ---- the page --------------------------------------------------------------------------------------------------------

function up() {
  if (running || !cfg) return
  running = true
  const n = names()
  bc = new BroadcastChannel(n.channel)
  bc.onmessage = e => receive(e.data)
  tabs.set(tab, mine)
  const l = locks()
  if (l) {
    l.request(n.tab(tab), () => new Promise<void>(ok => {
      tabRelease = ok
      lockReady = true
      for (const m of early.splice(0)) post(m)
    })).catch(() => {})
  }
  elect(cfg.newest)
  announce()
  post({ t: 'roll' })
  timer = setInterval(beat, BEAT)
}

function beat() {
  const now = Date.now()
  for (const l of lines.values()) {
    let changed = false
    for (const [id, e] of l.clients) if (now - e.at > TTL) changed = l.clients.delete(id)
    if (changed) render(l.key)
  }
  if (!locks()) {
    announce()
    for (const [t, at] of tabAt) if (now - at > TTL) dropTab(t)
  }
  if (leading()) { for (const [key, j] of joins) if (j.sent) { dirtyNet.add(key); netSoon() } }
  else probe()
}

function halt() {
  if (!running) return
  post({ t: 'bye', tab })
  running = false
  lockReady = false
  hangUp()
  stats.role = 'none'
  clearInterval(timer)
  clearTimeout(waiting)
  waiting = undefined
  abort?.abort()
  release?.()
  tabRelease?.()
  bc?.close()
  bc = undefined
  tabs.clear()
  tabAt.clear()
  watched.clear()
  for (const l of lines.values()) l.clients.clear()
}

if (typeof window !== 'undefined') {
  addEventListener('pagehide', halt)
  addEventListener('pageshow', e => { if ((e as PageTransitionEvent).persisted) { up(); renderAll() } })
  addEventListener('offline', () => { if (ws) lost(ws) })
  addEventListener('online', () => { if (leading() && !ws) { clearTimeout(retry); connect() } })
}

seams.line = (key, heard): ShareLine => {
  const l: Line = { key, heard, clients: new Map() }
  lines.set(key, l)
  mine.set(key, 0)
  if (!running) up()
  else announce()
  renderAll()
  reconcile()
  return {
    set(bits) {
      mine.set(key, bits)
      queueTab(key)
      reconcile()
      if (bits && !leading()) probe()
    },
    leave() {
      lines.delete(key)
      mine.delete(key)
      dirtyTab.delete(key)
      announce()
      reconcile()
    },
  }
}
