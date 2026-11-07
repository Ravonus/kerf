/** Bump when a message here changes shape: tabs of two shapes share nothing, and each is its own client. */
const WIRE = 1
export const NAME = `weft:link:${WIRE}`
export const BEAT = 5000
const PONG = 1500
// getRandomValues, not randomUUID: a page on plain http (a LAN address) has no randomUUID, and this runs on import.
export const tab =
  typeof crypto === 'undefined' ? '' : crypto.getRandomValues(new Uint32Array(1))[0]!.toString(36)
const locks = (): LockManager | undefined =>
  typeof navigator !== 'undefined' ? navigator.locks : undefined
export const shareable = () => !!locks() && typeof BroadcastChannel !== 'undefined'

// ---- a lock, a queue and a ping ---------------------------------------------------------------------------------------

export interface Campaign {
  probe(): void
  stop(): void
  leading(): boolean
  pinged?: () => void
}

/** `lead` when this tab takes the lock; `lose` when another tab takes it from under this one. */
export function campaign(
  name: string,
  won: () => void,
  lose: () => void,
  stolen?: () => void,
): Campaign {
  const l = locks()
  const lockName = `${name}:leader`
  const state: ElectionState = { on: true, leads: false, waiting: undefined }
  const hold = () => {
    state.leads = true
    clearTimeout(state.waiting) // a ping that went out before there was anyone to answer it
    state.waiting = undefined
    won()
  }
  if (!l || typeof BroadcastChannel === 'undefined') {
    queueMicrotask(() => {
      if (state.on) hold()
    })
    return {
      probe() {},
      leading: () => state.leads,
      stop() {
        state.on = state.leads = false
      },
    }
  }
  return queuedCampaign(name, lockName, l, state, hold, lose, stolen)
}

interface ElectionState {
  on: boolean
  leads: boolean
  waiting: ReturnType<typeof setTimeout> | undefined
}

function queuedCampaign(
  name: string,
  lockName: string,
  l: LockManager,
  state: ElectionState,
  hold: () => void,
  lose: () => void,
  stolen?: () => void,
): Campaign {
  let release: (() => void) | undefined
  let abort: AbortController | undefined
  let pongAt = 0
  const bc = new BroadcastChannel(`${name}:e`)
  const me: Campaign = {
    leading: () => state.leads,
    probe() {
      // Each hover asks, so a recent answer has to do: one message a second, not one a move.
      if (state.leads || state.waiting !== undefined || !state.on || Date.now() - pongAt < 1000)
        return
      bc.postMessage({ ping: tab })
      const asked = Date.now()
      state.waiting = setTimeout(() => {
        state.waiting = undefined
        // Late means this tab was frozen, and the answer is queued behind this timer: ask again.
        if (Date.now() - asked > PONG * 1.5) return me.probe()
        stolen?.()
        const queued = abort
        elect(true)
        queued?.abort()
      }, PONG)
    },
    stop() {
      state.on = false
      state.leads = false
      clearTimeout(state.waiting)
      clearInterval(timer)
      abort?.abort()
      release?.()
      bc.close()
    },
  }
  bc.onmessage = ({ data }) => {
    if (data.ping && state.leads) {
      bc.postMessage({ pong: data.ping })
      me.pinged?.()
    } else if (data.pong === tab) {
      pongAt = Date.now()
      clearTimeout(state.waiting)
      state.waiting = undefined
    }
  }
  function elect(steal = false) {
    const ctl = new AbortController()
    abort = ctl
    l.request(
      lockName,
      steal ? { steal: true } : { signal: ctl.signal },
      // A grant that comes after stop() (a steal can't be aborted) is handed straight back.
      () =>
        state.on
          ? new Promise<void>((ok) => {
              release = ok
              hold()
            })
          : undefined,
    ).catch(() => {
      if (!state.on || abort !== ctl) return // this tab left the queue on purpose
      if (state.leads) {
        state.leads = false
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
  locks()!
    .request(
      `${NAME}:tab:${tab}`,
      () =>
        new Promise<void>((ok) => {
          tabFree = ok
          tabHeld = true
          for (const f of whenHeld.splice(0)) f()
        }),
    )
    .catch(() => {})
}

/** Comes through when that tab is gone, crash included. */
export function freeTab() {
  tabHeld = false
  tabFree?.()
  tabFree = undefined
}

export const whenGone = (t: string, fn: () => void) =>
  void locks()
    ?.request(`${NAME}:tab:${t}`, () => fn())
    .catch(() => {})
