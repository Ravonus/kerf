import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

export async function dev(context) {
  const { freePort, kerf, dir, until, call, ID, sleep, check, main, cleanMain, docs, cleanDocs } =
    context
  const port = await freePort()
  const child = spawn(kerf(), ['dev', '--port', String(port)], {
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
  try {
    await until(
      `kerf dev: ${output}`,
      async () => (await call(url, ID.search, { q: 'lantern', limit: 1 })).status === 200,
      240_000,
    )
    const firstMs = Math.round(performance.now() - firstBuild)
    void (async () => {
      while (polling.on) {
        const a = await call(url, ID.search, { q: 'lantern', limit: 1 }).catch((e) => ({
          status: 0,
          body: { e: { code: e.message } },
        }))
        polls.push({
          status: a.status,
          code: a.body?.e?.code,
          title: a.body?.v?.[0]?.title,
          lang: a.body?.v?.[0]?.lang,
        })
        await sleep(10)
      }
    })()
    await check('dev: the first request works, after one build', () => ({ firstMs }))

    await devChecks({ ...context, polls, getOutput: () => output })
  } finally {
    polling.on = false
    writeFileSync(docs, cleanDocs)
    writeFileSync(main, cleanMain)
    const addr = [...output.matchAll(/search: listening on (\S+)/g)].at(-1)?.[1]
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
    await check('stopping `kerf dev` stops the sidecar', async () => {
      context.ok(addr, 'never listened')
      await until(
        'the port to close',
        async () => {
          try {
            await fetch(`http://${addr}/_kerf/health`)
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
  docs,
  cleanDocs,
}) {
  await check('dev: a crate edit reloads with no failed request', async () => {
    polls.length = 0
    const t = performance.now()
    writeFileSync(
      main,
      cleanMain.replace(
        'title: doc.title.clone(), score',
        'title: format!("v2 {}", doc.title), score',
      ),
    )
    await until('the new binary', () => polls.at(-1)?.title?.startsWith('v2 '), 120_000)
    const ms = Math.round(performance.now() - t)
    await sleep(300)
    const bad = polls.filter((p) => p.status !== 200)
    eq(bad, [], 'failed polls during the reload')
    return { reloadMs: ms, requests: polls.length }
  })

  await check(
    'dev: a schema edit is reported as R103 with the id, and fixing the Rust recovers',
    async () => {
      writeFileSync(
        docs,
        cleanDocs.replace('score: z.number() })', 'score: z.number(), lang: z.string() })'),
      )
      const said = `R103 error: \`${ID.search}\`: the Rust no longer matches the contract`
      await until('R103 from cargo in the log', () => getOutput().includes(said), 120_000)
      const noted = getOutput().slice(getOutput().indexOf(said)).split('\n')[0]
      writeFileSync(
        main,
        cleanMain.replace(
          'title: doc.title.clone(), score: (s * 1e6).round() / 1e6 }',
          'title: doc.title.clone(), score: (s * 1e6).round() / 1e6, lang: "en".to_string() }',
        ),
      )
      await until('the fixed sidecar', () => polls.at(-1)?.lang === 'en', 120_000)
      return { noted: noted.slice(0, 140) }
    },
  )

  await check('dev: a crash restarts the sidecar', async () => {
    const addr = [...getOutput().matchAll(/search: listening on (\S+)/g)].at(-1)[1]
    const { pid } = await (await fetch(`http://${addr}/_kerf/health`)).json()
    polls.length = 0
    process.kill(pid, 'SIGKILL')
    await until('a failure', () => polls.some((p) => p.status !== 200), 5000)
    polls.length = 0
    await until('a success', () => polls.at(-1)?.status === 200, 30_000)
  })
}
