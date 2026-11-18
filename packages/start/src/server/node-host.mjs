import { writeSync } from 'node:fs'
import { diagnosticLine } from './log-line.mjs'
import { shutdownKey } from './shutdown.mjs'

function timeout(name) {
  const seconds = Number(process.env[name])
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : 5000
}

function report(code, stage, error, format) {
  const reference = [...crypto.getRandomValues(new Uint8Array(12))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  let detail = 'Unknown error'
  try {
    const text = error instanceof Error ? (error.stack ?? error.message) : String(error)
    if (typeof text === 'string') detail = text
  } catch {
    // Even a thrown value with a broken formatter must lead to exit.
  }
  const line = diagnosticLine(
    { code, severity: 'fatal', reference, message: `${stage}: ${detail.slice(0, 6000)}` },
    format,
  )
  try {
    writeSync(2, line + '\n')
  } catch {
    // Stderr may be unavailable. The process still must exit.
  }
}

function stopProcess(state, code, rollback) {
  if (state.stopping) return
  state.stopping = true
  const steps = rollback ? [...state.steps].reverse() : [...state.steps]
  const pending = new Set(steps)
  const deadline = setTimeout(() => {
    const names = [...pending].map(([name]) => name).join(', ')
    report('E_SHUTDOWN', names || 'stderr flush', 'Shutdown timed out', state.format)
    process.exit(code || 1)
  }, timeout('SERVER_SHUTDOWN_TIMEOUT'))
  const settled = steps.map(async (step) => {
    const [name, stop] = step
    try {
      await stop()
    } catch (error) {
      code ||= 1
      report('E_SHUTDOWN', name, error, state.format)
    } finally {
      pending.delete(step)
    }
  })
  void Promise.all(settled).then(() => {
    process.stderr.write('', (error) => {
      clearTimeout(deadline)
      if (error) report('E_SHUTDOWN', 'stderr flush', error, state.format)
      process.exit(error ? code || 1 : code)
    })
  })
}

/** Own Node startup and process exit before importing any application modules. */
export async function runNodeHost(prepare, format) {
  if (globalThis[shutdownKey]) throw new Error('Kerf Node host already installed')
  const state = (globalThis[shutdownKey] = { format, stopping: false, steps: [] })
  let stage = 'Node runtime import'
  let booting = true
  let fatal = false
  const startup = setTimeout(() => {
    booting = false
    report('E_STARTUP', stage, 'Startup timed out', format)
    stopProcess(state, 1, true)
  }, timeout('SERVER_STARTUP_TIMEOUT'))
  const processFailure = (error, origin) => {
    if (!fatal) report('E_PROCESS', origin, error, format)
    fatal = true
    clearTimeout(startup)
    // An uncaught exception can leave arbitrary application state corrupt. The diagnostic has already been written.
    if (origin === 'uncaughtException' || state.stopping) process.exit(1)
    stopProcess(state, 1, booting)
  }
  process.on('uncaughtException', (error) => processFailure(error, 'uncaughtException'))
  process.on('unhandledRejection', (error) => processFailure(error, 'unhandledRejection'))
  for (const [signal, number] of [
    ['SIGINT', 2],
    ['SIGTERM', 15],
  ]) {
    process.on(signal, () => {
      if (state.stopping) process.exit(fatal ? 1 : 128 + number)
      clearTimeout(startup)
      stopProcess(state, 0, booting)
    })
  }
  try {
    const { start } = await prepare()
    await start((name) => {
      stage = name
    })
  } catch (error) {
    if (!state.stopping) {
      report('E_STARTUP', stage, error, format)
      stopProcess(state, 1, true)
    }
  } finally {
    booting = false
    clearTimeout(startup)
  }
}
