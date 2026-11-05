import { randomBytes } from 'node:crypto'

export async function sidecar(context) {
  const { build, start, check, call, ID, eq, ok, until } = context
  build('node')
  {
    const s = await start('node')
    try {
      await check('a tag Rust adds reaches the response', async () => {
        const { body } = await call(s.url, ID.get, { id: 'doc-7' })
        eq(body.t, ['docs', 'doc:doc-7'], 'tags')
        return { tags: body.t }
      })
      const addr = /search: listening on (\S+)/.exec(s.output())?.[1]
      ok(addr, `no sidecar address in: ${s.output()}`)
      await check('a forged or unsigned call to the sidecar is refused', async () => {
        const unsigned = await fetch(`http://${addr}/_weft/fn/${ID.search}`, {
          method: 'POST',
          body: '{"input":{"q":"x","limit":1}}',
        })
        eq(unsigned.status, 401, 'no signature')
        const forged = await fetch(`http://${addr}/_weft/fn/${ID.search}`, {
          method: 'POST',
          headers: { 'weft-ctx': 'e30', 'weft-sig': randomBytes(32).toString('hex') },
          body: '{"input":{"q":"x","limit":1}}',
        })
        eq(forged.status, 401, 'a made-up signature')
      })
      await check(
        'a killed sidecar costs that function, not the server, and comes back',
        async () => {
          const { pid } = await (await fetch(`http://${addr}/_weft/health`)).json()
          process.kill(pid, 'SIGKILL')
          const down = await until(
            'the failure',
            async () => {
              const a = await call(s.url, ID.search, { q: 'lantern', limit: 1 })
              return a.status !== 200 && a
            },
            5000,
          )
          eq([down.status, down.body.e.code], [503, 'R107'], 'while down')
          eq((await fetch(`${s.url}/about`)).status, 200, 'a page while the sidecar is down')
          const t = performance.now()
          await until(
            'the restart',
            async () => (await call(s.url, ID.search, { q: 'lantern', limit: 1 })).status === 200,
            15_000,
          )
          return { backMs: Math.round(performance.now() - t) }
        },
      )
    } finally {
      await s.stop()
    }
    await check('stopping `weft start` stops the sidecar', async () => {
      const addr = /search: listening on (\S+)/.exec(s.output())?.[1]
      await until(
        'the port to close',
        async () => {
          try {
            await fetch(`http://${addr}/_weft/health`)
            return false
          } catch {
            return true
          }
        },
        5000,
      )
    })
  }
}
