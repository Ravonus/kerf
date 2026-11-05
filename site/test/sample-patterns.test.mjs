import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { markdownFences } from '../scripts/sample-width.mjs'
import { scanPatternSource } from '../scripts/sample-patterns.mjs'

const rules = (source) => scanPatternSource(source, 'fixture.tsx').map((finding) => finding.rule)

test('three or more JSX attributes occupy their own lines', () => {
  for (const source of [
    'const x = <Card a={1} b={2} c={3} />',
    'const x = <Card a={1}\n b={2}\n c={3}\n/>',
    'const x = <Card\n a={1} b={2}\n c={3}\n/>',
    'const x = <Card\n a={1}\n b={2}\n c={3} />',
  ])
    assert.deepEqual(rules(source), ['three-plus attributes share a line or closing tag'])
  assert.deepEqual(rules('const x = <Card\n a={1}\n b={2}\n c={3}\n/>'), [])
  assert.deepEqual(rules('const x = <Card a={1} b={2} />'), [])
})

test('JSX event handlers name multi-statement work', () => {
  assert.deepEqual(rules('const x = <Button onClick={() => { a(); b() }} />'), [
    'multi-statement JSX handler',
  ])
  assert.deepEqual(rules('const x = <Button onClick={() => { a() }} />'), [])
  assert.deepEqual(rules('const x = <Button onClick={handleClick} />'), [])
  assert.deepEqual(rules('const x = <Button onClick={function () { a(); b() }} />'), [
    'multi-statement JSX handler',
  ])
  assert.deepEqual(rules('const x = <Button onClick={(() => { a(); b() })} />'), [
    'multi-statement JSX handler',
  ])
})

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const require = createRequire(new URL('../../packages/cli/package.json', import.meta.url))
const typescriptModules = dirname(dirname(require.resolve('typescript/package.json')))

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'weft-pattern-gate-'))
  const put = (path, text) => {
    const dest = join(dir, path)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, text)
  }
  const copies = [
    'scripts/check.mjs',
    'scripts/jobs.mjs',
    'scripts/quality/lengths.mjs',
    'scripts/quality/length-diagnostics.mjs',
    'scripts/quality/length-baseline.mjs',
    'scripts/quality/length-rust.mjs',
    'scripts/quality/length-metrics.mjs',
    'site/scripts/content.mjs',
    'site/scripts/sample-width.mjs',
    'site/scripts/sample-patterns.mjs',
    'site/scripts/content/displayed.mjs',
  ]
  for (const path of copies) {
    const dest = join(dir, path)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(join(root, path), dest)
  }
  for (const path of [
    'packages/.keep',
    'evals/.keep',
    'site/src/demos/.keep',
    'site/content/learn/.keep',
    'benchmarks/arena/graph/main.tsx',
    'site/src/routes/examples/slow.tsx',
  ])
    put(path, '')
  put(
    'site/scripts/content/context.mjs',
    `
    import { reportSampleWidths } from '../sample-width.mjs'
    import { resolve } from 'node:path'
    export const repo = resolve('.'), site = resolve('site'), highlight = () => ''
    export { reportSampleWidths }
  `,
  )
  put(
    'site/scripts/content/docs-catalog.mjs',
    `export const write = () => {}, numbers = () => ({}), MOVED = {}`,
  )
  put(
    'site/scripts/content/markdown.mjs',
    `export const buildReference = async () => ({nav:[], pages:[]})`,
  )
  put(
    'site/scripts/content/learn-search.mjs',
    `
    export const buildLearn = () => ({nav:[], pages:[]})
    export const buildSearch = () => ({counts:{t0:0,t1:0},t0:{br:0},t1:{br:0}})
  `,
  )
  put('site/scripts/content/toolkit.mjs', 'export const buildToolkit = () => []')
  put(
    'site/scripts/content/art.mjs',
    `
    export const buildIcons = () => [], buildArt = () => {}, buildShowcase = () => {},
      buildSpeed = () => {}, buildLlms = () => {}
  `,
  )
  return { dir, put }
}

function runEntry(dir, entry) {
  const env = {
    ...process.env,
    NODE_PATH: [typescriptModules, process.env.NODE_PATH].filter(Boolean).join(delimiter),
  }
  delete env.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, entry, { cwd: dir, env, encoding: 'utf8' })
}

