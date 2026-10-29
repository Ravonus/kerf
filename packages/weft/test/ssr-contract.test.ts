// Helper contract for SSR and hydration (research 16 §6.3, research 18 §5): compile upstream's SSR and hydratable
// DOM fixture corpora at the pinned solidjs-compiler rev, exactly as weft does (dev and prod, hydratable or not),
// and check that every helper the output imports from weft/ssr or weft/dom exists. The DOM-mode contract for
// non-hydratable output is crates/weft-compiler/tests/helper_contract.rs.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import * as dom from 'weft/dom'
import * as ssr from 'weft/ssr'

const { transform } = createRequire(import.meta.url)('../compiler.cjs')
const crate = join(__dirname, '../../../crates/weft-compiler/Cargo.toml')

/** packages/babel-plugin/test of the pinned checkout, from cargo's own resolution. */
function corpus(): string {
  const meta = JSON.parse(execFileSync('cargo', ['metadata', '--format-version', '1', '--offline', '--manifest-path', crate], { encoding: 'utf8', maxBuffer: 1 << 28 }))
  const pkg = meta.packages.find((p: { name: string }) => p.name === 'solidjs-compiler')
  return join(dirname(pkg.manifest_path), '../babel-plugin/test')
}

function imports(prefix: string, options: object): Map<string, Map<string, string>> {
  const root = corpus()
  const by = new Map<string, Map<string, string>>() // module → helper → first fixture
  for (const dir of readdirSync(root).filter(d => d.startsWith(prefix))) {
    for (const c of readdirSync(join(root, dir))) {
      const file = join(root, dir, c, 'code.js')
      if (!existsSync(file)) continue
      for (const dev of [false, true]) {
        const out = transform(readFileSync(file, 'utf8'), { ...options, dev, sourceNames: dev, filename: file.replace(/\.js$/, '.jsx') })
        for (const m of (out.code ?? '').matchAll(/import \{([^}]*)\} from "(weft[^"]*)"/g)) {
          for (const s of m[1].split(',')) {
            const name = s.trim().split(/\s+as\s+/)[0]
            if (!name) continue
            if (!by.has(m[2])) by.set(m[2], new Map())
            if (!by.get(m[2])!.has(name)) by.get(m[2])!.set(name, `${dir}/${c}${dev ? ' (dev)' : ''}`)
          }
        }
      }
    }
  }
  return by
}

const missing = (helpers: Map<string, string> | undefined, mod: object) =>
  [...(helpers ?? [])].filter(([name]) => !(name in mod)).map(([name, where]) => `${name} (${where})`)

test('every helper SSR output imports exists in weft/ssr (hydratable and not)', () => {
  for (const hydratable of [false, true]) {
    const by = imports('__ssr', { generate: 'ssr', hydratable })
    expect([...by.keys()]).toEqual(['weft/ssr'])
    expect(by.get('weft/ssr')!.size).toBeGreaterThan(15)
    expect(missing(by.get('weft/ssr'), ssr)).toEqual([])
  }
}, 60_000)

// Helpers for spreads, refs and link claims that the compiler-hardening branch adds to weft/dom; remove the list
// once that branch is merged.
const PENDING_ELSEWHERE = ['applyRef', 'claimElement', 'getOwner', 'setAttributeNS', 'spread']

test('every helper hydratable DOM output imports exists in weft/dom', () => {
  const by = imports('__dom_hydratable', { hydratable: true })
  expect([...by.keys()]).toEqual(['weft/dom'])
  const gaps = missing(by.get('weft/dom'), dom).map(s => s.split(' ')[0])
  expect(gaps.filter(n => !PENDING_ELSEWHERE.includes(n))).toEqual([])
}, 60_000)
