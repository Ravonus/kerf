import { spawn } from 'node:child_process'
import { writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export async function dev(context) {
  const {
    freePort,
    weft,
    dir,
    until,
    call,
    ID,
    sleep,
    check,
    main,
    cleanMain,
    server,
    cleanServer,
  } = context
  const port = await freePort()
  const child = spawn(weft(), ['dev', '--port', String(port)], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  let output = ''
  child.stdout.on('data', (d) => {
    output += d
  })
  child.stderr.on('data', (d) => {
    output += d
  })
  const url = `http://localhost:${port}`
  const firstBuild = performance.now()
  const polling = { on: true }
  const polls = []
  const input = { seed: 5, width: 64, height: 64 }
  try {
    await until(
      `weft dev: ${output}`,
      async () => (await call(url, ID.thumbnail, input)).status === 200,
      240_000,
    )
    const firstMs = Math.round(performance.now() - firstBuild)
    const poller = (async () => {
      while (polling.on) {
        const a = await call(url, ID.thumbnail, input).catch((e) => ({
          status: 0,
          body: { e: { code: e.message } },
        }))
        polls.push({
          status: a.status,
          code: a.body?.e?.code,
          checksum: a.body?.v?.checksum,
          format: a.body?.v?.format,
        })
        await sleep(10)
      }
    })()
    await check('dev: the first request works, after one build', () => ({ firstMs }))

    await devChecks({ ...context, polls, getOutput: () => output })
    polling.on = false
    await poller
  } finally {
    polling.on = false
    writeFileSync(server, cleanServer)
    writeFileSync(main, cleanMain)
    try {
      if (child.pid) process.kill(-child.pid, 'SIGINT')
    } catch {}
    await Promise.race([
      new Promise((closed) => {
        child.on('close', closed)
      }),
      sleep(8000),
    ])
    try {
      if (child.pid) process.kill(-child.pid, 'SIGKILL')
    } catch {}
  }
}

async function devChecks({
  check,
  polls,
  main,
  cleanMain,
  until,
  sleep,
  eq,
  ID,
  getOutput,
  server,
  cleanServer,
  dir,
  ok,
}) {
  await check(
    'dev: a crate edit reloads in place, with no failed request and no new worker',
    async () => {
      polls.length = 0
      const t = performance.now()
      writeFileSync(
        main,
        cleanMain.replace('checksum: format!("{hash:08x}")', 'checksum: format!("v2-{hash:08x}")'),
      )
      await until('the new library', () => polls.at(-1)?.checksum?.startsWith('v2-'), 180_000)
      const ms = Math.round(performance.now() - t)
      await sleep(300)
      eq(
        polls.filter((p) => p.status !== 200),
        [],
        'failed polls during the reload',
      )
      ok(
        existsSync(join(dir, '.weft/native/media-2.node')),
        'the second build has a path of its own',
      )
      return { reloadMs: ms, requests: polls.length }
    },
  )

  await devRecovery({
    check,
    polls,
    main,
    cleanMain,
    until,
    sleep,
    eq,
    ID,
    getOutput,
    server,
    cleanServer,
    dir,
    ok,
  })
}

async function devRecovery({
  check,
  polls,
  main,
  cleanMain,
  until,
  sleep,
  eq,
  ID,
  getOutput,
  server,
  cleanServer,
}) {
  await check('dev: a compile error keeps the old library serving', async () => {
    polls.length = 0
    writeFileSync(main, cleanMain.replace('fn photo(seed: u32', 'fn photo(seed: u33'))
    await until('R109 in the log', () => getOutput().includes("`media` doesn't compile"), 120_000)
    await sleep(100)
    eq(
      polls.filter((p) => p.status !== 200),
      [],
      'failed polls',
    )
  })

  await check(
    'dev: a schema edit is reported as R103 with the id, and fixing the Rust recovers',
    async () => {
      writeFileSync(main, cleanMain)
      writeFileSync(
        server,
        cleanServer.replace(
          'const Done = z.object({ checksum: z.string(),',
          'const Done = z.object({ checksum: z.string(), format: z.string(),',
        ),
      )
      const said = `R103 error: \`${ID.thumbnail}\`: the Rust no longer matches the contract`
      await until('R103 from cargo in the log', () => getOutput().includes(said), 120_000)
      writeFileSync(
        main,
        cleanMain.replace(
          'Ok(ThumbnailOutput { checksum:',
          'Ok(ThumbnailOutput { format: "fnv".to_string(), checksum:',
        ),
      )
      await until('the fixed library', () => polls.at(-1)?.format === 'fnv', 180_000)
    },
  )
}
