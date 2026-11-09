import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { GROUPS } from '../src/toolkit/docs/index.ts'
import {
  attachThemeRows,
  buildThemePages,
  checkGenerated,
  checkInventory,
  checkThemePages,
  trackedDocs,
} from '../scripts/theme-pages.mjs'

const schema = JSON.parse(
  readFileSync(new URL('../../packages/warp-core/theme.schema.json', import.meta.url), 'utf8'),
)
const names = GROUPS.flatMap((group) => group.docs.map((doc) => doc.component))
const overrides = Object.fromEntries(
  GROUPS.flatMap((group) => group.docs)
    .filter((doc) => doc.themeScopes)
    .map((doc) => [doc.component, doc.themeScopes]),
)
const snapshot = () => buildThemePages(schema, names, overrides)
const bytes = (value) => `${JSON.stringify(value, null, 2)}\n`

test('covers the tracked component inventory and all schema candidates', () => {
  const n = checkThemePages()
  const trackedFiles = execFileSync('git', ['ls-files', '--', 'site/src/toolkit/docs'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
  const declarations = execFileSync(
    'git',
    ['grep', '-n', '-E', 'component:[[:space:]]*[\'"]', '--', 'site/src/toolkit/docs'],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
  assert.equal(n.files, trackedFiles.length)
  assert.equal(n.tracked, declarations.length)
  assert.equal(n.pages, names.length)
  assert.equal(n.rows, schema.records.length)
  assert.equal(Object.values(snapshot().parts).flat().length, schema.records.length)
  assert.equal(trackedDocs().entries.length, names.length)
})

test('rejects missing, extra and duplicate component declarations', () => {
  assert.throws(() => checkInventory(names.slice(1), names), /differ/)
  assert.throws(() => checkInventory([...names, 'Extra'], names), /differ/)
  assert.throws(() => checkInventory([...names, names[0]], names), /differ/)
})

test('detects missing or extra candidates, changed fallbacks and a missing component', () => {
  const expected = bytes(snapshot())
  for (const mutate of [
    (data) => data.components.pop(),
    (data) => data.parts.button.pop(),
    (data) => data.parts.button.push({ ...data.parts.button[0], property: 'invented' }),
    (data) => {
      data.parts.button[0].default = 'changed'
    },
  ]) {
    const candidate = snapshot()
    mutate(candidate)
    assert.throws(() => checkGenerated(expected, bytes(candidate)), /stale/)
  }
  checkGenerated(expected, bytes(snapshot()))
})

test('labels every row as a candidate and preserves recorded or unclassified defaults', () => {
  const rows = Object.values(snapshot().parts).flat()
  assert.ok(rows.every((row) => row.status.startsWith('Candidate · ')))
  assert.ok(rows.some((row) => row.default === 'Not classified'))
  assert.ok(rows.some((row) => row.default.includes('var(--warp-')))
  assert.ok(rows.some((row) => row.config === 'parts.button.bg'))
  assert.ok(rows.some((row) => row.config.startsWith('parts["status-light"].')))
  assert.ok(rows.some((row) => row.config.startsWith('parts["text/body"].')))
  assert.ok(rows.some((row) => row.config.includes('system.text.body.family')))
})

test('attaches candidate rows to every actual component page by its source scope', () => {
  const data = snapshot()
  const pages = Object.fromEntries(data.components.map(({ name, slug }) => [slug, { name, slug }]))
  pages.button.scope = 'button'
  pages['connection-pill'].scope = 'pill'
  pages.text.scope = 'text'
  const attached = attachThemeRows(pages, data)
  assert.equal(Object.keys(attached).length, names.length)
  assert.deepEqual(attached.button.theming, data.parts.button)
  assert.deepEqual(attached['connection-pill'].theming, data.parts.pill)
  assert.ok(attached.text.theming.some((row) => row.part === 'text/body'))
  assert.ok(attached.heading.theming.some((row) => row.part === 'text/title'))
  assert.ok(
    attached.heading.theming.every((row) =>
      ['text/display', 'text/title', 'text/heading', 'text/label'].includes(row.part),
    ),
  )
  assert.throws(
    () => buildThemePages(schema, names, { Heading: ['text/missing'] }),
    /Invalid theming scopes/,
  )
  const removed = { ...pages }
  delete removed.button
  assert.throws(() => attachThemeRows(removed, data), /differ/)
  const extra = { ...pages, extra: { name: 'Extra', slug: 'extra' } }
  assert.throws(() => attachThemeRows(extra, data), /differ/)
})

test('site content generation checks and attaches the candidate data', () => {
  const source = readFileSync(new URL('../scripts/content.mjs', import.meta.url), 'utf8')
  assert.match(source, /checkThemePages\(repo\)/)
  assert.match(source, /attachThemeRows\(toolkitPages, theming\)/)
})
