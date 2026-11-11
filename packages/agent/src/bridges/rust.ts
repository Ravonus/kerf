// The Rust bridge: the Technomancy AI Bridge daemon on your own machine answers, through the claude and codex CLIs
// signed in there. The app holds a job queue at `/_weft/x/agent/bridges/<id>/jobs`, and the daemon long-polls it from
// outside, so the machine never listens publicly and the app can be anywhere. The daemon meters and caps spend per
// site and per person; the agent loop here runs the tools, with the same grants as every other bridge.
//
//   # bridge.toml on the machine with the CLIs
//   [[server]]
//   name = "shop"
//   url = "https://shop.example"
//   token = "<technomancy-bridge token>"       # also AGENT_BRIDGE_TOKEN on the app
//   queues = ["/_weft/x/agent/bridges/rust/jobs"]
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { transcript, type Bridge, type BridgeStep, type BridgeTurn } from '../bridge'
import type { ToolInfo } from '../index'

/** How the app reaches the daemon. */
export interface RustBridgeOptions {
  /** The shared bearer token. Default `AGENT_BRIDGE_TOKEN`; at least 32 characters. */
  token?: string
  /** The model id the daemon routes on: `claude` (default) is Claude first, `terra`/`sol`/`luna` Codex first. */
  model?: string
  /** How long a step waits for the daemon. Default 3 minutes. */
  timeoutMs?: number
  id?: string
  label?: string
}

/** A job as the daemon takes it. */
interface Job {
  id: string
  modelId: string
  prompt: string
  principal: string
}

/** What the daemon posts back. */
interface Done {
  text?: string
  error?: string
  tokens?: { input?: number; output?: number; backend?: string }
}

interface Queue {
  waiting: Map<string, { job: Job; done(r: Done): void }>
  ready: string[]
  pollers: ((job: Job | null) => void)[]
  seen: number
}

// One queue per bridge id for the process: it survives a dev reload, so the poller and the turn meet
const g = globalThis as { __weftRustBridge?: Map<string, Queue> }
const queues = (g.__weftRustBridge ??= new Map())
const queueOf = (id: string) => {
  let q = queues.get(id)
  if (!q) queues.set(id, (q = { waiting: new Map(), ready: [], pollers: [], seen: 0 }))
  return q
}

const same = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

const PROTOCOL = `Reply with exactly one JSON object and nothing else:
{"say": "what you tell the owner", "calls": [{"tool": "name", "input": {}}]}
Call only the tools listed above, with input matching its schema. After they run you get their results and answer again.
Leave "calls" empty when you're done. Use no tools of your own: these are the only way to see or change the site.`

const toolLine = (t: ToolInfo) =>
  `- ${t.name}${t.confirm ? ' (the owner approves each call)' : ''}: ${t.description}\n  input: ${JSON.stringify(t.input)}`

/** Everything the CLI on the other end needs in one prompt: it keeps no session. */
export function promptFor(turn: BridgeTurn): string {
  const tools = turn.tools.length ? turn.tools.map(toolLine).join('\n') : '(none)'
  return `${turn.system}\n\nTools:\n${tools}\n\n${PROTOCOL}\n\nThe conversation so far:\n\n${transcript(turn.messages)}`
}

let n = 0

/** The answer's JSON, wherever the CLI put it; plain words when there is none. */
export function readAnswer(text: string): Pick<BridgeStep, 'text' | 'calls'> {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  try {
    const out = JSON.parse(text.slice(start, end + 1)) as { say?: unknown; calls?: unknown }
    const calls = Array.isArray(out.calls) ? out.calls : []
    return {
      text: typeof out.say === 'string' ? out.say : '',
      calls: calls.flatMap((c: { tool?: unknown; input?: unknown }) =>
        typeof c?.tool === 'string'
          ? [{ id: `rust-${Date.now().toString(36)}-${++n}`, tool: c.tool, input: c.input ?? {} }]
          : [],
      ),
    }
  } catch {
    return { text: text.trim(), calls: [] }
  }
}

function enqueue(q: Queue, job: Job, signal: AbortSignal, ms: number) {
  return new Promise<Done>((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer)
      q.waiting.delete(job.id)
      q.ready = q.ready.filter((x) => x !== job.id)
    }
    const timer = setTimeout(() => {
      finish()
      reject(new Error(`The bridge didn't answer in ${Math.round(ms / 1000)}s`))
    }, ms)
    signal.addEventListener('abort', () => (finish(), reject(signal.reason)), { once: true })
    q.waiting.set(job.id, { job, done: (r) => (finish(), resolve(r)) })
    const poller = q.pollers.shift()
    if (poller) poller(job)
    else q.ready.push(job.id)
  })
}

function take(q: Queue, waitMs: number) {
  q.seen = Date.now()
  const id = q.ready.shift()
  const job = id && q.waiting.get(id)?.job
  if (job) return Promise.resolve(job)
  return new Promise<Job | null>((resolve) => {
    const poller = (j: Job | null) => (clearTimeout(timer), resolve(j))
    const timer = setTimeout(() => {
      q.pollers = q.pollers.filter((p) => p !== poller)
      resolve(null)
    }, waitMs)
    q.pollers.push(poller)
  })
}

/** The daemon's side: `GET jobs?wait=25` takes a job (204 when quiet), `POST jobs/<id>/result` answers it. */
async function serve(q: Queue, token: string | undefined, request: Request, path: string) {
  const presented = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!token || token.length < 32 || !same(presented, token))
    return Response.json({ error: 'Invalid bridge token' }, { status: 401 })
  if (path === 'jobs' && request.method === 'GET') {
    const wait = Number(new URL(request.url).searchParams.get('wait') ?? 25)
    const job = await take(q, Math.min(30, Math.max(0, wait || 0)) * 1000)
    return job ? Response.json({ job }) : new Response(null, { status: 204 })
  }
  const done = /^jobs\/([\w-]+)\/result$/.exec(path)
  if (done && request.method === 'POST') {
    q.seen = Date.now()
    const body = (await request.json().catch(() => null)) as Done | null
    const entry = q.waiting.get(done[1]!)
    entry?.done(body ?? { error: 'The bridge sent an empty answer' })
    return Response.json({ ok: true, accepted: !!entry })
  }
  return new Response('Not found', { status: 404 })
}

/** The Technomancy AI Bridge daemon as a bridge: available while it is polling (seen in the last 90 seconds). */
export function rustBridge(options: RustBridgeOptions = {}): Bridge {
  const id = options.id ?? 'rust'
  const q = queueOf(id)
  const token = () => options.token ?? process.env.AGENT_BRIDGE_TOKEN?.trim()
  return {
    id,
    label: options.label ?? 'Claude through the bridge',
    tools: 'native',
    available: () => !!token() && Date.now() - q.seen < 90_000,
    serve: (request, path) => serve(q, token(), request, path),
    async step(turn) {
      const job = {
        id: randomUUID(),
        modelId: options.model ?? 'claude',
        prompt: promptFor(turn),
        principal: turn.who,
      }
      const done = await enqueue(q, job, turn.signal, options.timeoutMs ?? 180_000)
      if (done.error !== undefined) throw new Error(`The bridge: ${done.error}`)
      const answer = readAnswer(done.text ?? '')
      if (answer.text) turn.text(answer.text)
      return {
        ...answer,
        usage: {
          model: done.tokens?.backend ?? job.modelId,
          input: done.tokens?.input ?? 0,
          output: done.tokens?.output ?? 0,
        },
      }
    },
  }
}
