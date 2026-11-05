import { writeFileSync } from 'node:fs'

export async function diagnostics(context) {
  const { check, eq, weftCheck, docs, cleanDocs, ok } = context
  await check('`weft check` passes the clean sidecar app', () => {
    const r = weftCheck()
    eq(r.ok, true, `check: ${JSON.stringify(r.diagnostics)?.slice(0, 800)}`)
    return r.summary
  })
  await check('R101: a date, a void and a one-way transform', () => {
    writeFileSync(
      docs,
      `${cleanDocs}
export const when = query({ output: z.date(), impl: search })
export const nothing = mutation({ output: z.void(), impl: search })
export const shout = query({ input: z.object({ a: z.string().transform(s => s.length) }), output: z.null(), impl: search })
`,
    )
    const r = weftCheck().diagnostics.filter((d) => d.code === 'R101')
    writeFileSync(docs, cleanDocs)
    eq(r.length, 3, `R101s: ${JSON.stringify(r)}`)
    ok(
      r.some((d) => d.why.includes('when.') && d.why.includes('z.codec')),
      'names the function and the fix',
    )
    return r.map((d) => d.why.slice(0, 60))
  })
  await check('R102: a plain union of objects, and not a nullable or a scalar union', () => {
    writeFileSync(
      docs,
      `${cleanDocs}
export const either = query({ output: z.union([z.object({ a: z.string() }), z.object({ b: z.number() })]), impl: search })
`,
    )
    const r = weftCheck().diagnostics.filter((d) => d.code === 'R102')
    writeFileSync(docs, cleanDocs)
    eq(r.length, 1, 'R102s')
    ok(r[0].why.includes('either.'), r[0].why)
  })
  await remaining(context)
}

async function remaining(context) {
  const { check, weftCheck, docs, main, cleanDocs, cleanMain, ID, ok } = context
  await check('R103: an edited schema stops cargo at the function it broke, named by id', () => {
    writeFileSync(
      docs,
      cleanDocs.replace('score: z.number() })', 'score: z.number(), lang: z.string() })'),
    )
    const r = weftCheck().diagnostics.filter((d) => d.code === 'R103')
    writeFileSync(docs, cleanDocs)
    ok(r.length, 'no R103')
    ok(
      r.some((d) => d.why.includes(ID.search)),
      `no id in ${JSON.stringify(r)}`,
    )
    ok(
      r.some((d) => d.file === 'crates/search/src/main.rs' && d.span[0] > 1),
      `no location in ${JSON.stringify(r)}`,
    )
    return { file: r[0].file, line: r[0].span[0], why: r[0].why.slice(0, 120) }
  })
  await check('R109: a compile error no function explains is told apart', () => {
    writeFileSync(main, cleanMain.replace('fn words(text: &str)', 'fn words(text: &strr)'))
    const r = weftCheck().diagnostics.filter((d) => /^R10[39]$/.test(d.code))
    writeFileSync(main, cleanMain)
    ok(
      r.some((d) => d.code === 'R109'),
      JSON.stringify(r),
    )
  })
}
