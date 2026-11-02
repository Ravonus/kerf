// `interaction({ share })` past this page (research 40 §4, §5). The only layer that knows tabs and the network, and only
// an app that shares loads it: the `weft()` plugin imports it where `share:` is used.
//
//   tabs    every tab posts its bits to one BroadcastChannel and keeps every sibling's, so there's no relay to run.
//   leader  one tab holds a Web Lock and the `$share` join, on the same socket and lifecycle as this tab's `channel`s.
//           It sends the OR of the tabs' bits, at most one frame per GAP_NET, each carrying every key that changed.
//   death   each tab holds a lock of its own and siblings queue on it: it comes through the moment the tab is gone,
//           crash included, with no heartbeat. Without Web Locks every tab is its own client and ages out by beat.
//   stall   a frozen leader keeps its lock, so a tab that gets no pong steals it. Two sockets, briefly, is the failure mode.
//   remote  other tabs, plus other clients. Cleared by a zero from the server, by a link down past GRACE, or by TTL.
//
// Everything here writes `remote` through `heard`, and only this page's three boxes come in through `set`: an echo has
// no path. A tab is a pure function of `tabs` and `clients`, and the socket a pure diff against them (`reconcile`), so a
// new leader runs the code an old one ran.

import { createRoot, effect, untrack } from 'weft'
import { NONE, seams, type Counts, type ShareLine } from 'weft/interaction'
import { connectBuiltIn, keepOpen, wakeSocket } from './channel'
import { BEAT, campaign, freeTab, holdTab, probeLink, tab, whenGone, type Campaign } from './link'

export const GAP_TAB = 16, GAP_NET = 60, TTL = 15_000, GRACE = 1500, BATCH = 400, IDLE = 5000

/** Bump when a message below changes shape: tabs of two shapes then share nothing, and each is its own client. */
const WIRE = 1
const CHANNEL = `weft:ui:${WIRE}`

type Pair = [key: string, bits: number]
type Triple = [id: string, key: string, bits: number]
type Msg =
  | { t: 'tab'; tab: string; keys: Pair[]; shown: boolean; k?: string }
  | { t: 'bits'; tab: string; e: Pair[] }
  | { t: 'shown'; tab: string; shown: boolean }
  | { t: 'net'; s: Triple[] }
  | { t: 'link'; up: boolean }
  | { t: 'roll' } | { t: 'bye'; tab: string }

interface Client { bits: number; at: number; stale?: boolean }

/** What a test reads: `role`, and how much went where. */
export const shareStats = { role: 'none' as 'none' | 'leader' | 'follower', tab, conn: undefined as string | undefined, handed: 0, steals: 0, frames: 0, keysSent: 0, bc: 0 }

const noLocks = () => typeof navigator === 'undefined' || !navigator.locks

const lines = new Map<string, (c: Counts) => void>()
const shown = new Map<string, Counts>()
/** key → bits, per tab, mine included. */
const tabs = new Map<string, Map<string, number>>()
const tabAt = new Map<string, number>()
const visible = new Map<string, boolean>()
const mine = new Map<string, number>()
const watched = new Set<string>()
const siblings = new Set<string>()
/** key → other clients. Everything the leader joined; a follower keeps what its own lines want. */
const clients = new Map<string, Map<string, Client>>()

const locks = () => !noLocks()
const leading = () => shareStats.role === 'leader'
const looking = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'

let bc: BroadcastChannel | undefined
let running = false
let lockReady = false
const early: Msg[] = []
let election: Campaign | undefined
let timer: ReturnType<typeof setInterval> | undefined

function post(m: Msg) {
  if (locks() && !lockReady) return void early.push(m)
  shareStats.bc++
  bc?.postMessage(m)
}

// ---- what a tab shows ------------------------------------------------------------------------------------------------