test('both real entry paths reject bad samples and pass clean fixtures', () => {
  const { dir, put } = fixture()
  const entries = [['scripts/check.mjs', '--only=sample-width'], ['site/scripts/content.mjs']]
  const cases = [
    {
      path: 'site/content/learn/probe.md',
      text: `\`\`\`tsx\n${'x'.repeat(71)}\n\`\`\`\n`,
      expected: 'limit 70',
    },
    { path: 'site/src/demos/probe.tsx', text: `// ${'x'.repeat(56)}\n`, expected: 'limit 58' },
    {
      path: 'site/content/learn/probe.md',
      text: '```tsx\nconst x = <A a={1} b={2} c={3} />\n```\n',
      expected: 'three-plus attributes',
    },
    {
      path: 'site/content/learn/probe.md',
      text: '```tsx\nconst x = <A onClick={() => { a(); b() }} />\n```\n',
      expected: 'multi-statement JSX handler',
    },
    {
      path: 'site/content/learn/probe.md',
      text: '```tsx\nconst x = <>{props.items.map(x => x)}</>\n```\n',
      expected: 'direct props field map in JSX',
    },
    {
      path: 'site/src/demos/probe.tsx',
      text: 'const x = <A a={1} b={2} c={3} />\n',
      expected: 'three-plus attributes',
    },
    {
      path: 'site/src/demos/probe.tsx',
      text: 'const x = <A onClick={() => { a(); b() }} />\n',
      expected: 'multi-statement JSX handler',
    },
    {
      path: 'site/src/demos/probe.tsx',
      text: 'const x = <>{props.items.map(x => x)}</>\n',
      expected: 'direct props field map in JSX',
    },
  ]
  try {
    for (const item of cases) {
      put(item.path, item.text)
      for (const entry of entries) {
        const bad = runEntry(dir, entry)
        const output = bad.stdout + bad.stderr
        assert.notEqual(bad.status, 0, `${entry[0]} must reject ${item.expected}`)
        const line = item.path.endsWith('.md') ? 2 : 1
        assert.ok(output.includes(`${item.path}:${line}:`), output)
        assert.ok(output.includes(item.expected), output)
      }
      put(item.path, '')
      for (const entry of entries) {
        const clean = runEntry(dir, entry)
        assert.equal(clean.status, 0, clean.stdout + clean.stderr)
        assert.match(clean.stdout, /\[sample-width\] 0 violations/)
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('JSX does not map directly from props fields', () => {
  assert.deepEqual(rules('const x = <ul>{props.items.map(item => <li>{item}</li>)}</ul>'), [
    'direct props field map in JSX',
  ])
  assert.deepEqual(
    rules('const { items } = props\nconst x = <ul>{items.map(item => <li>{item}</li>)}</ul>'),
    [],
  )
  assert.deepEqual(rules('const x = props.items.map(item => item)'), [])
  assert.deepEqual(rules('const x = items.filter(Boolean).map(item => item)'), [])
  assert.deepEqual(rules('const x = <>{items.map(x => <li>{x}</li>)}{n && <p />}</>'), [])
  assert.deepEqual(rules('const x = <>{props.items?.map(x => x)}</>'), [
    'direct props field map in JSX',
  ])
})

test('quoted and list fenced JSX keeps the original line numbers', () => {
  const text = ['> - ```tsx', '>   const x = <Card a={1} b={2} c={3} />', '>   ```'].join('\n')
  const [fence] = markdownFences(text)
  const results = scanPatternSource(
    fence.lines.map((line) => line.content).join('\n'),
    'doc.md',
    fence.lines[0].line - 1,
  )
  assert.deepEqual(results, [
    { file: 'doc.md', line: 2, rule: 'three-plus attributes share a line or closing tag' },
  ])
})

test('pitfall fences are checked without changing their teaching bugs', () => {
  const text = [
    ':::pitfall',
    '```tsx',
    'const x = <>{props.items.map(x => x)}</>',
    '```',
    ':::',
  ].join('\n')
  const [fence] = markdownFences(text)
  assert.deepEqual(
    scanPatternSource(fence.lines.map((line) => line.content).join('\n'), 'doc.md', 2),
    [{ file: 'doc.md', line: 3, rule: 'direct props field map in JSX' }],
  )
})
