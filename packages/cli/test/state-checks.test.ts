// S001 and S012 in `kerf check` (research 29 §4), on a copy of the v3 reference app with planted files.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { check } from '../src/check.mjs'
import { project } from './helpers.mjs'

const server = {
  'src/server/notes.ts':
    "import { mutation, query } from '@kerf-js/start'\nexport const listNotes = query({ run: () => [] })\nexport const getNote = query({ run: () => ({ id: 1 }) })\nexport const addNote = mutation({ run: () => 1 })\nexport const plain = () => []\n",
}
const s = (r: Awaited<ReturnType<typeof check>>) =>
  r.diagnostics
    .filter((d) => ['S001', 'S012'].includes(d.code))
    .map((d) => [d.code, d.file, d.span[0]])
const line = (name: string, body: string): [string, string] => [
  `src/state/${name}.ts`,
  `import { listNotes, getNote, plain } from '../server/notes'\nimport { defineState, state, watch, derived } from '@kerf-js/core'\n${body}\n`,
]

describe('S001', () => {
  it.each([
    [
      'handle value',
      'export const a = defineState(() => { const q = listNotes(); const b = state(q.value); return { b } })',
    ],
    ['call value', 'export const a = defineState(() => ({ b: state(listNotes().value) }))'],
    [
      'fallback',
      'export const a = defineState(() => { const q = listNotes(); return { b: state(q.value ?? []) } })',
    ],
    [
      'a mapped copy',
      'export const a = defineState(() => { const q = listNotes(); return { b: state(q.value.filter(Boolean)) } })',
    ],
    [
      'a spread',
      'export const a = defineState(() => { const q = getNote(); return { b: state({ ...q.value }) } })',
    ],
    [
      'a local',
      'export const a = defineState(() => { const q = listNotes(); const v = q.value; return { b: state(v) } })',
    ],
    ['fetch', 'export async function f(b) { b.value = await listNotes.fetch() }'],
    ['set', 'export function f(b) { b.set(() => listNotes().value) }'],
    ['live', 'export const a = defineState(() => ({ b: state(listNotes.live().value) }))'],
    [
      'a watch parameter',
      'export const a = defineState(() => { const b = state([]); const q = listNotes(); watch(() => q.value, v => { b.value = v }); return { b } })',
    ],
    ['a then parameter', 'export function f(b) { listNotes.fetch().then(v => { b.value = v }) }'],
  ])('flags %s', async (_, body) => {
    const [file, text] = line('a', body)
    expect(s(await check(project({ ...server, [file]: text })))).toEqual([['S001', file, 3]])
  })

  it.each([
    [
      'a picked primitive',
      'export const a = defineState(() => { const q = getNote(); return { id: state(q.value?.id) } })',
    ],
    [
      'a derived',
      'export const a = defineState(() => { const q = listNotes(); return { n: derived(() => q.value) } })',
    ],
    [
      'untrack',
      'export const a = defineState(() => { const q = listNotes(); return { b: state(untrack(() => q.value)) } })',
    ],
    [
      'state.linked with a key',
      'export const a = defineState(() => { const q = getNote(); return { b: state.linked(() => q.value, { key: () => q.value?.id }) } })',
    ],
    [
      "a helper that isn't a query",
      'export const a = defineState(() => ({ b: state(plain().value) }))',
    ],
    [
      'a same-named value in another function',
      'export function f() { const v = listNotes().value; return v }\nexport const a = defineState(() => { const v = 1; return { b: state(v) } })',
    ],
  ])('leaves %s alone', async (_, body) => {
    const [file, text] = line('a', body)
    expect(s(await check(project({ ...server, [file]: text })))).toEqual([])
  })
})

describe('S012', () => {
  it('flags `state.linked` over a query with no key, and its unsafe fix adds one', async () => {
    const [file, text] = line(
      'a',
      'export const a = defineState(() => { const q = getNote(); return { b: state.linked(() => q.value) } })',
    )
    const dir = project({ ...server, [file]: text })
    const r = await check(dir)
    expect(s(r)).toEqual([['S012', file, 3]])
    const d = r.diagnostics.find((x) => x.code === 'S012')
    expect(d.fix.safe).toBe(false)
    const src = readFileSync(join(dir, file), 'utf8')
    const e = d.fix.edits[0]
    expect(src.slice(0, e.offset[0]) + e.text + src.slice(e.offset[1])).toContain(
      'state.linked(() => q.value, { key: () => q.value?.id })',
    )
  })

  it('leaves `state.linked` over local state alone', async () => {
    const [file, text] = line(
      'a',
      'export const a = defineState(() => { const n = state(1); return { b: state.linked(() => n.value) } })',
    )
    expect(s(await check(project({ ...server, [file]: text })))).toEqual([])
  })
})

describe('X037', () => {
  const page = (name: string, body: string): [string, string] => [
    `src/routes/x037-${name}.tsx`,
    `import { Boundary, resource as load } from '@kerf-js/core'\nimport { listNotes } from '../server/notes'\n${body}\n`,
  ]
  const flagged = {
    query: page(
      'query',
      'export default function A() {\n  const notes = listNotes()\n  return <Boundary pending={<p>…</p>}><ul>{(notes.value ?? []).map(n => <li key={n}>{n}</li>)}</ul></Boundary>\n}',
    ),
    live: page(
      'live',
      'export default function A() {\n  const notes = listNotes.live()\n  return <main><Boundary pending={<p>…</p>}><Count n={notes} /></Boundary></main>\n}\nfunction Count(props: { n: unknown }) { return <p>{String(props.n)}</p> }',
    ),
    resource: page(
      'resource',
      'export const A = () => {\n  const r = load(() => Promise.resolve(1))\n  return <Boundary pending={<p>…</p>}><p>{r.value}</p></Boundary>\n}',
    ),
  }
  const quiet = {
    inside: page(
      'inside',
      'function List() {\n  const notes = listNotes()\n  return <ul>{(notes.value ?? []).map(n => <li key={n}>{n}</li>)}</ul>\n}\nexport default function A() { return <Boundary pending={<p>…</p>}><List /></Boundary> }',
    ),
    outside: page(
      'outside',
      'export default function A() {\n  const notes = listNotes()\n  return <div><p>{notes.value?.length}</p><Boundary pending={<p>…</p>}><b /></Boundary></div>\n}',
    ),
    fallback: page(
      'fallback',
      'export default function A() {\n  const notes = listNotes()\n  return <Boundary pending={<p>{notes.pending}</p>}><b /></Boundary>\n}',
    ),
    other: page(
      'other',
      'export default function A() {\n  const notes = [1]\n  return <Boundary pending={<p>…</p>}><p>{notes.length}</p></Boundary>\n}',
    ),
  }

  it('flags a resource or query made beside the Boundary that shows it, and nothing else', async () => {
    const r = await check(
      project({
        ...server,
        ...Object.fromEntries([...Object.values(flagged), ...Object.values(quiet)]),
      }),
    )
    const x = r.diagnostics
      .filter((d) => d.code === 'X037')
      .map((d) => [d.file, d.span[0]] as [string, number])
      .toSorted((a, b) => a[0].localeCompare(b[0]))
    expect(x).toEqual(
      Object.values(flagged)
        .map(([f]) => [f, 4] as [string, number])
        .toSorted((a, b) => a[0].localeCompare(b[0])),
    )
    expect(r.diagnostics.find((d) => d.code === 'X037').severity).toBe('warning')
  })
})