function render(key: string) {
  const heard = lines.get(key)
  if (!heard) return
  let hover = 0, focus = 0, pressed = 0
  const add = (bits: number) => {
    if (bits & 1) hover++
    if (bits & 2) focus++
    if (bits & 4) pressed++
  }
  for (const [t, keys] of tabs) if (t !== tab) add(keys.get(key) ?? 0)
  for (const e of clients.get(key)?.values() ?? []) add(e.bits)
  const was = shown.get(key) ?? NONE
  if (was.hover === hover && was.focus === focus && was.pressed === pressed) return
  const now = hover || focus || pressed ? { hover, focus, pressed } : NONE
  shown.set(key, now)
  heard(now)
}
const renderAll = () => { for (const k of lines.keys()) render(k) }

function dropTab(t: string) {
  visible.delete(t)
  if (!tabs.delete(t)) return
  tabAt.delete(t)
  watched.delete(t)
  renderAll()
  reconcile()
}

/** It comes through when the tab is gone, however it went. The tab held it before it first said anything. */
function watch(t: string) {
  if (t === tab || watched.has(t) || !locks()) return
  watched.add(t)
  whenGone(t, () => dropTab(t))
}

function hear(s: Triple[]) {
  const at = Date.now(), touched = new Set<string>()
  for (const [id, key, bits] of s) {
    if (siblings.has(id) || (!leading() && !lines.has(key))) continue
    let held = clients.get(key)
    if (bits) {
      if (!held) clients.set(key, (held = new Map()))
      held.set(id, { bits, at })
    } else if (!held?.delete(id)) continue
    touched.add(key)
  }
  for (const k of touched) render(k)
}

function dropClients(which: (e: Client, id: string) => boolean) {
  for (const [key, held] of clients) {
    let changed = false
    for (const [id, e] of held) if (which(e, id)) changed = held.delete(id)
    if (!held.size) clients.delete(key)
    if (changed) render(key)
  }
}

/** Down: what's held stands for GRACE, so a handover doesn't flash. Up: holders re-say, and what nobody re-says goes. */
let settling: ReturnType<typeof setTimeout> | undefined
function link(up: boolean) {
  clearTimeout(settling)
  if (up) for (const held of clients.values()) for (const e of held.values()) e.stale = true
  settling = setTimeout(() => dropClients(e => !up || !!e.stale), GRACE)
}

function receive(m: Msg) {
  if (m.t === 'tab') {
    tabs.set(m.tab, new Map(m.keys))
    tabAt.set(m.tab, Date.now())
    visible.set(m.tab, m.shown)
    if (m.k && !siblings.has(m.k)) {
      siblings.add(m.k)
      dropClients((_, id) => id === m.k)
    }
    watch(m.tab)
    renderAll()
    reconcile()
    if (m.shown) wakeIfLeading()
    // A tab that arrived late has what the socket already heard.
    if (leading()) {
      const s: Triple[] = []
      for (const [key] of m.keys) for (const [id, e] of clients.get(key) ?? []) s.push([id, key, e.bits])
      if (s.length) post({ t: 'net', s })
    }
  } else if (m.t === 'bits') {
    const keys = tabs.get(m.tab) ?? new Map<string, number>()
    tabs.set(m.tab, keys)
    tabAt.set(m.tab, Date.now())
    for (const [key, bits] of m.e) keys.set(key, bits)
    watch(m.tab)
    for (const [key] of m.e) render(key)
    reconcile()
  } else if (m.t === 'shown') {
    visible.set(m.tab, m.shown)
    if (m.shown) wakeIfLeading()
  } else if (m.t === 'roll') announce()
  else if (m.t === 'bye') dropTab(m.tab)
  else if (m.t === 'net') hear(m.s)
  else if (m.t === 'link') link(m.up)
}

const wakeIfLeading = () => { if (leading()) wakeSocket() }

function announce() { post({ t: 'tab', tab, keys: [...mine], shown: looking(), ...(locks() ? {} : { k: shareStats.conn }) }) }

/** 200 rows mounting are one post and one frame. */
let queued = false
function changedKeys() {
  if (queued) return
  queued = true
  queueMicrotask(() => {
    queued = false
    if (!running) return
    announce()
    reconcile()
  })
}

// ---- to the other tabs, once a frame ----------------------------------------------------------------------------------

