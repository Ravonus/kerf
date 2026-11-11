import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { readExamples, showExample } from '../scripts/toolkit.mjs'

const ts = createRequire(new URL('../../packages/cli/package.json', import.meta.url))('typescript')
const fixture = (run) => {
  const dir = mkdtempSync(join(tmpdir(), 'kerf-forward-'))
  try {
    mkdirSync(join(dir, 'examples'))
    writeFileSync(join(dir, 'world.ts'), "export const WORLD = 'world'\n")
    writeFileSync(
      join(dir, 'examples/alpha.tsx'),
      `import { Text } from '@fixture/ui'
import { WORLD } from '../world'
const alphaHelper = () => WORLD
export function Alpha() { return <Text>{alphaHelper()}</Text> }
export function AlphaOther() { return <p>unrelated</p> }
`,
    )
    writeFileSync(
      join(dir, 'examples/beta.tsx'),
      `const betaHelper = () => 7
export function Beta() { return <p>{betaHelper()}</p> }
export function BetaOther() { return <p>unrelated</p> }
`,
    )
    return run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
function directPrograms(dir) {
  const root = join(dir, 'root.tsx')
  writeFileSync(
    root,
    "export { Beta } from './examples/beta'\nexport { Alpha } from './examples/alpha'\n",
  )
  return [...readExamples(root)].map(([name, found]) => [name, showExample(found, name)])
}
function assertParity(examples, expected) {
  assertPrograms(examples)
  assert.deepEqual(
    [...examples].map(([name, found]) => [name, showExample(found, name)]),
    expected,
  )
}
function assertPrograms(examples) {
  assert.deepEqual([...examples.keys()], ['Beta', 'Alpha'])
  for (const [name, expected, forbidden] of [
    ['Beta', 'betaHelper', 'alphaHelper|AlphaOther|BetaOther'],
    ['Alpha', 'alphaHelper', 'betaHelper|AlphaOther|BetaOther'],
  ]) {
    const text = showExample(examples.get(name), name)
    assert.match(text, new RegExp(`function ${expected}\\b|const ${expected}\\b`))
    assert.doesNotMatch(text, new RegExp(forbidden))
    assert.doesNotMatch(text, /from ['"]\./)
    assert.equal(
      ts.createSourceFile('copy.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
        .parseDiagnostics.length,
      0,
    )
    if (name === 'Alpha') {
      assert.match(text, /const WORLD/)
      assert.match(text, /from '@fixture\/ui'/)
    }
  }
}

await test('named reexports through nested barrels resolve only their selected leaves', () =>
  fixture((dir) => {
    const expected = directPrograms(dir)
    writeFileSync(join(dir, 'root.tsx'), "export { Beta, Alpha } from './examples/index'\n")
    writeFileSync(
      join(dir, 'examples/index.tsx'),
      "export { Alpha } from './alpha'\nexport { Beta } from './beta'\n",
    )
    assertParity(readExamples(join(dir, 'root.tsx')), expected)
  }))

await test('namespace property forwarders resolve only their selected leaves', () =>
  fixture((dir) => {
    const expected = directPrograms(dir)
    writeFileSync(join(dir, 'root.tsx'), "export { Beta, Alpha } from './examples/index'\n")
    writeFileSync(
      join(dir, 'examples/index.tsx'),
      "import * as first from './alpha'\nimport * as second from './beta'\nexport const Alpha = first.Alpha\nexport const Beta = second.Beta\n",
    )
    assertParity(readExamples(join(dir, 'root.tsx')), expected)
  }))

await test('forwarders reject renames, computations and cycles', () =>
  fixture((dir) => {
    const root = join(dir, 'root.tsx')
    const barrel = join(dir, 'examples/index.tsx')
    writeFileSync(root, "export { Alpha } from './examples/index'\n")
    for (const [body, error] of [
      ["export { Alpha as Other } from './alpha'\n", /renam/i],
      ["import * as first from './alpha'\nexport const Alpha = first.Alpha()\n", /unsupported/i],
      ["import * as first from './alpha'\nexport const Alpha = first.AlphaOther\n", /renam/i],
      ["export { Alpha } from './cycle'\n", /cycle/i],
    ]) {
      writeFileSync(barrel, body)
      writeFileSync(join(dir, 'examples/cycle.tsx'), "export { Alpha } from './index'\n")
      assert.throws(() => readExamples(root), error)
    }
  }))

await test('root namespace aliases retain public order even with imports below declarations', () =>
  fixture((dir) => {
    const expected = directPrograms(dir)
    writeFileSync(
      join(dir, 'root.tsx'),
      "export const Beta = second.Beta\nexport const Alpha = first.Alpha\nimport * as first from './examples/alpha'\nimport * as second from './examples/beta'\n",
    )
    assertParity(readExamples(join(dir, 'root.tsx')), expected)
  }))

await test('used renamed local imports and import cycles are rejected', () =>
  fixture((dir) => {
    const root = join(dir, 'root.tsx')
    const alpha = join(dir, 'examples/alpha.tsx')
    const beta = join(dir, 'examples/beta.tsx')
    writeFileSync(root, "export { Alpha } from './examples/alpha'\n")
    writeFileSync(
      alpha,
      "import { Beta as renamed } from './beta'\nexport const Alpha = () => <p>{renamed()}</p>\n",
    )
    assert.throws(() => readExamples(root), /renamed/i)
    writeFileSync(
      alpha,
      "import { Beta } from './beta'\nexport const Alpha = () => <p>{Beta()}</p>\n",
    )
    writeFileSync(
      beta,
      "import { Alpha } from './alpha'\nexport function Beta() { return Alpha() }\n",
    )
    assert.throws(() => readExamples(root), /cycle/i)
  }))

await test('the existing admin direct barrel retains every parseable public example', () => {
  const path = 'site/src/toolkit/examples/admin.tsx'
  const file = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const names = file.statements
    .filter((node) => ts.isExportDeclaration(node) && node.moduleSpecifier)
    .flatMap((node) => node.exportClause.elements.map((element) => element.name.text))
  const examples = readExamples(path)
  assert.ok(names.length > 0)
  assert.deepEqual([...examples.keys()], names)
  for (const [name, found] of examples) {
    const text = showExample(found, name)
    assert.doesNotMatch(text, /from ['"]\./, name)
    assert.equal(
      ts.createSourceFile(`${name}.tsx`, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
        .parseDiagnostics.length,
      0,
      name,
    )
  }
})

await test('unsupported root statements and renamed namespace aliases are rejected', () =>
  fixture((dir) => {
    const root = join(dir, 'root.tsx')
    writeFileSync(root, "export { Alpha } from './examples/alpha'\nconsole.log('effect')\n")
    assert.throws(() => readExamples(root), /unsupported forwarding statement/i)
    writeFileSync(
      root,
      "import * as first from './examples/alpha'\nexport const Alpha = first.AlphaOther\n",
    )
    assert.throws(() => readExamples(root), /renamed/i)
  }))

await test('namespace object bindings forward ordered leaves without sibling demos', () =>
  fixture((dir) => {
    const expected = directPrograms(dir)
    writeFileSync(join(dir, 'root.tsx'), "export { Beta, Alpha } from './examples/index'\n")
    writeFileSync(
      join(dir, 'examples/index.tsx'),
      "import * as first from './alpha'\nimport * as second from './beta'\nexport const { Alpha, AlphaOther } = first\nexport const { Beta } = second\n",
    )
    assertParity(readExamples(join(dir, 'root.tsx')), expected)
  }))

await test('namespace object forwarding rejects renamed, default, rest and computed bindings', () =>
  fixture((dir) => {
    const root = join(dir, 'root.tsx')
    writeFileSync(root, "export { Alpha } from './examples/index'\n")
    const path = join(dir, 'examples/index.tsx')
    for (const binding of ['Alpha: Other', 'Alpha = 1', '...rest', "['Alpha']: Alpha"]) {
      writeFileSync(path, `import * as first from './alpha'\nexport const { ${binding} } = first\n`)
      assert.throws(() => readExamples(root), /unsupported|renamed/i, binding)
    }
    writeFileSync(
      path,
      "import * as first from './alpha'\nexport const { Alpha } = first.Alpha()\n",
    )
    assert.throws(() => readExamples(root), /unsupported/i)
    writeFileSync(path, "import * as first from './alpha'\nexport const {} = first\n")
    assert.throws(() => readExamples(root), /unsupported/i)
  }))

await test('namespace object forwarding rejects a forwarding cycle', () =>
  fixture((dir) => {
    const root = join(dir, 'root.tsx')
    writeFileSync(root, "export { Alpha } from './examples/index'\n")
    writeFileSync(
      join(dir, 'examples/index.tsx'),
      "import * as other from './cycle'\nexport const { Alpha } = other\n",
    )
    writeFileSync(join(dir, 'examples/cycle.tsx'), "export { Alpha } from './index'\n")
    assert.throws(() => readExamples(root), /cycle/i)
  }))

await test('a local helper may also reexport other names', () =>
  fixture((dir) => {
    writeFileSync(join(dir, 'root.tsx'), "export { Alpha } from './examples/alpha'\n")
    writeFileSync(
      join(dir, 'examples/alpha.tsx'),
      "import { Text } from '@fixture/ui'\nexport { Beta } from './beta'\nexport function Alpha() { return <Text>alpha</Text> }\n",
    )
    const text = showExample(readExamples(join(dir, 'root.tsx')).get('Alpha'), 'Alpha')
    assert.match(text, /function Alpha/)
    assert.doesNotMatch(text, /Beta|from ['"]\./)
    assert.equal(
      ts.createSourceFile('copy.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
        .parseDiagnostics.length,
      0,
    )
  }))
