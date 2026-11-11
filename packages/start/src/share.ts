// `interaction({ share })` past this page (research 45 §4, §5). The only layer that knows tabs and the network, and only
// an app that shares loads it: the `kerf()` plugin imports it where `share:` is used.
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

import { tabQueue } from './share/tab-queue'
import { network, upstream as upstreamOf, wanted as wantedKeys } from './share/network'
import { receiver } from './share/receive'
import { render, renderAll, hear, dropClients } from './share/display'
import { createRoot, effect, untrack } from '@kerf-js/core'
import { seams, type ShareLine } from '@kerf-js/core/interaction'
import { connectBuiltIn, keepOpen, wakeSocket } from './channel'
import {
  lines,
  shown,
  tabs,
  tabAt,
  visible,
  mine,
  watched,
  clients,
  type Triple,
  type Msg,
} from './share/state'
import { BEAT, campaign, freeTab, holdTab, probeLink, tab, whenGone, type Campaign } from './link'

/** Ms between flushes to the other tabs. */
export const GAP_TAB = 16
/** Ms between flushes to the server. */
export const GAP_NET = 60
/** Ms a held key stands without being said again. */
export const TTL = 15_000
/** Ms what's held stands after the link drops, so a handover doesn't flash. */
export const GRACE = 1500
/** Entries one frame carries. */
export const BATCH = 400
/** Ms without a change before the socket may close. */
export const IDLE = 5000

/** Bump when a message below changes shape: tabs of two shapes then share nothing, and each is its own client. */
const WIRE = 1
const CHANNEL = `kerf:ui:${WIRE}`

/** What a test reads: `role`, and how much went where. */
export const shareStats = {
  role: 'none' as 'none' | 'leader' | 'follower',
  tab,
  conn: undefined as string | undefined,
  handed: 0,
  steals: 0,
  frames: 0,
  keysSent: 0,
  bc: 0,
}

const noLocks = () => typeof navigator === 'undefined' || !navigator.locks

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

/** Down: what's held stands for GRACE, so a handover doesn't flash. Up: holders re-say, and what nobody re-says goes. */
let settling: ReturnType<typeof setTimeout> | undefined
function link(on: boolean) {
  clearTimeout(settling)
  if (on) for (const held of clients.values()) for (const e of held.values()) e.stale = true
  settling = setTimeout(() => dropClients((e) => !on || !!e.stale), GRACE)
}

const wakeIfLeading = () => {
  if (leading()) wakeSocket()
}

function announce() {
  post({
    t: 'tab',
    tab,
    keys: [...mine],
    shown: looking(),
    ...(locks() ? {} : { k: shareStats.conn }),
  })
}

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
const queueTab = tabQueue(dirtyTab, mine, post, tab, GAP_TAB)

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
let idle: ReturnType<typeof setTimeout> | undefined

const upstream = (key: string) => upstreamOf(key, locks())
const wanted = () => wantedKeys(locks())

const net = network({
  connection: () => conn,
  isOpen: () => open,
  sent,
  refused,
  dirtyNet,
  toAdd,
  toDrop,
  upstream,
  shareStats,
  GAP_NET,
  BATCH,
})
const netSoon = net.netSoon

/** Whatever changed in `tabs`, the socket follows. Nothing wanted for a while, no socket: a page left its rows behind. */
function reconcile() {
  if (!leading()) return
  const want = wanted()
  if (want.size) {
    clearTimeout(idle)
    idle = undefined
    dial()
  } else
    idle ??= setTimeout(() => {
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
  for (const key of Array.from(sent.keys())) {
    if (want.has(key)) continue
    sent.delete(key)
    dirtyNet.delete(key)
    clients.delete(key)
    if (!toAdd.delete(key)) toDrop.add(key)
  }
  if (toAdd.size || toDrop.size || dirtyNet.size) netSoon()
}

function linked(live: boolean) {
  if (live === open) return
  open = live
  if (!live) {
    sent.clear()
    toAdd.clear()
    toDrop.clear()
    dirtyNet.clear()
    refused.clear()
    net.clear()
  }
  link(live)
  post({ t: 'link', up: live })
  if (live) reconcile()
}

function dial() {
  if (conn) return
  stopConn = createRoot((dispose) => {
    conn = connectBuiltIn('$share')
    conn.on('b', ({ s }: { s: Triple[] }) => {
      hear(s, leading())
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
        hear(lost, leading())
        if (locks()) post({ t: 'net', s: lost })
      }
      if (!locks()) announce()
    })
    effect(
      () => conn!.status.value,
      (s) => linked(s === 'open'),
    )
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
  bc.onmessage = (e) => receive(e.data)
  tabs.set(tab, mine)
  holdTab(() => {
    lockReady = true
    for (const m of early.splice(0)) post(m)
  })
  shareStats.role = 'follower'
  election = campaign(
    CHANNEL,
    lead,
    () => {
      hangUp()
      shareStats.role = 'follower'
    },
    () => void shareStats.steals++,
  )
  election.pinged = sayHeld // a hidden leader's own beat is throttled; a sibling's ping isn't
  announce()
  post({ t: 'roll' })
  timer = setInterval(beat, BEAT)
}

function beat() {
  const now = Date.now()
  dropClients((e) => now - e.at > TTL)
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
  for (const [key, bits] of sent)
    if (bits) {
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

const receive = receiver({
  dropClients,
  watch,
  reconcile,
  wakeIfLeading,
  leading,
  post,
  announce,
  dropTab,
  link,
})

if (typeof window !== 'undefined') {
  addEventListener('pagehide', halt)
  addEventListener('pageshow', (e) => {
    if (!e.persisted || !lines.size) return
    up()
    renderAll()
  })
  document.addEventListener('visibilitychange', () => {
    if (running) post({ t: 'shown', tab, shown: looking() })
  })
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