const dirtyTab = new Set<string>()
let tabLast = 0
let tabTimer: ReturnType<typeof setTimeout> | undefined
function flushTab() {
  tabTimer = undefined
  tabLast = performance.now()
  if (dirtyTab.size) post({ t: 'bits', tab, e: [...dirtyTab].map(key => [key, mine.get(key) ?? 0]) })
  dirtyTab.clear()
}
function queueTab(key: string) {
  dirtyTab.add(key)
  if (tabTimer !== undefined) return
  const wait = GAP_TAB - (performance.now() - tabLast)
  if (wait <= 0) flushTab()
  else tabTimer = setTimeout(flushTab, wait)
}

// ---- the leader: the OR of every tab, on one join ---------------------------------------------------------------------

type Conn = ReturnType<typeof connectBuiltIn>
let conn: Conn | undefined
let stopConn: (() => void) | undefined
let open = false
/** key → what the server was last told. In here means asked for. */
const sent = new Map<string, number>()
const refused = new Set<string>()
const dirtyNet = new Set<string>()
const toAdd = new Set<string>()
const toDrop = new Set<string>()
let netLast = 0
let idle: ReturnType<typeof setTimeout> | undefined
let netTimer: ReturnType<typeof setTimeout> | undefined

const upstream = (key: string) => {
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

/** One frame per GAP_NET, `u` first: the bucket is 20 a second, and a frame carries every key that's waiting. */
function netTick() {
  netTimer = undefined
  if (!conn || !open) return
  let name: 'u' | 'set' | undefined, msg: unknown, size = 0
  if (toAdd.size || toDrop.size) {
    const add = [...toAdd].slice(0, BATCH), drop = [...toDrop].slice(0, BATCH - add.length)
    for (const k of add) toAdd.delete(k)
    for (const k of drop) toDrop.delete(k)
    name = 'u'
    msg = { add, drop }
    size = add.length + drop.length
  } else {
    const e: Pair[] = []
    for (const key of dirtyNet) {
      if (e.length === BATCH) break
      dirtyNet.delete(key)
      if (!sent.has(key) || refused.has(key)) continue
      const bits = upstream(key)
      // Off and on again inside the gap: nothing to say. The latest value is all that's kept.
      if (bits !== sent.get(key)) {
        sent.set(key, bits)
        e.push([key, bits])
      }
    }
    if (e.length) {
      name = 'set'
      msg = { e }
      size = e.length
    }
  }
  if (name) {
    netLast = performance.now()
    shareStats.frames++
    shareStats.keysSent += size
    conn.send(name, msg).catch(() => {}) // a dropped link re-says everything
  }
  if (toAdd.size || toDrop.size || dirtyNet.size) netSoon()
}
/** Not a timer when the gap has passed: the leader is often a hidden tab, where a timer waits a second or more. */
function netSoon() {
  const wait = GAP_NET - (performance.now() - netLast)
  if (wait > 0) {
    netTimer ??= setTimeout(netTick, wait)
    return
  }
  clearTimeout(netTimer)
  netTick()
}

/** Whatever changed in `tabs`, the socket follows. Nothing wanted for a while, no socket: a page left its rows behind. */
function reconcile() {
  if (!leading()) return
  const want = wanted()
  if (want.size) {
    clearTimeout(idle)
    idle = undefined
    dial()
  } else idle ??= setTimeout(() => {
    idle = undefined
    if (leading() && !wanted().size) hangUp()
  }, IDLE)
  if (!open) return
  for (const key of want) {
    if (sent.has(key)) {
      if (upstream(key) !== sent.get(key)) dirtyNet.add(key)
      continue
    }
    sent.set(key, 0)
    toDrop.delete(key)
    if (!refused.has(key)) toAdd.add(key)
    if (upstream(key)) dirtyNet.add(key)
  }
  for (const key of [...sent.keys()]) {
    if (want.has(key)) continue
    sent.delete(key)
    dirtyNet.delete(key)
    clients.delete(key)
    if (!toAdd.delete(key)) toDrop.add(key)
  }
  if (toAdd.size || toDrop.size || dirtyNet.size) netSoon()
}

function linked(up: boolean) {
  if (up === open) return
  open = up
  if (!up) {
    sent.clear()
    toAdd.clear()
    toDrop.clear()
    dirtyNet.clear()
    refused.clear()
    clearTimeout(netTimer)
    netTimer = undefined
  }
  link(up)
  post({ t: 'link', up })
  if (up) reconcile()
}

function dial() {
  if (conn) return
  stopConn = createRoot(dispose => {
    conn = connectBuiltIn('$share')
    conn.on('b', ({ s }: { s: Triple[] }) => {
      hear(s)
      if (locks()) post({ t: 'net', s })
    })
    conn.on('ok', (m: { id: string; no: string[] }) => {
      shareStats.conn = m.id
      const lost: Triple[] = []
      for (const k of m.no) {
        refused.add(k)
        dirtyNet.delete(k)
        for (const id of clients.get(k)?.keys() ?? []) lost.push([id, k, 0])
      }
      if (lost.length) {
        hear(lost)
        if (locks()) post({ t: 'net', s: lost })
      }
      if (!locks()) announce()
    })
    effect(() => conn!.status.value, s => linked(s === 'open'))
    return dispose
  }, null)
}

function hangUp() {
  linked(false)
  stopConn?.()
  stopConn = conn = undefined
  shareStats.conn = undefined
}

function lead() {
  shareStats.role = 'leader'
  shareStats.handed++
  link(false)
  post({ t: 'link', up: false })
  post({ t: 'roll' })
  reconcile()
}

// ---- the page --------------------------------------------------------------------------------------------------------

function up() {
  if (running) return
  running = true
  bc = new BroadcastChannel(CHANNEL)
  bc.onmessage = e => receive(e.data)
  tabs.set(tab, mine)
  holdTab(() => {
    lockReady = true
    for (const m of early.splice(0)) post(m)
  })
  shareStats.role = 'follower'
  election = campaign(CHANNEL, lead, () => {
    hangUp()
    shareStats.role = 'follower'
  }, () => void shareStats.steals++)
  election.pinged = sayHeld // a hidden leader's own beat is throttled; a sibling's ping isn't
  announce()
  post({ t: 'roll' })
  timer = setInterval(beat, BEAT)
}

function beat() {
  const now = Date.now()
  dropClients(e => now - e.at > TTL)
  if (!locks()) {
    announce()
    for (const [t, at] of tabAt) if (now - at > TTL) dropTab(t)
  }
  if (leading()) sayHeld()
}

/** A held bit is said again, so that if this instance's server dies, peers age it out. Nothing held, nothing sent. */
let saidAt = 0
function sayHeld() {
  if (Date.now() - saidAt < BEAT - 1000) return
  saidAt = Date.now()
  for (const [key, bits] of sent) if (bits) {
    sent.set(key, -1)
    dirtyNet.add(key)
  }
  if (dirtyNet.size) netSoon()
}

function halt() {
  if (!running) return
  post({ t: 'bye', tab })
  running = false
  lockReady = false
  hangUp()
  shareStats.role = 'none'
  clearInterval(timer)
  clearTimeout(settling)
  clearTimeout(idle)
  idle = undefined
  election?.stop()
  election = undefined
  freeTab()
  bc?.close()
  bc = undefined
  tabs.clear()
  tabAt.clear()
  visible.clear()
  watched.clear()
  clients.clear()
}

if (typeof window !== 'undefined') {
  addEventListener('pagehide', halt)
  addEventListener('pageshow', e => {
    if (!(e as PageTransitionEvent).persisted || !lines.size) return
    up()
    renderAll()
  })
  document.addEventListener('visibilitychange', () => { if (running) post({ t: 'shown', tab, shown: looking() }) })
  keepOpen.stay = () => [...visible.values()].some(Boolean)
}

seams.line = (key, heard): ShareLine => {
  lines.set(key, heard)
  mine.set(key, 0)
  if (!running) up()
  changedKeys()
  untrack(() => render(key))
  return {
    set(bits) {
      mine.set(key, bits)
      queueTab(key)
      if (!running) return
      reconcile()
      if (bits && !leading()) {
        election?.probe()
        probeLink()
      }
    },
    leave() {
      lines.delete(key)
      shown.delete(key)
      mine.delete(key)
      dirtyTab.delete(key)
      if (!running) return
      if (!leading()) clients.delete(key)
      changedKeys()
    },
  }
}
