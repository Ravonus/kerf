// @vitest-environment node
// The build follows a name as far as it can and ships that set; what it can't follow is legal, and reported.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { analyze, closest, findings, list, namesModule, publish, rewrite, trimTiers } from '../compile.mjs'

const catalog = list()
function scan(files) {
  const root = mkdtempSync(join(tmpdir(), 'icons-scan-'))
  try {
    for (const [f, code] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), code) }
    return analyze(root, { catalog })
  } finally { rmSync(root, { recursive: true, force: true }) }
}
const app = body => ({ 'src/a.tsx': `import { Button, Icon, Chip } from '@weft/warp'\n${body}` })
const names = r => [...r.names].sort()

test('a literal', () => expect(names(scan(app(`export const A = () => <Icon name="check" />`)))).toEqual(['check']))
test('a warp icon prop', () => expect(names(scan(app(`export const A = () => <Button icon="search" />`)))).toEqual(['search']))
test('a conditional', () => expect(names(scan(app(`export const A = ({ on }) => <Icon name={on ? 'check' : 'x'} />`)))).toEqual(['check', 'x']))
test('a variable', () => expect(names(scan(app(`const n = 'bell'\nexport const A = () => <Icon name={n} />`)))).toEqual(['bell']))
test('a map over a static list', () => {
  const r = scan(app(`const L = ['check', 'x']\nexport const A = () => <div>{L.map(n => <Icon name={n} />)}</div>`))
  expect(names(r)).toEqual(['check', 'x']); expect(r.dynamic).toEqual([])
})
test('a map over objects, destructured', () => {
  const r = scan(app(`const L = [{ i: 'bell' }, { i: 'mail' }]\nexport const A = () => <div>{L.map(({ i }) => <Icon name={i} />)}</div>`))
  expect(names(r)).toEqual(['bell', 'mail'])
})
test('a lookup table', () => {
  const r = scan(app(`const T = { a: 'check', b: 'x' }\nexport const A = ({ k }) => <Icon name={T[k]} />`))
  expect(names(r)).toEqual(['check', 'x']); expect(r.dynamic).toEqual([])
})
test('across a component boundary', () => {
  const r = scan({ 'src/a.tsx': `import { Row } from './row'\nexport const A = () => <><Row glyph="bell" /><Row glyph="mail" /></>`, 'src/row.tsx': `import { Icon } from '@weft/warp'\nexport function Row({ glyph }) { return <Icon name={glyph} /> }` })
  expect(names(r)).toEqual(['bell', 'mail']); expect(r.dynamic).toEqual([])
})
test('across a file, through an import', () => {
  const r = scan({ 'src/a.tsx': `import { Icon } from '@weft/warp'\nimport { NAV } from './nav'\nexport const A = () => <div>{NAV.map(n => <Icon name={n.icon} />)}</div>`, 'src/nav.ts': `export const NAV = [{ icon: 'home' }, { icon: 'mail' }]` })
  expect(names(r)).toEqual(['home', 'mail'])
})
test('object data handed to warp', () => expect(names(scan(app(`export const O = [{ value: 1, icon: 'pin' }]\nexport const A = () => <Chip />`)))).toEqual(['pin']))
test('an unrelated icon key that names nothing is left alone', () => expect(scan(app(`export const O = { icon: 'nope-not-one' }`)).unknown).toEqual([]))

test('a name from data is dynamic, with where it happened, and legal', () => {
  const r = scan(app(`export const A = ({ row }) => <Icon name={load(row)} />\nexport const B = () => <A row={1} />`))
  expect(r.unknown).toEqual([]); expect(r.dynamic).toHaveLength(1); expect(r.dynamic[0]).toMatchObject({ file: 'src/a.tsx', line: 2 })
})
test('an unknown literal is an error with a suggestion, at the spot', () => {
  const [u] = scan(app(`export const A = () => <Icon name="chekc" />`)).unknown
  expect(u).toMatchObject({ name: 'chekc', suggest: 'check', file: 'src/a.tsx', line: 2 })
})
test('closest prefers a near name', () => expect(closest('serach', catalog)).toBe('search'))

test('stops: balanced alone unless the app asks', () => {
  expect([...scan(app('')).stops]).toEqual(['balanced'])
  expect([...scan({ ...app(''), 'index.html': '<html data-expression="vivid">' }).stops].sort()).toEqual(['balanced', 'vivid'])
  expect(scan(app(`export const A = ({ e }) => <div data-expression={load(e)} />`)).stops.size).toBe(3)
  expect(scan(app(`document.documentElement.setAttribute('data-expression', pick())`)).stops.size).toBe(3)
})

