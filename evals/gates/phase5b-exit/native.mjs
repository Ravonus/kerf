import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export async function nativeChecks(context, r) {
  const { build, start, check, call, ID, eq, ok, until, spin, sleep } = context
  build(r)
  const s = await start(r)
  try {
    await check(`${r}: a tag Rust adds reaches the response`, async () => {
      const { body } = await call(s.url, ID.stats)
      eq(body.t, ['images', 'images:all'], 'tags')
    })
    await check(
      `${r}: a panic costs one call, in R108, with the detail in the log only`,
      async () => {
        const a = await call(s.url, ID.boom)
        eq([a.status, a.body.e.code], [500, 'R108'], 'the answer')
        ok(!JSON.stringify(a.body).includes('the eval asked'), 'the detail reached the client')
        await until('the log line', () => s.output().includes('the eval asked for this'), 3000)
        eq(
          (await call(s.url, ID.thumbnail, { seed: 3, width: 64, height: 64 })).status,
          200,
          'the next call',
        )
      },
    )
    await check(
      `${r}: past its deadline TS gives up with R107, and the loop stays free`,
      async () => {
        const t = performance.now()
        const [slow, quick] = await Promise.all([
          spin(s.url),
          sleep(20)
            .then(() => call(s.url, ID.guarded, { width: 2, height: 2 }))
            .then((a) => ({ a, ms: performance.now() - t })),
        ])
        eq([slow.status, slow.body.e.code], [504, 'R107'], 'the spin')
        eq(quick.a.status, 200, 'a call during it')
        ok(quick.ms < 150, `a call during a 200 ms spin took ${Math.round(quick.ms)} ms`)
        return { duringSpinMs: Math.round(quick.ms) }
      },
    )
    await check(`${r}: more than 4 calls run at once`, async () => {
      const t = performance.now()
      await Promise.all(Array.from({ length: 8 }, () => spin(s.url)))
      const ms = Math.round(performance.now() - t)
      ok(ms < 340, `8 spins of 200 ms took ${ms} ms, so the pool is small`)
      return { ms }
    })
  } finally {
    await s.stop()
  }
}

export async function fallbackChecks(context, r) {
  const { check, dir, start, call, ID, eq, addons, wire, results, until, spin, ok, bench, log } =
    context
  await check(`${r}: a stale library is refused with R103`, async () => {
    const file = join(dir, '.output/server/rust/manifest.json')
    const held = readFileSync(file, 'utf8')
    writeFileSync(file, held.replaceAll(JSON.parse(held).media.hash, 'ffffffffffffffff'))
    const stale = await start(r)
    try {
      const a = await call(stale.url, ID.thumbnail, { seed: 1, width: 64, height: 64 })
      eq([a.status, a.body.e.code], [502, 'R103'], 'the answer')
      eq((await fetch(`${stale.url}/about`)).status, 200, 'a page')
    } finally {
      await stale.stop()
      writeFileSync(file, held)
    }
  })

  // No addon for this platform: what a host on another machine gets.
  for (const f of addons()) rmSync(join(dir, '.output/server/rust', f))
  const w = await start(r)
  try {
    await check(`${r}: with the addon gone, its WASM gives the same answers`, async () => {
      const got = await wire(w.url)
      for (const k of Object.keys(results.ts[r].wire)) eq(got[k], results.ts[r].wire[k], k)
      return { requests: Object.keys(got).length }
    })
    await check(
      `${r}: on WASM a panic ends an instance, and the next call has a new one`,
      async () => {
        eq((await call(w.url, ID.boom)).body.e.code, 'R108', 'the panic')
        await until('the log line', () => w.output().includes('the eval asked for this'), 3000)
        eq(
          (await call(w.url, ID.thumbnail, { seed: 3, width: 64, height: 64 })).status,
          200,
          'the next call',
        )
      },
    )
    await check(`${r}: on WASM \`ctx.remaining()\` runs on the host's clock`, async () => {
      const t = performance.now()
      const a = await spin(w.url)
      const ms = performance.now() - t
      ok(ms >= 190 && ms < 2000, `a 200 ms spin took ${Math.round(ms)} ms`)
      eq(a.status, 200, 'a spin that returns')
    })
    results.wasm[r] = await bench(w.url)
    log(`wasm on ${r}:`, results.wasm[r])
  } finally {
    await w.stop()
  }
}
