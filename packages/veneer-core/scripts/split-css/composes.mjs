// Which components each component is built from, so a part fence (parts.mjs) lets a component style the parts of the
// components it renders itself (SignaturePad's pad inside its Field, PrefsMatrix's checkboxes, SideNav's NavList)
// while still stopping it at a component an app puts inside it. Read from veneer's own sources: a file's literal
// `data-scope` values, and those of every veneer module it imports, transitively. Also from the spec: a rule that names
// a scope inside another (`[data-scope="table"] [data-scope="field"]`) says the outer one is built to hold it.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

const SCOPE =
  /data-scope(?:=|['"]?\s*:)\s*\{?\s*(?:[\w.]+\s*\?\?\s*)?['"]([a-z0-9-]+)['"]|\bscope[=:]\s*['"]([a-z0-9-]+)['"]/g
const IMPORT = /^\s*import\s+(?!type\b)[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/gm

function files(dir, out = []) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name)
    if (d.isDirectory()) files(p, out)
    else if (/\.(tsx?|mjs)$/.test(d.name) && !d.name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

function resolveImport(from, spec) {
  const base = resolve(dirname(from), spec)
  for (const c of [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    join(base, 'index.tsx'),
    join(base, 'index.ts'),
  ])
    if (existsSync(c) && /\.(tsx?|mjs)$/.test(c)) return c
  return null
}

/** { scope: Set(scopes it renders inside itself) } from veneer's component sources, or {} when they aren't here. */
export function fromSources(src) {
  src = resolve(src)
  if (!existsSync(src)) return {}
  const literal = new Map(),
    imports = new Map()
  for (const f of files(src)) {
    const text = readFileSync(f, 'utf8')
    literal.set(f, new Set([...text.matchAll(SCOPE)].map((m) => m[1] ?? m[2])))
    imports.set(f, [...text.matchAll(IMPORT)].map((m) => resolveImport(f, m[1])).filter(Boolean))
  }
  // a file's own scopes, and those of the components it imports: a component module renders one or two scopes; a
  // module with more is a catalog of helpers and says nothing about what this file renders
  const composes = {}
  for (const [f, own] of literal) {
    if (own.size > 6) continue // a catalog (theme-parts.mjs) lists scopes, it doesn't render them
    const inside = new Set(own)
    // two imports deep, so a component behind an index module (`./Field` → `./Field/shell`) counts
    const visit = (file, depth) => {
      for (const i of imports.get(file) ?? []) {
        const theirs = literal.get(i) ?? new Set()
        if (theirs.size > 3) continue
        for (const s of theirs) inside.add(s)
        if (depth < 2) visit(i, depth + 1)
      }
    }
    visit(f, 1)
    // the file's own component holds the rest; a scope it only renders beside them (TransportPicker's build-error
    // Alert) holds none of them. Named by the file (TransportPicker.tsx → transport), or every scope when none is
    const name = basename(f)
      .replace(/\.\w+$/, '')
      .toLowerCase()
    const named = [...own].filter((x) => name.startsWith(x.replaceAll('-', '')))
    for (const x of named.length ? named : own)
      for (const s of inside) if (s !== x) (composes[x] ??= new Set()).add(s)
  }
  return composes
}

/** Add `[data-scope="x"] … [data-scope="y"]` pairs named by the spec's own selectors. */
export function fromSelectors(composes, selectorTexts) {
  for (const text of selectorTexts)
    for (const piece of text.split(',')) {
      const scopes = [...piece.matchAll(/data-scope="([\w-]+)"/g)].map((m) => m[1])
      for (let i = 0; i < scopes.length; i++)
        for (let j = i + 1; j < scopes.length; j++)
          if (scopes[i] !== scopes[j]) (composes[scopes[i]] ??= new Set()).add(scopes[j])
    }
  return composes
}
