import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanMarkdown, scanSamples, scanSource } from '../scripts/sample-width.mjs'

await test('only fenced code is measured, at the boundary', () => {
  const text = [
    'x'.repeat(71),
    '```js',
    'x'.repeat(70),
    'x'.repeat(71),
    '```',
    'x'.repeat(71),
  ].join('\n')
  assert.deepEqual(scanMarkdown(text), [{ line: 4, width: 71, limit: 70 }])
})

await test('indented, list, quote and callout fences measure rendered code', () => {
  const long = 'x'.repeat(71)
  const text = [
    '  ```',
    `  ${long}`,
    '  ```',
    '- ```',
    `  ${long}`,
    '  ```',
    '> ```',
    `> ${long}`,
    '> ```',
    ':::note',
    '~~~js',
    long,
    '~~~',
    ':::',
  ].join('\n')
  assert.deepEqual(
    scanMarkdown(text).map((v) => v.line),
    [2, 5, 8, 12],
  )
})

await test('fences strip only the quote depth they opened in', () => {
  const text = [
    '```tsx',
    `>${'x'.repeat(70)}`,
    '```',
    '> > ```tsx',
    `> > >${'x'.repeat(70)}`,
    '> > ```',
    '> - ```tsx',
    `>   ${'x'.repeat(71)}`,
    '>   ```',
  ].join('\n')
  assert.deepEqual(scanMarkdown(text), [
    { line: 2, width: 71, limit: 70 },
    { line: 5, width: 71, limit: 70 },
    { line: 8, width: 71, limit: 70 },
  ])
})

await test('split-pane sources use 58 columns', () => {
  assert.deepEqual(scanSource(`${'x'.repeat(58)}\n${'x'.repeat(59)}`), [
    { line: 2, width: 59, limit: 58 },
  ])
})

await test('repository scan includes canonical sources without generated copies or snapshots', () => {
  const root = mkdtempSync(join(tmpdir(), 'sample-width-'))
  try {
    const put = (path, content) => {
      const file = join(root, path)
      mkdirSync(join(file, '..'), { recursive: true })
      writeFileSync(file, content)
    }
    const md = `\`\`\`\n${'x'.repeat(71)}\n\`\`\`\n`
    for (const path of [
      'README.md',
      'packages/a/README.md',
      'packages/a/docs/a.md',
      'docs/a.md',
      'site/content/learn/a.md',
      'site/public/reference/a.md',
      'packages/a/__snapshots__/a.md',
    ])
      put(path, md)
    put('site/src/demos/a.tsx', 'x'.repeat(59))
    put('site/src/toolkit/examples/a.tsx', 'x'.repeat(59))
    put('benchmarks/arena/graph/main.tsx', 'x'.repeat(59))
    put('site/src/routes/examples/slow.tsx', 'x'.repeat(59))
    put('site/src/toolkit/world.ts', 'x'.repeat(59))
    put('site/src/toolkit/world/shared/a.ts', 'x'.repeat(59))
    const found = scanSamples(root)
    assert.equal(found.length, 11)
    assert.ok(found.some((v) => v.file === 'benchmarks/arena/graph/main.tsx'))
    assert.ok(found.some((v) => v.file === 'site/src/routes/examples/slow.tsx'))
    assert.ok(found.some((v) => v.file === 'site/src/toolkit/world.ts'))
    assert.ok(found.some((v) => v.file === 'site/src/toolkit/world/shared/a.ts'))
    assert.ok(!found.some((v) => /public|snapshots/.test(v.file)))
    rmSync(join(root, 'benchmarks/arena/graph/main.tsx'))
    assert.throws(() => scanSamples(root), /ENOENT/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
