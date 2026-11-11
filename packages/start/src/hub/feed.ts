import { createFeed, functionHost, type Feed, type Probe, type Source } from '../changes'
import { StartError } from '../data'
import { defaultStore } from '../exec'
import type { Channel, Conn, HubOptions, Limits, LiveState } from './types'

const proc = globalThis as unknown as {
  process?: { env: Record<string, string | undefined>; exit(code: number): void }
}
const unref = <T>(t: T) => ((t as { unref?(): void } | null | undefined)?.unref?.(), t)
interface FeedState {
  options: HubOptions
  limits: Limits
  conns: Map<string, Conn>
  pokes: () => Channel
  source: Source | undefined
  live: LiveState
  refused: StartError | undefined
  feed: Feed | undefined
  probed: Promise<unknown>
  waking: Promise<unknown> | undefined
  resting: ReturnType<typeof setTimeout> | undefined
  beats: ReturnType<typeof setInterval> | undefined
  beat: number
}
function report(state: FeedState, code: string, severity: string, message: string) {
  state.options.onDiagnostic?.({ code, severity, message })
}
function wire(state: FeedState) {
  return { m: state.live.mode, ...(state.live.down && { d: 1 }) }
}
function status(state: FeedState, down: string | undefined) {
  if (state.live.down === down) return
  state.live = { ...state.live, down }
  if (down) report(state, 'R016', 'warning', `live: ${down}`)
  for (const c of state.conns.values()) c.sink.write('L', JSON.stringify(wire(state)))
}

/** Probes rather than assumes (`what works here`), says what it found once, and refuses to serve what was required. */
async function settle(state: FeedState, src: Source) {
  const { options } = state
  const host = functionHost()
  const how: Probe = src.external
    ? { mode: 'feed', via: 'listener' }
    : host
      ? {
          mode: 'off',
          via: 'none',
          why: `${host} ends a process with its request, so nothing can hold a database connection`,
          fix: "run `kerf db listen` on an always-on host and set `listener: 'external'`, or deploy to a server preset",
        }
      : await src.probe().catch((e) => ({
          mode: 'off' as const,
          via: 'none',
          why: e instanceof Error ? e.message : String(e),
          fix: 'check the database',
        }))
  state.live = {
    mode: src.external ? 'external' : how.mode,
    via: how.via,
    why: how.why,
    fix: how.fix,
  }
  const line = `live: ${state.live.mode} (${state.live.via})${how.why ? `: ${how.why}` : ''}`
  if (how.mode === 'feed') console.info(`kerf ${line}`)
  else {
    console.warn(`kerf ${line}${how.fix ? `\n  fix: ${how.fix}` : ''}`)
    report(state, 'R016', 'warning', `${line}. \`.live()\` shows \`degraded\``)
  }
  if (how.mode === 'feed' || !options.required?.length) return how
  state.refused = new StartError(
    'R015',
    `${options.required.map((n) => `\`${n}\``).join(', ')} require${options.required.length > 1 ? '' : 's'} a live feed, and this server has ${how.mode === 'poll' ? 'only polling' : 'none'}${how.why ? `: ${how.why}` : ''}`,
    how.fix ?? 'see `kerf doctor`',
    { status: 503 },
  )
  console.error(`kerf ${state.refused.message}`)
  if (!options.dev) proc.process?.exit(1)
  return how
}

/** The feed runs while someone can use it: a server with no clients holds no listener and runs no watcher. */
function want(state: FeedState) {
  const { source, limits, pokes } = state
  clearTimeout(state.resting)
  state.resting = undefined
  if (!source) return
  if (source.external) {
    if (state.beats) return
    state.beat = Date.now()
    void pokes()
    state.beats = unref(
      setInterval(() => {
        if (Date.now() - state.beat > limits.window / 2)
          status(state, 'the external listener has gone quiet')
      }, limits.heartbeat / 2),
    )
    return
  }
  return (state.waking ??= state.probed
    .then((how) => state.feed!.start(how as Probe))
    .catch((e) => status(state, e instanceof Error ? e.message : String(e)))
    .finally(() => {
      state.waking = undefined
    }))
}

function rest(state: FeedState) {
  const { source, conns, feed, limits } = state
  if (!source || conns.size || state.resting || !feed?.running) return
  state.resting = unref(
    setTimeout(() => {
      state.resting = undefined
      if (!conns.size) void feed.stop()
    }, limits.window),
  )
}

export function createFeedState(
  options: HubOptions,
  limits: Limits,
  conns: Map<string, Conn>,
  pokes: () => Channel,
) {
  const source = options.changes
  const state: FeedState = {
    options,
    limits,
    conns,
    pokes,
    source,
    live: source
      ? { mode: 'off', via: 'none', why: 'not probed yet' }
      : { mode: 'app', via: 'mutations' },
    refused: undefined,
    feed: undefined,
    probed: Promise.resolve(),
    waking: undefined,
    resting: undefined,
    beats: undefined,
    beat: 0,
  }
  state.feed =
    source &&
    createFeed(source, {
      emit: (p) => pokes().got(JSON.stringify(p)),
      bump: (tags) => void (options.store ?? defaultStore).bump(tags),
      status: (down) => status(state, down),
    })
  state.probed = source && !proc.process?.env.KERF_BUILD ? settle(state, source) : Promise.resolve()
  state.probed.catch(() => {})
  return {
    want: () => want(state),
    rest: () => rest(state),
    wire: () => wire(state),
    heartbeat: () => {
      state.beat = Date.now()
      status(state, undefined)
    },
    live: () => state.live,
    refused: () => state.refused,
    probed: state.probed,
    feed: state.feed,
    clear: () => {
      clearTimeout(state.resting)
      clearInterval(state.beats)
    },
  }
}
