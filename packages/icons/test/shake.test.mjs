// @vitest-environment node
// An unused icon costs zero bytes, and a static tier ships that tier alone. These bundles are real production builds.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, constants } from 'node:zlib'
import { build } from 'vite'
import weft from 'weft/vite'

const br = text => brotliCompressSync(Buffer.from(text), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length
const pkg = new URL('..', import.meta.url).pathname

// A project inside the package, so it resolves weft. Its alias file picks the tiers; '@weft/icons' to itself means all of them.
function project(alias) {
  const dir = mkdtempSync(join(pkg, '.tmp-'))
  mkdirSync(join(dir, '.weft', 'tokens'), { recursive: true })
  writeFileSync(join(dir, '.weft', 'tokens', 'icons.alias.json'), JSON.stringify(alias))
  return dir
}
const ALL = { '@weft/icons': '@weft/icons' }
async function bundle(code, { alias = ALL } = {}) {
  const root = project(alias)
  try { return await run(code, root) } finally { rmSync(root, { recursive: true, force: true }) }
}
async function run(code, root) {
  const id = '\0shake-entry.tsx'
  const out = await build({
    configFile: false, logLevel: 'silent', root,
    plugins: [weft(), { name: 'entry', resolveId: s => (s === 'shake-entry.tsx' ? id : null), load: i => (i === id ? code : null) }],
    resolve: { alias: [{ find: /^@weft\/icons\/(quiet|balanced|vivid)$/, replacement: `${pkg}src/gen/$1.tsx` }] },
    build: { write: false, cssCodeSplit: false, modulePreload: false, rolldownOptions: { input: 'shake-entry.tsx' } },
  })
  const files = (Array.isArray(out) ? out : [out]).flatMap(o => o.output)
  return { js: files.filter(f => f.type === 'chunk').map(f => f.code).join('\n'), css: files.filter(f => f.fileName.endsWith('.css')).map(f => String(f.source)).join('\n') }
}
const page = (names, from = '@weft/icons') => `import { render } from 'weft/dom'\nimport { ${names.join(', ')} } from '${from}'\nrender(() => <div>${names.map(n => `<${n} />`).join('')}</div>, document.body)\n`

test('one icon imported: its drawing ships, and no other', async () => {
  const one = await bundle(page(['IconCheck']))
  const paths = one.js.match(/shape-rendering/g)?.length ?? 0
  expect(paths).toBeLessThanOrEqual(2)
  for (const other of ['M1 3h13v2h-13z']) expect(one.js).not.toContain(other)
  const two = await bundle(page(['IconCheck', 'IconBell']))
  const added = br(two.js) - br(one.js)
  expect(added).toBeGreaterThan(0)
  expect(added, 'one more icon').toBeLessThan(700)
  process.stderr.write(`BYTES IconCheck js ${br(one.js)} css ${br(one.css)}, IconBell adds ${added}\n`)
}, 60000)

test('importing iconSet alone brings no drawing', async () => {
  const { js } = await bundle(`import { render } from 'weft/dom'\nimport { iconSet } from '@weft/icons'\nconst Icon = iconSet({})\nrender(() => <div>{typeof Icon}</div>, document.body)\n`)
  expect(js).not.toContain('crispEdges')
}, 60000)

test('a static tier compiles one tier in: no switch attributes, no switch CSS, no other tier', async () => {
  {
    const { js, css } = await bundle(page(['IconCheck', 'IconAlert']), { alias: { '@weft/icons': '@weft/icons/vivid' } })
    expect(js).toContain('crispEdges')
    expect(js).not.toContain('data-t')
    expect(js).not.toContain('stroke-linecap')
    expect(css).not.toContain('--warp-icon-v')
    const all = await bundle(page(['IconCheck', 'IconAlert']))
    expect(all.js).toContain('data-t')
    expect(all.css).toContain('--warp-icon-v')
    expect(br(js)).toBeLessThan(br(all.js))
    process.stderr.write(`BYTES two icons: runtime js ${br(all.js)}, vivid js ${br(js)}\n`)
  }
}, 90000)

test('per tier, per icon: what an icon costs in each build', async () => {
  const names = ['IconSearch', 'IconCalendar', 'IconUser', 'IconSettings', 'IconTrash', 'IconMail', 'IconLock', 'IconHome', 'IconBell', 'IconFile']
  const base = await bundle(page(['IconCheck']))
  const ten = await bundle(page(['IconCheck', ...names]))
  const each = (br(ten.js) - br(base.js)) / names.length
  expect(each).toBeLessThan(400)
  process.stderr.write(`BYTES average icon, all tiers: ${each.toFixed(0)} B br\n`)
}, 60000)
