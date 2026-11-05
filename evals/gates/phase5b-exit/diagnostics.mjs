import { writeFileSync } from 'node:fs'

export async function diagnostics(context) {
  const { check, eq, weftCheck, server, cleanServer, ID, ok } = context
  await check('`weft check` passes the clean app, with no warning', () => {
    const r = weftCheck()
    eq([r.ok, r.diagnostics?.filter((d) => d.code.startsWith('R1'))], [true, []], 'check')
    return r.summary
  })
  await check('R103: an edited schema stops cargo at the function it broke, named by id', () => {
    writeFileSync(
      server,
      cleanServer.replace(
        'const Done = z.object({ checksum: z.string(),',
        'const Done = z.object({ checksum: z.string(), format: z.string(),',
      ),
    )
    const r = weftCheck().diagnostics.filter((d) => d.code === 'R103')
    writeFileSync(server, cleanServer)
    ok(
      r.some((d) => d.why.includes(ID.thumbnail)),
      `no id in ${JSON.stringify(r)}`,
    )
    ok(
      r.some((d) => d.file === 'crates/media/src/lib.rs' && d.span[0] > 1),
      `no location in ${JSON.stringify(r)}`,
    )
    return { line: r[0].span[0], why: r[0].why.slice(0, 120) }
  })
  await remaining(context)
}

async function remaining(context) {
  const { check, eq, weftCheck, main, cleanMain, ID, run, weft, dir, ok } = context
  await check('R104: an edge preset is refused with the fix, before anything compiles', () => {
    const r = run(weft(), ['build', '--preset', 'cloudflare_module'], dir, {
      NODE_ENV: 'production',
    })
    ok(r.status !== 0, 'the build passed')
    const text = `${r.stdout}${r.stderr}`
    ok(text.includes('R104') && text.includes("remote('rust://media')"), text.slice(-600))
  })
  await check("R104: a crate that won't build for WASM is a warning here, with the way out", () => {
    writeFileSync(
      main,
      `#[cfg(target_family = "wasm")]\ncompile_error!("this crate links C");\n${cleanMain}`,
    )
    const r = weftCheck()
    writeFileSync(main, cleanMain)
    const hit = r.diagnostics.find((d) => d.code === 'R104')
    ok(hit?.severity === 'warning', JSON.stringify(r.diagnostics))
    ok(hit.why.includes('wasm: false'), hit.why)
    eq(r.ok, true, 'check')
    return hit.why.slice(0, 120)
  })
  await check('R105: a cached query with tags and no `touch`, at the method', () => {
    writeFileSync(main, cleanMain.replace('        ctx.touch("images");\n', ''))
    const r = weftCheck().diagnostics.filter((d) => d.code === 'R105')
    writeFileSync(main, cleanMain)
    eq(r.length, 1, `R105s: ${JSON.stringify(r)}`)
    eq(r[0].file, 'crates/media/src/lib.rs', 'file')
    ok(r[0].span[0] > 1 && r[0].why.includes(ID.stats), JSON.stringify(r[0]))
    return { line: r[0].span[0] }
  })
}
