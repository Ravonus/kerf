#!/usr/bin/env node
// Proves the rules bite: plants one violation in each area, runs that `pnpm run check` step, and wants a failure naming it. Every
// planted file is removed, and every edit undone, before the next one, and the tree is checked clean at the end.
//
//   node scripts/quality/prove.mjs [step…]   with steps: only their plants
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ts = (file, code) => ({ file: `packages/${file}`, code })

const PLANTS = [
  // TypeScript
  {
    area: 'strict',
    step: 'types',
    expect: 'TS7006',
    ...ts('weft/src/planted.ts', 'export const f = x => x\n'),
  },
  {
    area: 'noUncheckedIndexedAccess',
    step: 'types',
    expect: 'TS2532',
    ...ts('weft/src/planted.ts', 'export const f = (xs: number[]) => xs[0] + 1\n'),
  },
  {
    area: 'noImplicitOverride',
    step: 'types',
    expect: 'TS4114',
    ...ts('weft/src/planted.ts', 'class A { f() {} }\nexport class B extends A { f() {} }\n'),
  },
  {
    area: 'exactOptionalPropertyTypes',
    step: 'types',
    expect: 'TS2375',
    ...ts(
      'weft/src/planted.ts',
      'const a: { x?: number } = { x: undefined as number | undefined }\nexport { a }\n',
    ),
  },
  {
    area: 'no any',
    step: 'lint',
    expect: 'no-explicit-any',
    ...ts('weft/src/planted.ts', 'export const a = (x: any) => x\n'),
  },
  {
    area: 'no @ts-ignore',
    step: 'lint',
    expect: 'ban-ts-comment',
    ...ts('weft/test/planted.ts', '// @ts-ignore\nexport const a = 1\n'),
  },
  {
    area: '@ts-expect-error needs a reason',
    step: 'lint',
    expect: 'ban-ts-comment',
    ...ts('weft/test/planted.ts', '// @ts-expect-error\nexport const a: string = 1\n'),
  },
  {
    area: 'no floating promises',
    step: 'lint',
    expect: 'no-floating-promises',
    ...ts(
      'weft/test/planted.ts',
      'const f = () => Promise.resolve()\nexport function g() { f() }\n',
    ),
  },
  {
    area: 'type-only imports',
    step: 'lint',
    expect: 'consistent-type-imports',
    ...ts(
      'weft/test/planted.ts',
      "import { Scope } from 'node:module'\nexport const a = (x: Scope) => x\n",
    ),
  },
  // Lint
  {
    area: 'unused',
    step: 'lint',
    expect: 'no-unused-vars',
    ...ts('weft/test/planted.ts', 'const a = 1\nexport {}\n'),
  },
  {
    area: 'unreachable',
    step: 'lint',
    expect: 'no-unreachable',
    ...ts('weft/test/planted.ts', 'export function f() { return 1; f() }\n'),
  },
  {
    area: 'shadowing',
    step: 'lint',
    expect: 'no-shadow',
    ...ts(
      'weft/test/planted.ts',
      'const a = 1\nexport const f = () => { const a = 2; return a }\nexport { a }\n',
    ),
  },
  {
    area: 'equality',
    step: 'lint',
    expect: 'eqeqeq',
    ...ts('weft/test/planted.ts', 'export const f = (a: number) => a == 1\n'),
  },
  {
    area: 'async mistakes',
    step: 'lint',
    expect: 'await-thenable',
    ...ts(
      'weft/test/planted.ts',
      'export async function f() { await 1; await Promise.resolve() }\n',
    ),
  },
  {
    area: 'warp-core imports no framework',
    step: 'lint',
    expect: 'no-restricted-imports',
    ...ts(
      'warp-core/src/planted.ts',
      "import { signal } from '@weft-js/core'\nexport { signal }\n",
    ),
  },
  {
    area: 'warp-core imports no framework (graph)',
    step: 'boundaries',
    expect: 'warp-core',
    ...ts('warp-core/src/planted.ts', "export { signal } from 'react'\n"),
  },
  {
    area: 'core imports no Node',
    step: 'lint',
    expect: 'no-restricted-imports',
    ...ts(
      'weft/src/planted.ts',
      "import { readFileSync } from 'node:fs'\nexport { readFileSync }\n",
    ),
  },
  {
    area: 'browser reaches no Node, deep down',
    step: 'boundaries',
    expect: 'reaches node:fs',
    edit: { file: 'packages/core/src/keyed.ts', append: "\nimport './planted-deep'\n" },
    extra: { file: 'packages/core/src/planted-deep.ts', code: "import './planted-deeper'\n" },
    extra2: { file: 'packages/core/src/planted-deeper.ts', code: "import 'node:fs'\n" },
  },
  {
    area: 'browser code calls no randomUUID, deep down',
    step: 'browser-apis',
    expect: 'planted-uuid',
    edit: { file: 'packages/core/src/keyed.ts', append: "\nimport './planted-uuid'\n" },
    extra: {
      file: 'packages/core/src/planted-uuid.ts',
      code: 'export const id = crypto.randomUUID()\n',
    },
  },
  {
    area: 'site code calls no randomUUID',
    step: 'browser-apis',
    expect: 'chat.tsx',
    edit: {
      file: 'site/src/demos/chat.tsx',
      append: '\nexport const planted = () => crypto.randomUUID()\n',
    },
  },
  // Comments
  {
    area: 'no commented-out code',
    step: 'lint',
    expect: 'no-commented-code',
    ...ts('weft/test/planted.ts', '// const old = compute(1);\nexport {}\n'),
  },
  {
    area: 'TODO needs an issue',
    step: 'lint',
    expect: 'todo-needs-issue',
    ...ts('weft/test/planted.ts', '// TODO make this fast\nexport {}\n'),
  },
  {
    area: 'public export has a doc comment',
    step: 'lint',
    expect: 'public-doc',
    edit: {
      file: 'packages/core/src/keyed.ts',
      append: '\nexport const plantedUndocumented = 1\n',
    },
  },
  {
    area: 'disable states its reason',
    step: 'lint',
    expect: 'disable-needs-reason',
    ...ts(
      'weft/test/planted.ts',
      '// oxlint-disable-next-line eqeqeq\nexport const f = (a: number) => a == 1\n',
    ),
  },
  // Rust
  {
    area: 'clippy',
    step: 'clippy',
    expect: 'clippy',
    edit: {
      file: 'crates/weft-layout/src/lib.rs',
      append: '\npub fn planted(x: Vec<u8>) -> usize { return x.len(); }\n',
    },
  },
  {
    area: 'cargo fmt',
    step: 'rust-fmt',
    expect: 'crates/weft-layout',
    edit: { file: 'crates/weft-layout/src/lib.rs', append: '\nfn  planted( ) {}\n' },
  },
  {
    area: 'no unwrap outside tests',
    step: 'clippy',
    expect: 'unwrap',
    edit: {
      file: 'crates/weft-layout/src/lib.rs',
      append: '\n#[must_use]\npub fn planted(x: Option<u8>) -> u8 { x.unwrap() }\n',
    },
  },
  {
    area: 'unsafe needs SAFETY',
    step: 'clippy',
    expect: 'unsafe block missing a safety comment',
    edit: {
      file: 'crates/weft-layout/src/lib.rs',
      append: '\n#[must_use]\npub fn planted(x: *const u8) -> u8 { unsafe { *x } }\n',
    },
  },
  // Security
  {
    area: 'secret scanning',
    step: 'secrets',
    expect: 'planted-secret',
    file: 'packages/core/test/planted-secret.ts',
    code: `export const k = '${['AKIA', 'Z3MPL9QX', 'T7VNW2KD'].join('')}'\nexport const j = 'ghp_${'a1B2c3D4e5'.repeat(3)}abcdef'\n`,
  },
  {
    area: 'licence allowlist',
    step: 'licences',
    expect: 'planted-pkg',
    env: {
      WEFT_LICENCES_JSON: JSON.stringify({
        'GPL-3.0': [{ name: 'planted-pkg', versions: ['1.0.0'] }],
      }),
    },
  },
  {
    area: 'no eval',
    step: 'lint',
    expect: 'no-eval',
    ...ts('weft/test/planted.ts', "export const f = () => eval('1')\n"),
  },
  {
    area: 'no new Function',
    step: 'lint',
    expect: 'no-new-func',
    ...ts('weft/test/planted.ts', "export const f = new Function('return 1')\n"),
  },
  {
    area: 'no html hole',
    step: 'lint',
    expect: 'no-html-sink',
    ...ts(
      'weft/src/planted.ts',
      'export const f = (el: Element, s: string) => { el.innerHTML = s }\n',
    ),
  },
  {
    area: '.gitignore keeps env files out',
    step: 'tarballs',
    expect: 'site/.neon',
    edit: { file: '.gitignore', replace: [/^\.neon\n/m, ''] },
  },
  {
    area: 'tarballs keep credentials out',
    step: 'tarballs',
    expect: 'would ship',
    file: 'packages/core/src/planted.pem',
    code: 'x\n',
  },
  // Tests
  {
    area: 'no .only',
    step: 'lint',
    expect: 'no-focused-tests',
    ...ts('weft/test/planted.test.ts', "import { it } from 'vitest'\nit.only('x', () => {})\n"),
  },
  {
    area: 'skip needs a reason',
    step: 'lint',
    expect: 'skip-needs-reason',
    ...ts('weft/test/planted.test.ts', "import { it } from 'vitest'\n\nit.skip('x', () => {})\n"),
  },
]

