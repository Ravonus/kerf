import { spawn } from 'node:child_process'

/** Start a binary and wait until it listens and its health check names `hash`. Rejects with why, and leaves nothing running. */
export function launch({ exe, service, hash, listen, secret, onExit, log }) {
  return new Promise((ok, no) => {
    const child = spawn(exe, [], {
      env: { ...process.env, KERF_LISTEN: listen, KERF_RUST_SECRET: secret },
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    let out = '',
      ready = false
    const failed = (why) => {
      clearTimeout(timer)
      child.kill('SIGKILL')
      no(Object.assign(new Error(why), { code: 'R109' }))
    }
    const timer = setTimeout(() => failed(`\`${service}\` didn't listen within 30 s`), 30_000)
    child.on('error', (e) => failed(`\`${service}\` didn't start: ${e.message}`))
    child.on('exit', (code, signal) => {
      if (!ready) return failed(`\`${service}\` exited before it listened (${signal ?? code})`)
      onExit?.(code, signal)
    })
    child.stdout.on('data', (d) => void heard(d))
    const heard = async (d) => {
      if (ready) return void process.stdout.write(d)
      out += d
      const addr = /kerf-listening (\S+)/.exec(out)?.[1]
      if (!addr) return
      ready = true
      clearTimeout(timer)
      const url = `http://${addr}`
      try {
        const health = await (await fetch(`${url}/_kerf/health`)).json()
        if (health.contract !== hash) {
          ready = false
          return failed(
            `R103: \`${service}\` was built from contract ${health.contract}, and this app's is ${hash}: rebuild it`,
          )
        }
        log?.(`[kerf] ${service}: listening on ${addr}`)
        ok({ child, url, port: Number(addr.split(':').pop()), inflight: 0 })
      } catch (e) {
        ready = false
        failed(`\`${service}\`'s health check failed: ${e.message}`)
      }
    }
  })
}

/** SIGTERM, which the crate drains on; SIGKILL if that takes too long. */
export function stop(p, wait = 5_000) {
  if (!p || p.child.exitCode !== null) return
  p.stopped = true
  p.child.kill('SIGTERM')
  const t = setTimeout(() => p.child.kill('SIGKILL'), wait)
  t.unref()
  p.child.once('exit', () => clearTimeout(t))
}
