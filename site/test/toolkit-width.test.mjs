import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { readExamples, showExample } from '../scripts/toolkit.mjs'
import { scanSource } from '../scripts/sample-width.mjs'
import { formatImport } from '../scripts/toolkit/imports.mjs'

const ts = createRequire(new URL('../../packages/cli/package.json', import.meta.url))('typescript')
const printer = ts.createPrinter({ removeComments: true })
const parse = (text) => {
  const file = ts.createSourceFile(
    'sample.tsx',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(
    file.parseDiagnostics.length,
    0,
    ts.formatDiagnostics(file.parseDiagnostics, {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: () => '',
      getNewLine: () => '\n',
    }),
  )
  return printer.printFile(file)
}
const fixture = (run) => {
  const dir = mkdtempSync(join(tmpdir(), 'kerf-sample-width-'))
  try {
    return run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const source = `import {
  AlphaWidget,
  BetaWidget,
  GammaWidget,
  DeltaWidget,
} from '@fixture/ui'
export const Demo = () => (
  <AlphaWidget
    label="${'x'.repeat(46)}"
    first={BetaWidget}
    second={GammaWidget}
    third={DeltaWidget}
  />
)
`
const baseline = `import { AlphaWidget, BetaWidget, GammaWidget, DeltaWidget } from '@fixture/ui'

export function Demo() {
  return (
    <AlphaWidget
      label="${'x'.repeat(46)}"
      first={BetaWidget}
      second={GammaWidget}
      third={DeltaWidget}
    />
  )
}`

await test('generated imports stay within 58 columns without changing the AST', () =>
  fixture((dir) => {
    const path = join(dir, 'demo.tsx')
    writeFileSync(path, source)
    const result = readExamples(path).get('Demo')
    assert.equal(scanSource(result.head.join('\n')).length, 0)
    assert.equal(parse(showExample(result, 'Demo')), parse(baseline))
  }))

await test('stateless wrapper does not add width to the JSX source', () =>
  fixture((dir) => {
    const path = join(dir, 'demo.tsx')
    writeFileSync(path, source)
    assert.equal(scanSource(source).length, 0)
    const output = showExample(readExamples(path).get('Demo'), 'Demo')
    assert.equal(scanSource(output).length, 0)
    assert.equal(parse(output), parse(baseline))
  }))

await test('module and world reexports retain parseable, self-contained examples', () =>
  fixture((dir) => {
    mkdirSync(join(dir, 'examples'))
    mkdirSync(join(dir, 'world'))
    writeFileSync(join(dir, 'entry.tsx'), "export { Demo } from './examples/demo'\n")
    writeFileSync(
      join(dir, 'examples/demo.tsx'),
      "import { View } from '../world'\nexport const Demo = () => <View />\n",
    )
    writeFileSync(join(dir, 'world.ts'), "export { View } from './world/view'\n")
    writeFileSync(
      join(dir, 'world/view.tsx'),
      "import { AlphaWidget, BetaWidget, GammaWidget, DeltaWidget } from '@fixture/ui'\nexport const View = () => <AlphaWidget a={BetaWidget} b={GammaWidget} c={DeltaWidget} />\n",
    )
    const output = showExample(readExamples(join(dir, 'entry.tsx')).get('Demo'), 'Demo')
    assert.doesNotMatch(output, /from ['"]\./)
    assert.match(output, /const View/)
    assert.equal(
      scanSource(
        output
          .split('\n')
          .filter((line) => line.startsWith('import'))
          .join('\n'),
      ).length,
      0,
    )
    const before = `import { AlphaWidget, BetaWidget, GammaWidget, DeltaWidget } from '@fixture/ui'
export function Demo() {
  return (
    <View />
  )
}
const View = () => <AlphaWidget a={BetaWidget} b={GammaWidget} c={DeltaWidget} />`
    assert.equal(parse(output), parse(before))
  }))

await test('wrapped JSX text keeps the same compiled meaning', () =>
  fixture((dir) => {
    const path = join(dir, 'text.tsx')
    writeFileSync(
      path,
      `export const Demo = () => (
  <p>
    Hello
    <strong>world</strong>
  </p>
)
`,
    )
    const output = showExample(readExamples(path).get('Demo'), 'Demo')
    const before = `export function Demo() {
  return (
    <p>
      Hello
      <strong>world</strong>
    </p>
  )
}`
    const compile = (text) =>
      ts.transpileModule(text, {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ESNext },
        fileName: 'sample.tsx',
      }).outputText
    assert.equal(compile(output), compile(before))
  }))

await test('long type imports from world keep the same bindings', () =>
  fixture((dir) => {
    mkdirSync(join(dir, 'examples'))
    mkdirSync(join(dir, 'world'))
    writeFileSync(
      join(dir, 'examples/demo.tsx'),
      "import { View } from '../world'\nexport const Demo = () => <View />\n",
    )
    writeFileSync(join(dir, 'world.ts'), "export { View } from './world/view'\n")
    writeFileSync(
      join(dir, 'world/view.tsx'),
      `import type { AlphaThing, BetaThing, GammaThing, DeltaThing } from '@fixture/types'
export const View = (p: { a: AlphaThing; b: BetaThing; c: GammaThing; d: DeltaThing }) => <p />
`,
    )
    const found = readExamples(join(dir, 'examples/demo.tsx')).get('Demo')
    assert.equal(scanSource(found.head.join('\n')).length, 0)
    const before = `import type { AlphaThing, BetaThing, GammaThing, DeltaThing } from '@fixture/types'
export function Demo() {
  return (
    <View />
  )
}
const View = (p: { a: AlphaThing; b: BetaThing; c: GammaThing; d: DeltaThing }) => <p />`
    assert.equal(parse(showExample(found, 'Demo')), parse(before))
  }))

await test('long module specifiers stay intact on their own line', () => {
  const module = `@fixture/${'m'.repeat(43)}`
  const result = formatImport(['Value'], module, true)
  assert.equal(scanSource(result).length, 0)
  assert.equal(parse(result), parse(`import type { Value } from '${module}'`))
})
