import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'

export function run(cmd, { cwd, env, log }) {
  const start = performance.now()
  return new Promise((ok, no) => {
    const out = createWriteStream(log, { flags: 'a' })
    out.write(`\n$ ${cmd}\n`)
    const child = spawn(cmd, {
      cwd,
      env: { ...process.env, ...env },
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.pipe(out, { end: false })
    child.stderr.pipe(out, { end: false })
    child.on('close', (code) => {
      out.end()
      code
        ? no(new Error(`\`${cmd}\` failed in ${cwd} (exit ${code}), see ${log}`))
        : ok(performance.now() - start)
    })
  })
}
