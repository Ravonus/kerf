// One browser, one socket (research 45 §5). Every tab gets the same thing it always had, a duplex line of text frames,
// and only one tab, the leader, holds the WebSocket under them all. `channel.ts`, `live.ts` and `share.ts` ride it and
// know nothing about tabs: a line is a socket to them, and to the server, which gives each its own connection (mux.ts).
// That is why `id`, `exceptSelf`, `left`, `limits` and acks all mean what they did: per tab.
//
//   campaign  a Web Lock with a queue, so taking over needs no timer, and a ping for a leader that's frozen, not gone.
//   tab death each tab holds a lock of its own and the leader queues on it: it comes through however the tab went.
//   routing   frames go up one BroadcastChannel only the leader reads, and down one per tab, so a frame wakes one tab.
//   wire      `f:<line>:<text>`, a prefix and not an envelope: the frame inside is never parsed here.
//   session   a socket keeps the cookies of its upgrade, and another tab may have signed in since. A tab that didn't dial
//             asks the server who it is and compares; if they differ, the leader dials again.
//
// Without Web Locks every tab leads itself: its own socket, which is what every tab used to have.

/** Bump when a message here changes shape: tabs of two shapes share nothing, and each is its own client. */
const WIRE = 1
const NAME = `weft:link:${WIRE}`
const PING = 20_000, DEAD = 45_000, BASE = 200, CAP = 30_000, IDLE = 1000
export const BEAT = 5000
const PONG = 1500
/** The line went because the leader did: not the network's fault, so reopen at once. */
export const HANDOVER = 4900

// getRandomValues, not randomUUID: a page on plain http (a LAN address) has no randomUUID, and this runs on import.
export const tab = typeof crypto === 'undefined' ? '' : crypto.getRandomValues(new Uint32Array(1))[0]!.toString(36)
const locks = (): LockManager | undefined => (typeof navigator !== 'undefined' ? navigator.locks : undefined)
export const shareable = () => !!locks() && typeof BroadcastChannel !== 'undefined'

/** What a test reads. */
export const linkStats = { role: 'none' as 'none' | 'leader' | 'follower', steals: 0, dials: 0 }

// ---- a lock, a queue and a ping ---------------------------------------------------------------------------------------

export interface Campaign { probe(): void; stop(): void; leading(): boolean; pinged?: () => void }

/** `lead` when this tab takes the lock; `lose` when another tab takes it from under this one. */
export function campaign(name: string, won: () => void, lose: () => void, stolen?: () => void): Campaign {
  const l = locks()
  const lockName = `${name}:leader`
  let on = true, leads = false
  let release: (() => void) | undefined
  let abort: AbortController | undefined
  let waiting: ReturnType<typeof setTimeout> | undefined
  let pongAt = 0
  const hold = () => {
    leads = true
    clearTimeout(waiting) // a ping that went out before there was anyone to answer it
    waiting = undefined
    won()
  }
  if (!l || typeof BroadcastChannel === 'undefined') {
    queueMicrotask(() => { if (on) hold() })
    return { probe() {}, leading: () => leads, stop() { on = leads = false } }
  }
  const bc = new BroadcastChannel(`${name}:e`)
  const me: Campaign = {
    leading: () => leads,
    probe() {
      // Each hover asks, so a recent answer has to do: one message a second, not one a move.
      if (leads || waiting !== undefined || !on || Date.now() - pongAt < 1000) return
      bc.postMessage({ ping: tab })
      const asked = Date.now()
      waiting = setTimeout(() => {
        waiting = undefined
        // Late means this tab was the frozen one, and the answer is queued behind this timer: ask again.
        if (Date.now() - asked > PONG * 1.5) return me.probe()
        stolen?.()
        const queued = abort
        elect(true)
        queued?.abort()
      }, PONG)
    },
    stop() {
      on = false
      leads = false
      clearTimeout(waiting)
      clearInterval(timer)
      abort?.abort()
      release?.()
      bc.close()
    },
  }
  bc.onmessage = ({ data }) => {
    if (data.ping && leads) {
      bc.postMessage({ pong: data.ping })
      me.pinged?.()
    } else if (data.pong === tab) {
      pongAt = Date.now()
      clearTimeout(waiting)
      waiting = undefined
    }
  }
  function elect(steal = false) {
    const ctl = new AbortController()
    abort = ctl
    l!.request(lockName, steal ? { steal: true } : { signal: ctl.signal }, () => new Promise<void>(ok => {
      release = ok
      hold()
    })).catch(() => {
      if (!on || abort !== ctl) return // this tab left the queue on purpose
      if (leads) {
        leads = false
        lose()
      }
      elect()
    })
  }
  const timer = setInterval(() => me.probe(), BEAT)
  elect()
  return me
}

