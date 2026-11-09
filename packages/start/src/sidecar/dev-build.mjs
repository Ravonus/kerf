import { join } from 'node:path'
import { cargo } from './cargo.mjs'
import { crateDir, isNative, stem } from './common.mjs'
import { launch, stop } from './process.mjs'
import { copyFileSync, renameSync } from 'node:fs'

/** Copy, then rename: macOS kills a process that loads a signed binary overwritten in place. */
function place(from, to) {
  copyFileSync(from, `${to}.tmp`)
  renameSync(`${to}.tmp`, to)
}

export function devBuilder(deps) {
  const { log, states, closed } = deps
  async function rebuild(service) {
    const s = states.get(service)
    if (s.building) return void (s.again = true)
    s.building = true
    try {
      do {
        s.again = false
        await once(service, s, deps, exited)
      } while (s.again && !closed())
    } finally {
      s.building = false
    }
  }

  function exited(service, s, child, code, signal) {
    if (closed() || !child || child.stopped || s.current !== child) return
    s.current = undefined
    const wait = Math.min(100 * 2 ** (s.crashes = (s.crashes ?? 0) + 1), 5_000)
    log(`[weft] ${service} exited (${signal ?? code}): restarting in ${wait} ms`)
    setTimeout(() => {
      if (closed() || s.current || s.building) return
      void rebuild(service) // cargo finds nothing to do, and the binary starts again
    }, wait).unref()
  }

  return rebuild
}

export async function once(service, s, deps, exited) {
  const { root, rust, secret, log, say, overlay, nativeDir, publish, contract } = deps
  const hash = contract().services?.[service]?.hash
  if (!hash) return
  const dir = crateDir(root, rust, service)
  const t = performance.now()
  const built = await cargo('build', { root, dir, service, contract: contract() })
  if (!built.ok || !(built.exe || built.lib)) {
    built.diagnostics.forEach(say)
    s.failure = built.diagnostics.map((d) => d.why).join('\n') || `\`${service}\` didn't build`
    overlay(s.failure)
    if (isNative(contract(), service) && !s.loaded) publish()
    return
  }
  log(`[weft] ${service}: built in ${Math.round(performance.now() - t)} ms`)
  if (isNative(contract(), service)) {
    s.generation = (s.generation ?? 0) + 1
    s.loaded = { hash, addon: `${stem(service)}-${s.generation}.node` }
    s.failure = undefined
    place(built.lib, join(nativeDir, s.loaded.addon))
    return publish()
  }
  let next
  try {
    next = await launch({
      exe: built.exe,
      service,
      hash,
      listen: '127.0.0.1:0',
      secret,
      log,
      onExit: (code, signal) => exited(service, s, next, code, signal),
    })
  } catch (e) {
    s.failure = e.message
    log(`[weft] ${e.message}`)
    return overlay(e.message)
  }
  // The swap: new calls go to `next` from here; the old child finishes what it has, then goes.
  const old = s.current
  s.current = next
  s.failure = undefined
  s.exe = built.exe
  s.crashes = 0
  if (old) {
    old.retired = true
    if (old.inflight === 0) stop(old)
  }
}