const undo = []
const write = (file, code) => {
  const at = join(root, file)
  mkdirSync(dirname(at), { recursive: true })
  writeFileSync(at, code)
  undo.push(() => rmSync(at, { force: true }))
}
function plant(p) {
  if (p.file) write(p.file, p.code)
  for (const x of [p.extra, p.extra2]) if (x) write(x.file, x.code)
  if (p.edit) {
    const at = join(root, p.edit.file),
      before = readFileSync(at, 'utf8')
    undo.push(() => writeFileSync(at, before))
    if (p.edit.append) appendFileSync(at, p.edit.append)
    if (p.edit.replace) writeFileSync(at, before.replace(...p.edit.replace))
    if (p.edit.json) {
      const j = JSON.parse(before)
      p.edit.json(j)
      writeFileSync(at, JSON.stringify(j))
    }
  }
}
const clear = () => {
  while (undo.length) undo.pop()()
}
process.on('SIGINT', () => {
  clear()
  process.exit(130)
})

const check = (step, env) =>
  spawnSync(process.execPath, ['scripts/check.mjs', `--only=${step}`, '--jobs=8'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
const steps = process.argv.slice(2)
const chosen = steps.length ? PLANTS.filter((p) => steps.includes(p.step)) : PLANTS
let wrong = 0
for (const p of chosen) {
  plant(p)
  let r
  try {
    r = check(p.step, p.env)
  } finally {
    clear()
  }
  const caught = r.status === 1 && r.stdout.includes(p.expect)
  if (!caught) wrong++
  console.log(`${caught ? 'caught' : 'MISSED'}  ${p.area} (${p.step})`)
  if (!caught)
    console.log(
      r.stdout
        .split('\n')
        .slice(0, 8)
        .map((l) => `    ${l.slice(0, 160)}`)
        .join('\n'),
    )
}
const dirty = spawnSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' })
  .stdout.split('\n')
  .filter((l) => /planted/.test(l))
if (dirty.length) {
  console.log(`left behind: ${dirty.join(', ')}`)
  wrong++
}
console.log(wrong ? `${wrong} of ${chosen.length} not caught` : `all ${chosen.length} caught`)
process.exit(wrong ? 1 : 0)