// ---- this tab's own lock ----------------------------------------------------------------------------------------------

let tabHeld = false
let tabFree: (() => void) | undefined
const whenHeld: (() => void)[] = []

/** Held before the tab says anything, so a sibling that queues on it can't read a live tab as dead. */
export function holdTab(then: () => void) {
  if (tabHeld || !locks()) return then()
  whenHeld.push(then)
  if (whenHeld.length > 1) return
  locks()!.request(`${NAME}:tab:${tab}`, () => new Promise<void>(ok => {
    tabFree = ok
    tabHeld = true
    for (const f of whenHeld.splice(0)) f()
  })).catch(() => {})
}

/** Comes through when that tab is gone, crash included. */
export function freeTab() {
  tabHeld = false
  tabFree?.()
  tabFree = undefined
}

export const whenGone = (t: string, fn: () => void) => void locks()?.request(`${NAME}:tab:${t}`, () => fn()).catch(() => {})

// ---- lines, as a tab sees them ----------------------------------------------------------------------------------------

export interface Line { send(text: string): void; close(): void }
interface Mine { id: string; hello: string; frame(text: string): void; closed(code: number, reason?: string): void }

const lines = new Map<string, Mine>()
let nth = 0

/** Sockets that never said hello in a row: the page's way to learn this host has none. */
export let socketFailures = 0
/** The one who asked goes round SSE once, and the socket gets another chance after. */
export const noSockets = () => {
  const none = socketFailures >= 2
  if (none) socketFailures = 0
  return none
}
export const probeLink = () => election?.probe()

function end(l: Mine, code: number, reason?: string) {
  lines.delete(l.id)
  l.closed(code, reason)
}
const endAll = (code: number) => { for (const l of Array.from(lines.values())) end(l, code) }

function arrive(text: string) {
  const at = text.indexOf(':', 2)
  const l = lines.get(text.slice(2, at))
  if (!l) return
  if (text[0] === 'x') {
    const split = text.indexOf(':', at + 1)
    return end(l, +text.slice(at + 1, split), text.slice(split + 1))
  }
  l.frame(text.slice(at + 1))
}

/** `c`: a socket's frames (socket.ts). `r`: realtime events, opened with a `/_weft/rt` body (hub.ts). */
export function openLine(kind: 'c' | 'r', hello: string, frame: (text: string) => void, closed: (code: number, reason?: string) => void): Line {
  start()
  const id = `${tab}.${++nth}`
  const l: Mine = { id, hello: `o:${id}:${kind}:${hello}`, frame, closed }
  lines.set(id, l)
  say(id, 'o', l.hello)
  if (!election?.leading()) election?.probe()
  return {
    send(text) { if (lines.has(id)) say(id, 'f', `f:${id}:${text}`) },
    close() {
      if (!lines.has(id)) return
      say(id, 'x', `x:${id}:`)
      end(l, 1000)
    },
  }
}

// ---- up and down the tabs ---------------------------------------------------------------------------------------------

type Up = { tab: string; id: string; k: 'o' | 'x' | 'f'; l: string }
type Note =
  | { t: 'lead' } | { t: 'lost'; code: number; never: boolean } | { t: 'who'; tab: string } | { t: 'you'; to: string; u?: string } | { t: 'redial' }
  | { t: 'bye'; tab: string }

let running = false
let notes: BroadcastChannel | undefined
let down: BroadcastChannel | undefined
let election: Campaign | undefined
/** A tab that didn't dial holds its first lines until the session is checked. */
let gate: Up[] | undefined

function say(id: string, k: Up['k'], line: string) {
  const m: Up = { tab, id, k, l: line }
  if (gate) gate.push(m)
  else if (election?.leading()) take(m)
  else if (shareable()) holdTab(() => upTo.postMessage(m))
  // else: this tab leads itself in a moment, and `lead` opens what's here
}
let upTo: BroadcastChannel

