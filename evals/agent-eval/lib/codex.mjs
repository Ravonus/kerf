// Run one Codex turn and retain only bounded, structured metrics, never the transcript.
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

import { summarize } from './codex-events.mjs'

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
  const args = [
    ...prefix,
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
  const child = spawnProcess(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
  const events = []
  let timedOut = false
  let malformed = false
  let bytes = 0
  const timer = setTimeout(() => {
    timedOut = true
    child.kill('SIGKILL')
  }, timeoutMs)
  const lines = createInterface({ input: child.stdout })
  lines.on('line', (line) => {
    bytes += Buffer.byteLength(line)
    if (bytes > 4 * 1024 * 1024) {
      malformed = true
      child.kill('SIGKILL')
      return
    }
    try {
      events.push(JSON.parse(line))
    } catch {
      malformed = true
    }
  })
  child.stderr.resume()
  child.stdin.on('error', () => {})
  child.stdin.end(prompt)
  let exitCode = null,
    spawnFailed = false
  await new Promise((resolve) => {
    child.once('error', () => {
      spawnFailed = true
      resolve()
    })
    child.once('close', (code) => {
      exitCode = code
      resolve()
    })
  })
  clearTimeout(timer)
  const result = summarize(events, exitCode, timedOut)
  if (spawnFailed || malformed) {
    result.ok = false
    result.status = spawnFailed ? 'spawn-error' : 'malformed-events'
  }
  return result
}
