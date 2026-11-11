import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

export const build = (dir) =>
  execFileSync('pnpm', ['exec', 'vite', 'build', '--logLevel', 'error'], {
    cwd: dir,
    stdio: ['ignore', 'ignore', 'ignore'],
  })
export const br = (b) =>
  brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length
export function sizes(dir) {
  const a = join(dir, 'dist/assets'),
    out = { js: { raw: 0, gz: 0, br: 0 }, css: { raw: 0, gz: 0, br: 0 } }
  for (const f of readdirSync(a)) {
    const k = f.endsWith('.js') ? 'js' : f.endsWith('.css') ? 'css' : null
    if (!k) continue
    const b = readFileSync(join(a, f))
    out[k].raw += b.length
    out[k].gz += gzipSync(b, { level: 9 }).length
    out[k].br += br(b)
  }
  return out
}
export const lines = (dir) => {
  const src = join(dir, 'src')
  return readdirSync(src)
    .filter((f) => /\.(tsx|ts|css)$/.test(f) && f !== 'screens.ts')
    .reduce((n, f) => n + readFileSync(join(src, f), 'utf8').trim().split('\n').length, 0)
}

// Real per-screen code: its own words, numbers, state and markup, so repeats can't compress away. Same shape per stack.
const WORDS =
  'amber basalt cedar dune ember fjord grove heath inlet jade kelp loam marsh nectar opal pine quartz reed sage tundra umber vale willow xenon yarrow zephyr'.split(
    ' ',
  )
const word = (i, k) =>
  `${WORDS[(i * 7 + k) % 26]}-${WORDS[(i * 3 + k * 5) % 26]}-${(i + 1) * (k + 3)}`
const stats = (i) => [0, 1, 2].map((k) => ({ label: word(i, k), at: ((i * 13 + k * 29) % 90) + 5 }))
const items = (i) => [3, 4, 5, 6, 7].map((k) => word(i, k))
const SUMMARY = {
  kerf: (i) => `function Summary() {
  const open = state(false), note = state('${word(i, 8)}')
  const stats = ${JSON.stringify(stats(i))}
  return <section aria-label="${word(i, 9)}"><h2>${word(i, 10)}</h2><dl>{stats.map(s => <div key={s.label}><dt>{s.label}</dt><dd>{projects.filter(p => p.used > s.at).length}</dd></div>)}</dl>
    <input aria-label="${word(i, 11)}" value={note.value} onInput={(e: any) => (note.value = e.currentTarget.value)} /><p>{note.value.length} ${word(i, 12)}</p>
    <button type="button" onClick={() => (open.value = !open.value)}>${word(i, 13)}</button>{open.value && <ul>${items(
      i,
    )
      .map((w) => `<li><a href="#${w}">${w}</a></li>`)
      .join('')}</ul>}</section>
}
`,
  solid: (i) => `function Summary() {
  const [open, setOpen] = createSignal(false), [note, setNote] = createSignal('${word(i, 8)}')
  const stats = ${JSON.stringify(stats(i))}
  return <section aria-label="${word(i, 9)}"><h2>${word(i, 10)}</h2><dl><For each={stats}>{s => <div><dt>{s.label}</dt><dd>{projects.filter(p => p.used > s.at).length}</dd></div>}</For></dl>
    <input aria-label="${word(i, 11)}" value={note()} onInput={e => setNote(e.currentTarget.value)} /><p>{note().length} ${word(i, 12)}</p>
    <button type="button" onClick={() => setOpen(!open())}>${word(i, 13)}</button><Show when={open()}><ul>${items(
      i,
    )
      .map((w) => `<li><a href="#${w}">${w}</a></li>`)
      .join('')}</ul></Show></section>
}
`,
}
SUMMARY.react = (i) => `function Summary() {
  const [open, setOpen] = useState(false), [note, setNote] = useState('${word(i, 8)}')
  const stats = ${JSON.stringify(stats(i))}
  return <section aria-label="${word(i, 9)}"><h2>${word(i, 10)}</h2><dl>{stats.map(s => <div key={s.label}><dt>{s.label}</dt><dd>{projects.filter(p => p.used > s.at).length}</dd></div>)}</dl>
    <input aria-label="${word(i, 11)}" value={note} onChange={e => setNote(e.currentTarget.value)} /><p>{note.length} ${word(i, 12)}</p>
    <button type="button" onClick={() => setOpen(!open)}>${word(i, 13)}</button>{open && <ul>${items(
      i,
    )
      .map((w) => `<li><a href="#${w}">${w}</a></li>`)
      .join('')}</ul>}</section>
}
`
const IMPORTS = {
  kerf: `import { projects } from '../../../shared/data'\n`,
  solid: `import { createSignal, For, Show } from 'solid-js'\nimport { projects } from '../../../shared/data'\n`,
  react: `import { useState } from 'react'\nimport { projects } from '../../../shared/data'\n`,
}

/** N screens: each its own columns, label and Summary on the stack's shared table, all in the one bundle. */
export function sweep(stack, dir, n, meta) {
  const { flavor } = meta[stack]
  const src = join(dir, 'src'),
    screen = readFileSync(join(src, 'Screen.tsx'), 'utf8'),
    original = readFileSync(join(src, 'screens.ts'), 'utf8')
  rmSync(join(src, 'gen'), { recursive: true, force: true })
  mkdirSync(join(src, 'gen'))
  for (let i = 0; i < n; i++) {
    let code = screen
      .replaceAll("'./", "'../")
      .replaceAll("'../../shared/data'", "'../../../shared/data'")
      .replace("'Projects'", `'${word(i, 14)}'`)
    for (const [k, h] of ['Owner', 'Region', 'Status'].entries())
      code = code.replaceAll(
        new RegExp(`(header|headerName): '${h}'`, 'g'),
        `$1: '${word(i, 15 + k)}'`,
      )
    code = code
      .replace(/projects, /, '')
      .replace(/import \{ money, projects, type Project \}/, 'import { money, type Project }')
    code =
      flavor === 'kerf'
        ? code.replace('<h1>{LABEL}</h1>', '<h1>{LABEL}</h1><Summary />')
        : code.replace(/=> (<DataTable .*\/>)/, '=> <><Summary />$1</>')
    writeFileSync(join(src, `gen/S${i}.tsx`), IMPORTS[flavor] + code + SUMMARY[flavor](i))
  }
  writeFileSync(
    join(src, 'screens.ts'),
    Array.from({ length: n }, (_, i) => `import { Screen as S${i} } from './gen/S${i}'`).join(
      '\n',
    ) + `\nexport const screens = [${Array.from({ length: n }, (_, i) => `S${i}`)}]\n`,
  )
  try {
    build(dir)
    return sizes(dir)
  } finally {
    writeFileSync(join(src, 'screens.ts'), original)
    rmSync(join(src, 'gen'), { recursive: true, force: true })
  }
}
