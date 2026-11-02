// S001 and S012 in `weft check` (research 29 §4), on a copy of the v3 reference app with planted files.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { check } from '../src/check.mjs'
import { project } from './helpers.mjs'

const server = {
  'src/server/notes.ts': "import { mutation, query } from '@weft-js/start'\nexport const listNotes = query({ run: () => [] })\nexport const getNote = query({ run: () => ({ id: 1 }) })\nexport const addNote = mutation({ run: () => 1 })\nexport const plain = () => []\n",
}
const s = r => r.diagnostics.filter(d => ['S001', 'S012'].includes(d.code)).map(d => [d.code, d.file, d.span[0]])
const line = (name, body) => [`src/state/${name}.ts`, `import { listNotes, getNote, plain } from '../server/notes'\nimport { defineState, state, watch, derived } from '@weft-js/core'\n${body}\n`]

describe('S001', () => {
  it.each([
    ['handle value', 'export const a = defineState(() => { const q = listNotes(); const b = state(q.value); return { b } })'],
    ['call value', 'export const a = defineState(() => ({ b: state(listNotes().value) }))'],
    ['fallback', 'export const a = defineState(() => { const q = listNotes(); return { b: state(q.value ?? []) } })'],
    ['a mapped copy', 'export const a = defineState(() => { const q = listNotes(); return { b: state(q.value.filter(Boolean)) } })'],
    ['a spread', 'export const a = defineState(() => { const q = getNote(); return { b: state({ ...q.value }) } })'],
    ['a local', 'export const a = defineState(() => { const q = listNotes(); const v = q.value; return { b: state(v) } })'],
    ['fetch', 'export async function f(b) { b.value = await listNotes.fetch() }'],
    ['set', 'export function f(b) { b.set(() => listNotes().value) }'],
    ['live', 'export const a = defineState(() => ({ b: state(listNotes.live().value) }))'],
    ['a watch parameter', 'export const a = defineState(() => { const b = state([]); const q = listNotes(); watch(() => q.value, v => { b.value = v }); return { b } })'],
    ['a then parameter', 'export function f(b) { listNotes.fetch().then(v => { b.value = v }) }'],
  ])('flags %s', async (_, body) => {
    const [file, text] = line('a', body)
    expect(s(await check(project({ ...server, [file]: text })))).toEqual([['S001', file, 3]])
  })

  it.each([
    ['a picked primitive', 'export const a = defineState(() => { const q = getNote(); return { id: state(q.value?.id) } })'],
    ['a derived', 'export const a = defineState(() => { const q = listNotes(); return { n: derived(() => q.value) } })'],
    ['untrack', 'export const a = defineState(() => { const q = listNotes(); return { b: state(untrack(() => q.value)) } })'],
    ['state.linked with a key', 'export const a = defineState(() => { const q = getNote(); return { b: state.linked(() => q.value, { key: () => q.value?.id }) } })'],
    ['a helper that isn\'t a query', 'export const a = defineState(() => ({ b: state(plain().value) }))'],
    ['a same-named value in another function', 'export function f() { const v = listNotes().value; return v }\nexport const a = defineState(() => { const v = 1; return { b: state(v) } })'],
  ])('leaves %s alone', async (_, body) => {
    const [file, text] = line('a', body)
    expect(s(await check(project({ ...server, [file]: text })))).toEqual([])
  })
})

describe('S012', () => {
  it('flags `state.linked` over a query with no key, and its unsafe fix adds one', async () => {
    const [file, text] = line('a', 'export const a = defineState(() => { const q = getNote(); return { b: state.linked(() => q.value) } })')
    const dir = project({ ...server, [file]: text })
    const r = await check(dir)
    expect(s(r)).toEqual([['S012', file, 3]])
    const d = r.diagnostics.find(x => x.code === 'S012')
    expect(d.fix.safe).toBe(false)
    const src = readFileSync(join(dir, file), 'utf8')
    const e = d.fix.edits[0]
    expect(src.slice(0, e.offset[0]) + e.text + src.slice(e.offset[1])).toContain('state.linked(() => q.value, { key: () => q.value?.id })')
  })

  it('leaves `state.linked` over local state alone', async () => {
    const [file, text] = line('a', 'export const a = defineState(() => { const n = state(1); return { b: state.linked(() => n.value) } })')
    expect(s(await check(project({ ...server, [file]: text })))).toEqual([])
  })
})
