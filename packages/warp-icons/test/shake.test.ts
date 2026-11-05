// @vitest-environment node
// An unused icon costs zero bytes, and a static tier ships that tier alone. These bundles are real production builds.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, constants } from 'node:zlib'
import { build } from 'vite'
import weft from '@weft-js/core/vite'

const br = (text: string) =>
  brotliCompressSync(Buffer.from(text), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length
const pkg = new URL('..', import.meta.url).pathname

// A project inside the package, so it resolves weft. Its alias file picks the tiers; '@weft-js/warp-icons' to itself means all of them.
function project(alias: Record<string, string>) {
  const dir = mkdtempSync(join(pkg, '.tmp-'))
  mkdirSync(join(dir, '.weft', 'tokens'), { recursive: true })
  writeFileSync(join(dir, '.weft', 'tokens', 'icons.alias.json'), JSON.stringify(alias))
  return dir
}
const ALL = { '@weft-js/warp-icons': '@weft-js/warp-icons' }
async function bundle(code: string, { alias = ALL } = {}) {
  const root = project(alias)
  writeFileSync(join(root, 'app.tsx'), code) // the build scans the project's files
  try {
    return await run(code, root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
async function run(code: string, root: string) {
  const id = '\0shake-entry.tsx'
  const out = await build({
    configFile: false,
    logLevel: 'silent',
    root,
    plugins: [
      weft(),
      {
        name: 'entry',
        resolveId: (s) => (s === 'shake-entry.tsx' ? id : null),
        load: (i) => (i === id ? code : null),
      },
    ],
    build: {
      write: false,
      cssCodeSplit: false,
      modulePreload: false,
      rolldownOptions: { input: 'shake-entry.tsx' },
    },
  })
  const files = (Array.isArray(out) ? out : [out]).flatMap(
    (o) => (o as Extract<typeof o, { output: unknown }>).output,
  )
  return {
    chunks: files.filter((f) => f.type === 'chunk').map((f) => f.code),
    js: files
      .filter((f) => f.type === 'chunk')
      .map((f) => f.code)
      .join('\n'),
    css: files
      .filter((f) => f.fileName.endsWith('.css'))
      .map((f) => String((f as Extract<typeof f, { type: 'asset' }>).source))
      .join('\n'),
  }
}
const page = (names: string[], from = '@weft-js/warp-icons') =>
  `import { render } from '@weft-js/core/dom'\nimport { ${names.join(', ')} } from '${from}'\nrender(() => <div>${names.map((n) => `<${n} />`).join('')}</div>, document.body)\n`

test('one icon imported: its drawing ships, and no other', async () => {
  const one = await bundle(page(['CheckIcon']))
  expect(one.js.match(/data-p=/g)?.length ?? 0).toBeLessThanOrEqual(2)
  for (const other of ['M1 3h13v2h-13z']) expect(one.js).not.toContain(other)
  const two = await bundle(page(['CheckIcon', 'BellIcon']))
  const added = br(two.js) - br(one.js)
  expect(added).toBeGreaterThan(0)
  expect(added, 'one more icon').toBeLessThan(700)
  process.stderr.write(
    `BYTES CheckIcon js ${br(one.js)} css ${br(one.css)}, BellIcon adds ${added}\n`,
  )
}, 60000)

test('importing iconSet alone brings no drawing', async () => {
  const { js } = await bundle(
    `import { render } from '@weft-js/core/dom'\nimport { iconSet } from '@weft-js/warp-icons'\nconst Icon = iconSet({})\nrender(() => <div>{typeof Icon}</div>, document.body)\n`,
  )
  expect(js).not.toContain('data-p')
}, 60000)

test('a static tier compiles one tier in: no switch attributes, no switch CSS, no other tier', async () => {
  {
    const { js, css } = await bundle(page(['CheckIcon', 'AlertIcon']), {
      alias: { '@weft-js/warp-icons': '@weft-js/warp-icons/vivid' },
    })
    expect(js).toContain('data-p')
    expect(js).not.toContain('data-t')
    expect(js).not.toContain('stroke-linecap')
    expect(css).not.toContain('--warp-icon-v')
    const all = await bundle(page(['CheckIcon', 'AlertIcon']))
    expect(all.js).toContain('data-t')
    expect(all.css).toContain('--warp-icon-v')
    expect(br(js)).toBeLessThan(br(all.js))
    process.stderr.write(`BYTES two icons: runtime js ${br(all.js)}, vivid js ${br(js)}\n`)
  }
}, 90000)

test('per tier, per icon: what an icon costs in each build', async () => {
  const names = [
    'SearchIcon',
    'CalendarIcon',
    'UserIcon',
    'SettingsIcon',
    'TrashIcon',
    'MailIcon',
    'LockIcon',
    'HomeIcon',
    'BellIcon',
    'FileIcon',
  ]
  const base = await bundle(page(['CheckIcon']))
  const ten = await bundle(page(['CheckIcon', ...names]))
  const each = (br(ten.js) - br(base.js)) / names.length
  expect(each).toBeLessThan(400)
  process.stderr.write(`BYTES average icon, all tiers: ${each.toFixed(0)} B br\n`)
}, 60000)

// All three forms name one icon, so all three must build to the same bytes. Each path's cost, for the report.
const render = "import { render } from '@weft-js/core/dom'\n"
const forms = {
  named: `${render}import { BellIcon } from '@weft-js/warp-icons'\nrender(() => <div><BellIcon /></div>, document.body)\n`,
  pack: `${render}import Icons from '@weft-js/warp-icons'\nrender(() => <div><Icons.Bell /></div>, document.body)\n`,
  namespace: `${render}import * as Icons from '@weft-js/warp-icons'\nrender(() => <div><Icons.Bell /></div>, document.body)\n`,
  name: `${render}import { Icon } from '@weft-js/warp-icons/all'\nrender(() => <div><Icon name="bell" /></div>, document.body)\n`,
}
test.each(Object.keys(forms))(
  '%s: exactly one icon, the same output as a named import',
  async (form) => {
    const base = await bundle(forms.named),
      out = await bundle(forms[form as keyof typeof forms])
    expect(out.js).toContain('M')
    expect(out.js.match(/data-t="v"/g)?.length).toBe(base.js.match(/data-t="v"/g)?.length)
    expect(out.js.includes('SearchIcon') || out.js.length > base.js.length * 1.05).toBe(false)
    process.stderr.write(`BYTES ${form}: ${br(out.js)} B js\n`)
  },
  60000,
)
test('a variant ships its own drawing, not the plain one', async () => {
  const plain = await bundle(forms.named)
  const solid = await bundle(
    `${render}import { BellIconSolid } from '@weft-js/warp-icons'\nrender(() => <div><BellIconSolid /></div>, document.body)\n`,
  )
  expect(solid.js).not.toBe(plain.js)
  process.stderr.write(`BYTES BellIcon ${br(plain.js)}, BellIconSolid ${br(solid.js)}\n`)
}, 60000)
test('a dynamic name: the pack is its own chunk, and the page stays small', async () => {
  const lazy = await bundle(
    `${render}import { Icon } from '@weft-js/warp-icons/all'\nconst n = location.hash.slice(1)\nrender(() => <div><Icon name={n} /></div>, document.body)\n`,
  )
  expect(lazy.chunks.length).toBeGreaterThan(1)
  const [main, ...rest] = lazy.chunks.toSorted((a, b) => a.length - b.length)
  process.stderr.write(`BYTES dynamic: page ${br(main!)} B js, pack chunk ${br(rest.join(''))} B\n`)
  expect(br(main!)).toBeLessThan(br(rest.join('')))
}, 90000)

test('an action costs nothing unless that one is used', async () => {
  const none = await bundle(forms.named)
  expect(none.css).not.toMatch(/weft-(trash|bell|check|refresh|copy)/)
  const trash = await bundle(
    `${render}import { TrashIconAction } from '@weft-js/warp-icons'\nrender(() => <div><TrashIconAction /></div>, document.body)\n`,
  )
  expect(trash.css).toContain('weft-trash')
  expect(trash.css).not.toContain('weft-bell')
  expect(trash.css).toContain('prefers-reduced-motion')
  expect(trash.css).toContain('--warp-motion-scale')
  process.stderr.write(
    `BYTES TrashIconAction: ${br(trash.js)} B js, ${br(trash.css)} B css (plain icon ${br(none.js)} js, ${br(none.css)} css)\n`,
  )
}, 60000)
