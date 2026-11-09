// Run one Codex turn and retain only bounded, structured metrics, never the transcript.
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

import { summarize } from './codex-events.mjs'

const CODEX_ARGS = [
  'exec',
  '--json',
  '--ephemeral',
  '--skip-git-repo-check',
  '--model',
  'gpt-6-luna',
  '--sandbox',
  'workspace-write',
  '-',
]

const newState = () => ({
  events: [],
  timedOut: false,
  malformed: false,
  bytes: 0,
  exitCode: null,
  spawnFailed: false,
})

function collectEvents(child, st) {
  createInterface({ input: child.stdout }).on('line', (line) => {
    st.bytes += Buffer.byteLength(line)
    if (st.bytes > 4 * 1024 * 1024) {
      st.malformed = true
      child.kill('SIGKILL')
      return
    }
    try {
      st.events.push(JSON.parse(line))
    } catch {
      st.malformed = true
    }
  })
}

function awaitExit(child, st) {
  return new Promise((resolve) => {
    child.once('error', () => {
      st.spawnFailed = true
      resolve()
    })
    child.once('close', (code) => {
      st.exitCode = code
      resolve()
    })
  })
}

/** Run an isolated, externally sandboxed Codex process. The caller owns its environment and box. */
export async function runCodex({
  command,
  prefix = [],
  cwd,
  env,
  prompt,
  timeoutMs,
  spawnProcess = spawn,
}) {
  if (!command || !cwd || !env || !Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error('Codex needs an isolated command, cwd, environment and timeout')
  const child = spawnProcess(command, [...prefix, ...CODEX_ARGS], {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const st = newState()
  const timer = setTimeout(() => {
    st.timedOut = true
    child.kill('SIGKILL')
  }, timeoutMs)
  collectEvents(child, st)
  child.stderr.resume()
  child.stdin.on('error', () => {})
  child.stdin.end(prompt)
  await awaitExit(child, st)
  clearTimeout(timer)
  const result = summarize(st.events, st.exitCode, st.timedOut)
  if (st.spawnFailed || st.malformed) {
    result.ok = false
    result.status = st.spawnFailed ? 'spawn-error' : 'malformed-events'
  }
  return result
}
