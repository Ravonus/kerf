// Bound manager reconstruction/build children and retain their actual exits and complete logs.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { resources } from './profile-load-pins.mjs'

/** Kill only this step's process group; graph readers may collect up to 16 MiB of stdout. */
export async function runStep(step, log, root, signal, check = resources) {
  check(root, 512 * 1024 ** 2)
  const env = { ...(step.env ?? process.env) }
  delete env.NODE_TEST_CONTEXT
  const child = spawn(step.command, step.args, {
    cwd: step.cwd,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  })
  let problem,
    stdout = ''
  const kill = () => {
    if (!child.pid) return
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch (error) {
      if (error.code !== 'ESRCH') problem ??= error
    }
  }
  const data = (chunk, collect) => {
    try {
      log.append(step.name + '.log', chunk)
      if (collect && step.collect) {
        stdout += chunk.toString()
        assert.ok(Buffer.byteLength(stdout) < 16 * 1024 ** 2, 'Step stdout exceeds 16 MiB')
      }
    } catch (error) {
      problem = error
      kill()
    }
  }
  child.stdout.on('data', (chunk) => data(chunk, true))
  child.stderr.on('data', (chunk) => data(chunk, false))
  child.once('exit', kill)
  signal.addEventListener('abort', kill)
  if (signal.aborted) kill()
  const timer = setInterval(() => {
    try {
      check(root)
    } catch (error) {
      problem = error
      kill()
    }
  }, 1000)
  const deadline = setTimeout(() => {
    problem = new Error('Manager step timeout')
    kill()
  }, step.timeoutMs ?? 240000)
  try {
    const result = await new Promise((ok, bad) => {
      child.once('error', bad)
      child.once('close', (exit, received) =>
        ok({ name: step.name, command: step.command, args: step.args, exit, signal: received }),
      )
    })
    log.json(step.name + '-exit.json', { ...result, error: problem ? String(problem) : null })
    assert.ok(
      !problem && result.exit === 0 && result.signal === null,
      `Failed manager step: ${step.name}`,
    )
    return { ...result, stdout }
  } finally {
    clearInterval(timer)
    clearTimeout(deadline)
    signal.removeEventListener('abort', kill)
    kill()
  }
}