function start() {
  if (running) return
  running = true
  if (shareable()) {
    notes = new BroadcastChannel(NAME)
    notes.onmessage = e => note(e.data)
    down = new BroadcastChannel(`${NAME}:down:${tab}`)
    down.onmessage = e => arrive(e.data)
    upTo = new BroadcastChannel(`${NAME}:up`)
  }
  listen()
  election = campaign(NAME, lead, () => hangUp(HANDOVER), () => void linkStats.steals++)
  linkStats.role = 'follower'
  if (!shareable() || session) return
  gate = []
  checkSession()
}

function note(m: Note) {
  if (m.t === 'lead' && !election?.leading()) {
    linkStats.role = 'follower'
    endAll(HANDOVER)
  } else if (m.t === 'lost') {
    if (election?.leading()) return
    if (m.never) socketFailures++
    endAll(m.code)
  }
  else if (m.t === 'who') { if (election?.leading()) notes!.postMessage({ t: 'you', to: m.tab, u: open ? user : undefined }) }
  else if (m.t === 'you' && m.to === tab) theirs?.(m.u)
  else if (m.t === 'redial') { if (election?.leading() && ws) lost(ws, HANDOVER, true) }
  else if (m.t === 'bye') dropTab(m.tab)
}

let session: Promise<void> | undefined
let theirs: ((u: string | undefined) => void) | undefined

/** One round trip, once, the first time a tab that didn't dial opens a line: a new socket used to cost the same. */
function checkSession() {
  const mine = fetch('/_weft/rt', { method: 'POST', headers: { 'content-type': 'application/json', 'x-weft': '1' }, body: '{"w":1}' }).then(r => (r.ok ? r.json() : undefined)).then(r => r?.u as string | undefined).catch(() => undefined)
  const leader = new Promise<string | undefined>(ok => {
    theirs = ok
    notes!.postMessage({ t: 'who', tab })
    setTimeout(ok, 1000)
  })
  session = Promise.all([mine, leader]).then(([me, them]) => {
    theirs = undefined
    if (me !== undefined && them !== undefined && me !== them) notes!.postMessage({ t: 'redial' })
    const held = gate
    gate = undefined
    for (const m of held ?? []) holdTab(() => (election?.leading() ? take(m) : upTo.postMessage(m)))
  })
}

// ---- the leader -------------------------------------------------------------------------------------------------------

let ws: WebSocket | undefined
let open = false
let user: string | undefined
let attempt = 0
let redialed = 0
let retry: ReturnType<typeof setTimeout> | undefined
let ping: ReturnType<typeof setInterval> | undefined
let dead: ReturnType<typeof setTimeout> | undefined
let idle: ReturnType<typeof setTimeout> | undefined
const queue: string[] = []
/** Which lines each tab has open on this socket. */
const opened = new Map<string, Set<string>>()
const ears = new Map<string, BroadcastChannel>()
let upFrom: BroadcastChannel | undefined

const offline = () => ! navigator.onLine
const send = (line: string) => {
  if (open) ws!.send(line)
  else {
    queue.push(line)
    wantSocket()
  }
}

function take(m: Up) {
  let set = opened.get(m.tab)
  if (m.k === 'o') {
    if (!set) {
      opened.set(m.tab, (set = new Set()))
      if (m.tab !== tab) whenGone(m.tab, () => dropTab(m.tab))
    }
    set.add(m.id)
    clearTimeout(idle)
    idle = undefined
  } else if (m.k === 'x') set?.delete(m.id)
  // A line that closed before the socket came never has to be opened.
  if (m.k === 'x' && !open) {
    const hello = queue.findIndex(q => q.startsWith(`o:${m.id}:`))
    if (hello >= 0) queue.splice(hello, 1)
  } else send(m.l)
  if (![...opened.values()].some(s => s.size)) idle ??= setTimeout(() => {
    idle = undefined
    if (ws && ![...opened.values()].some(s => s.size)) lost(ws, 1000)
  }, IDLE)
}

function dropTab(t: string) {
  const set = opened.get(t)
  if (!set) return
  opened.delete(t)
  ears.get(t)?.close()
  ears.delete(t)
  for (const id of set) take({ tab: t, id, k: 'x', l: `x:${id}:` })
}

