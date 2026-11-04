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
  try { out = execFileSync('/usr/sbin/lsof', ['-nP', '-d', 'cwd', '-Fpn'], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }) } catch (e) { out = e.stdout ?? '' }
  let pid = 0
  for (const line of out.split('\n')) {
    if (line[0] === 'p') pid = +line.slice(1)
    if (line[0] === 'n' && (line.slice(1) === root || line.slice(1).startsWith(`${root}/`))) try { process.kill(pid, 'SIGKILL') } catch {}
  }
}

export function startAgent({ box, model, effort, budgetUsd, wallMs, transcript, extraEnv, tools = TOOLS }) {
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--model', model, '--effort', effort, '--max-budget-usd', String(budgetUsd), '--tools', tools,
    '--permission-mode', 'bypassPermissions', '--no-session-persistence', '--no-chrome', '--strict-mcp-config', '--disable-slash-commands']
  const [cmd, argv] = boxed(box, claudeBin, args)
  const child = spawn(cmd, argv, { cwd: box.app, env: env(box, extraEnv), stdio: ['pipe', 'pipe', 'pipe'], detached: true })
  const groupKill = () => { try { process.kill(-child.pid, 'SIGKILL') } catch {} }
  const log = createWriteStream(transcript)
  const events = []
  let waiter = null, stderr = '', timedOut = false, exited = false
  const timer = setTimeout(() => { timedOut = true; groupKill() }, wallMs)
  child.stderr.on('data', d => { stderr += d })
  createInterface({ input: child.stdout }).on('line', line => {
    log.write(line + '\n')
    let e
    try { e = JSON.parse(line) } catch { return }
    events.push(e)
    if (e.type === 'result' && waiter) { const w = waiter; waiter = null; w(e) }
  })
  child.on('exit', () => {
    exited = true
    clearTimeout(timer)
    if (waiter) { const w = waiter; waiter = null; w(null) }
  })
  const say = text => new Promise(ok => {
    if (exited) return ok(null)
    waiter = ok
    child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n')
  })
  const stop = () => new Promise(ok => {
    if (exited) return ok()
    child.once('exit', ok)
    child.stdin.end()
    setTimeout(groupKill, 10_000).unref()
  }).then(() => { groupKill(); sweep(box.root); log.end() })
  return { say, stop, events, status: () => ({ timedOut, exited, stderr: stderr.slice(-2000) }) }
}
