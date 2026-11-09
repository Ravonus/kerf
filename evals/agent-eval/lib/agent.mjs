// One agent session: headless `claude` in a box, driven over stream-json so the same process can take a follow-up
// message without any session being written to disk. Raw events go to `transcript`; nothing is parsed for the agent.
import { execFileSync, spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { claudeBin } from './paths.mjs'
import { boxed, env } from './sandbox.mjs'
import { TOOLS } from './transcript.mjs'

/** A dev server an agent left behind would hold a port and memory through later runs. Matches only this run's box. */
export function sweep(root) {
  let out = ''
  try {
    out = execFileSync('/usr/sbin/lsof', ['-nP', '-d', 'cwd', '-Fpn'], {
      encoding: 'utf8',
      maxBuffer: 1 << 26,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch (e) {
    out = e.stdout ?? ''
  }
  let pid = 0
  for (const line of out.split('\n')) {
    if (line[0] === 'p') pid = +line.slice(1)
    if (line[0] === 'n' && (line.slice(1) === root || line.slice(1).startsWith(`${root}/`)))
      try {
        process.kill(pid, 'SIGKILL')
      } catch {}
  }
}

function spawnAgent({ box, model, effort, budgetUsd, extraEnv, tools }) {
  const args = [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--model',
    model,
    '--effort',
    effort,
    '--max-budget-usd',
    String(budgetUsd),
    '--tools',
    tools,
    '--permission-mode',
    'bypassPermissions',
    '--no-session-persistence',
    '--no-chrome',
    '--strict-mcp-config',
    '--disable-slash-commands',
  ]
  const [cmd, argv] = boxed(box, claudeBin, args)
  return spawn(cmd, argv, {
    cwd: box.app,
    env: env(box, extraEnv),
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
  })
}

const resolveWaiter = (st, e) => {
  const w = st.waiter
  if (!w) return
  st.waiter = null
  w(e)
}

function readEvents({ child, log, events, st }) {
  child.stderr.on('data', (d) => {
    st.stderr += d
  })
  createInterface({ input: child.stdout }).on('line', (line) => {
    log.write(line + '\n')
    let e
    try {
      e = JSON.parse(line)
    } catch {
      return
    }
    events.push(e)
    if (e.type === 'result') resolveWaiter(st, e)
  })
}

function controls({ child, st, log, groupKill, root }) {
  const say = (text) =>
    new Promise((ok) => {
      if (st.exited) return ok(null)
      st.waiter = ok
      child.stdin.write(
        JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n',
      )
    })
  const stop = () =>
    new Promise((ok) => {
      if (st.exited) return ok()
      child.once('exit', ok)
      child.stdin.end()
      setTimeout(groupKill, 10_000).unref()
    }).then(() => {
      groupKill()
      sweep(root)
      log.end()
    })
  const status = () => ({
    timedOut: st.timedOut,
    exited: st.exited,
    stderr: st.stderr.slice(-2000),
  })
  return { say, stop, status }
}

export function startAgent({
  box,
  model,
  effort,
  budgetUsd,
  wallMs,
  transcript,
  extraEnv,
  tools = TOOLS,
}) {
  const child = spawnAgent({ box, model, effort, budgetUsd, extraEnv, tools })
  const groupKill = () => {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {}
  }
  const log = createWriteStream(transcript)
  const events = []
  const st = { waiter: null, stderr: '', timedOut: false, exited: false }
  const timer = setTimeout(() => {
    st.timedOut = true
    groupKill()
  }, wallMs)
  readEvents({ child, log, events, st })
  child.on('exit', () => {
    st.exited = true
    clearTimeout(timer)
    resolveWaiter(st, null)
  })
  return { ...controls({ child, st, log, groupKill, root: box.root }), events }
}