function arriveFrom(text: string) {
  clearTimeout(dead)
  dead = setTimeout(() => ws && lost(ws, 1006), DEAD)
  if (text === 'p') return
  if (text[0] === 'h') {
    user = text.slice(2)
    open = true
    attempt = socketFailures = 0
    for (const l of queue.splice(0)) ws!.send(l)
    return
  }
  const owner = text.slice(2, text.indexOf('.', 2))
  // The session this socket has ran out, and the cookies may have moved on: a new socket finds out, once.
  const stale = text[0] === 'x' && text.includes(':4401:') && Date.now() - redialed > 30_000
  if (stale) redialed = Date.now()
  forward(owner, text)
  if (stale && ws) lost(ws, HANDOVER, true)
}

function forward(owner: string, text: string) {
  if (owner === tab) return arrive(text)
  if (text[0] === 'x') opened.get(owner)?.delete(text.slice(2, text.indexOf(':', 2)))
  let ear = ears.get(owner)
  if (!ear) ears.set(owner, (ear = new BroadcastChannel(`${NAME}:down:${owner}`)))
  ear.postMessage(text)
}

function wantSocket() {
  if (ws || retry !== undefined || !election?.leading() || offline()) return
  if (!attempt) return dial()
  retry = setTimeout(() => {
    retry = undefined
    dial()
  }, Math.random() * Math.min(CAP, BASE * 2 ** attempt))
}

function dial() {
  if (ws || !election?.leading()) return
  linkStats.dials++
  const s = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/_weft/ws?mux=1`)
  ws = s
  s.onmessage = e => arriveFrom(e.data)
  s.onclose = () => lost(s, 1006)
  ping = setInterval(() => { if (open) s.send('p') }, PING)
  dead = setTimeout(() => lost(s, 1006), DEAD)
}

/** Not from the close event alone: offline, that can take as long as it likes, and WebKit's does. */
function lost(s: WebSocket, code: number, tell = true) {
  if (ws !== s) return
  const never = !open && code === 1006
  ws = undefined
  open = false
  user = undefined
  if (code !== HANDOVER) attempt++
  if (never) socketFailures++
  else if (code === 1006) socketFailures = 0
  s.onmessage = s.onclose = null
  s.close()
  clearInterval(ping)
  clearTimeout(dead)
  queue.length = 0
  opened.clear()
  if (tell) notes?.postMessage({ t: 'lost', code, never })
  endAll(code)
}

/** Offline, close first: a frame queued ahead of the close frame holds it back, and the server never hears. */
export function socketDown() {
  if (ws) lost(ws, 1006)
}

function hangUp(code: number) {
  clearTimeout(idle)
  clearTimeout(retry)
  idle = retry = undefined
  // Not told: whoever leads next says so, and that ends every line in one go.
  if (ws) lost(ws, code, false)
  else endAll(code)
  upFrom?.close()
  upFrom = undefined
  for (const ear of ears.values()) ear.close()
  ears.clear()
  attempt = 0
}

function lead() {
  linkStats.role = 'leader'
  if (shareable()) {
    upFrom = new BroadcastChannel(`${NAME}:up`)
    upFrom.onmessage = e => take(e.data)
    notes!.postMessage({ t: 'lead' })
  }
  // What this tab held for the session check goes straight out, and its lines were waiting on nobody.
  if (gate) {
    const held = gate
    gate = undefined
    for (const m of held) if (m) take(m)
  } else for (const l of lines.values()) take({ tab, id: l.id, k: 'o', l: l.hello })
}

// ---- the page ---------------------------------------------------------------------------------------------------------

function halt() {
  if (!running) return
  running = false
  notes?.postMessage({ t: 'bye', tab })
  election?.stop()
  election = undefined
  hangUp(1001)
  for (const bc of [notes, down, upTo]) bc?.close()
  notes = down = undefined
  freeTab()
  gate = undefined
  session = undefined
  linkStats.role = 'none'
}

let listening = false
function listen() {
  if (listening) return
  listening = true
  addEventListener('pagehide', halt)
  addEventListener('offline', socketDown)
  addEventListener('online', () => {
    clearTimeout(retry)
    retry = undefined
    attempt = 0
    if (queue.length) wantSocket()
  })
}