test('the names module holds those names, and the pack only when a name escaped', () => {
  const plain = namesModule(['check']), lazy = namesModule(['check'], { lazy: true })
  expect(plain).toContain('CheckIcon'); expect(plain).not.toContain('import(')
  expect(lazy).toContain("import('@weft/icons/all')")
})
test('<Icon name> becomes the same element a named import gives', () => {
  const out = rewrite(`import { Icon } from '@weft/warp'\nexport const A = () => <Icon name="arrow-right" label="Next" />`, 'a.tsx', catalog)
  expect(out).toContain('<ArrowRightIcon  label="Next" />'); expect(out).toContain("import { ArrowRightIcon } from '@weft/icons'")
})
test('rewrite refuses an unknown literal, in dev too', () => {
  expect(() => rewrite(`import { Icon } from '@weft/warp'\nconst a = <Icon name="chekc" />`, 'a.tsx', catalog)).toThrow(/I001 no icon 'chekc', did you mean 'check'/)
})
test('a variant flag picks the export', () => {
  const out = rewrite(`import { Icon } from '@weft/warp'\nexport const A = () => <Icon name="bell" hollow />`, 'a.tsx', catalog)
  expect(out).toContain('<BellIconHollow'); expect(out).not.toContain('hollow />')
})
test('a variant ships only itself', () => expect(names(scan(app(`export const A = () => <Icon name="bell" hollow />`)))).toEqual(['bell:hollow']))
test('a variant flag it cannot read may be either', () => expect(names(scan(app(`export const A = ({ h }) => <Icon name="bell" hollow={h} />`)))).toEqual(['bell', 'bell:hollow']))
test('a tier prop keeps that stop', () => expect([...scan(app(`export const A = () => <Icon name="bell" tier="vivid" />`)).stops].sort()).toEqual(['balanced', 'vivid']))
test('one stop drops the switch and the other drawings', () => {
  const src = `import '../tiers.css'\nicon('<path data-t="o" d="M1"/><path data-t="v" data-p="" d="M4"/>')`
  expect(trimTiers(src, new Set(['balanced']))).toBe(`icon('<path d="M1"/>')`)
})
test('a dynamic name is left alone', () => expect(rewrite(`import { Icon } from '@weft/warp'\nconst a = n => <Icon name={n} />`, 'a.tsx', catalog)).toBeNull())
test('trimTiers keeps what the stops show', () => {
  const src = `icon('<path data-t="o" d="M1"/><path data-t="q" d="M2"/><path data-t="b" d="M3"/><path data-t="v" d="M4"/>')`
  expect(trimTiers(src, new Set(['quiet', 'balanced']))).toBe(`icon('<path data-t="o" d="M1"/><path data-t="q" d="M2"/><path data-t="b" d="M3"/>')`)
  expect(trimTiers(src, new Set(['balanced', 'vivid']))).toBe(`icon('<path data-t="o" d="M1"/><path data-t="b" d="M3"/><path data-t="v" d="M4"/>')`)
})

const pack = body => ({ 'src/a.tsx': `import Icons from '@weft/icons'\n${body}` })
test('a pack member is that icon', () => expect(names(scan(pack(`export const A = () => <Icons.Bell />`)))).toEqual(['bell']))
test('a pack variant', () => expect(names(scan(pack(`export const A = () => <Icons.ArrowRightHollow />`)))).toEqual(['arrow-right:hollow']))
test('a namespace import works the same', () => expect(names(scan({ 'src/a.tsx': `import * as Icons from '@weft/icons'\nexport const A = () => <Icons.BellIcon />` }))).toEqual(['bell']))
test('an unknown pack member is an error', () => expect(scan(pack(`export const A = () => <Icons.Bel />`)).unknown[0]).toMatchObject({ name: 'Bel', suggest: 'Bell' }))
test('a bounded pack lookup ships that set', () => {
  const r = scan(pack(`export const A = ({ on }) => { const C = Icons[on ? 'Bell' : 'Mail']; return <C /> }`))
  expect(names(r)).toEqual(['bell', 'mail']); expect(r.dynamic).toEqual([])
})
test('an open pack lookup is dynamic, and legal', () => {
  const r = scan(pack(`export const A = ({ n }) => { const C = Icons[pick(n)]; return <C /> }`))
  expect(r.dynamic).toHaveLength(1); expect(r.unknown).toEqual([])
})
test('the pack passed as a value is reported', () => expect(scan(pack(`export const A = () => use(Icons)`)).escaped).toHaveLength(1))
test('a default import of the pack becomes the namespace, so members shake', () => {
  const out = rewrite(`import Icons from '@weft/icons'\nexport const A = () => <Icons.Bell />`, 'a.tsx', catalog)
  expect(out).toContain("import * as Icons from '@weft/icons'")
})
test('an open lookup goes through the names module', () => {
  const out = rewrite(`import Icons from '@weft/icons'\nexport const A = n => Icons[n]`, 'a.tsx', catalog)
  expect(out).toContain('__icon(n)'); expect(out).toContain("import { pack as __icon } from '@weft/icons/names'")
})
test('rewrite refuses an unknown member', () => expect(() => rewrite(`import Icons from '@weft/icons'\nconst a = <Icons.Bel />`, 'a.tsx', catalog)).toThrow(/I001 no icon 'Bel', did you mean 'Bell'/))
test('a remote source fetches singles, with no pack in the build', () => {
  const m = namesModule(['check'], { source: 'https://cdn.example.com/icons/' })
  expect(m).toContain('remote("https://cdn.example.com/icons/")'); expect(m).not.toContain('@weft/icons/all')
})
test('publish writes each variant as a static file, and uploads nothing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'icons-pub-'))
  try {
    const out = await publish(dir)
    expect(out.files).toBe(out.icons * 4)
    expect(readFileSync(join(dir, 'bell.hollow.svg'), 'utf8')).toContain('<svg xmlns=')
    expect(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')).icons).toContain('bell')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
test('findings: unknown is an error code, dynamic and escaped are info codes', () => {
  const root = mkdtempSync(join(tmpdir(), 'icons-find-'))
  try {
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src/a.tsx'), `import { Icon } from '@weft/warp'\nimport * as I from '@weft/icons'\nexport const A = ({ r }) => <><Icon name="chekc" /><Icon name={load(r)} />{use(I)}</>`)
    expect(findings(root).map(f => f.code).sort()).toEqual(['I001', 'I002', 'I003'])
  } finally { rmSync(root, { recursive: true, force: true }) }
})
