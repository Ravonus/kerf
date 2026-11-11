// A route's `export const skeleton` is read from source, never run. A formatter writes a multi-line tree as `return (`
// and the tree, so the parentheses must not make a plain-markup skeleton unusable, local or imported.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, test } from 'vitest'
import { resolveImportedOverride, shapeOverride } from '../src/vite/shape-override.mjs'
import { skeletonExport } from '../src/vite/route-modules.mjs'

const root = mkdtempSync(join(tmpdir(), 'kerf-skeleton-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const write = (rel: string, code: string) => {
  const file = join(root, rel)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, code)
  return file
}

const tree = `(
    <section data-site="hero">
      <h1>Title</h1>
      <p data-part="lede">Words</p>
    </section>
  )`

test('a local skeleton returned in parentheses is used', () => {
  const file = write(
    'src/routes/index.tsx',
    `function HomeSkeleton() {\n  return ${tree}\n}\n\nexport const skeleton = HomeSkeleton\n\nexport default function Home() {\n  return <p>home</p>\n}\n`,
  )
  expect(skeletonExport(file)).toBe('custom')
  expect(shapeOverride(file)).toContain('<section data-site="hero">')
})

test('an imported skeleton returned in parentheses is used', async () => {
  const shared = write(
    'src/components/DocSkeleton.tsx',
    `export function DocSkeleton() {\n  return ${tree}\n}\n`,
  )
  const file = write(
    'src/routes/doc.tsx',
    `import { DocSkeleton } from '../components/DocSkeleton'\n\nexport const skeleton = DocSkeleton\n\nexport default function Doc() {\n  return <p>doc</p>\n}\n`,
  )
  const ctx = { resolve: () => Promise.resolve({ id: shared, external: false }) }
  const found = await resolveImportedOverride(ctx, file, root)
  expect(found?.file).toBe(shared)
  expect(found?.code).toContain('<section data-site="hero">')
})

test('a component in the tree still makes it unusable', () => {
  const file = write(
    'src/routes/bad.tsx',
    `import { Button } from 'kit'\n\nfunction BadSkeleton() {\n  return (\n    <div>\n      <Button />\n    </div>\n  )\n}\n\nexport const skeleton = BadSkeleton\n\nexport default function Bad() {\n  return <p>bad</p>\n}\n`,
  )
  expect(shapeOverride(file)).toBeUndefined()
  expect(skeletonExport(file)).toBe('unavailable')
})
