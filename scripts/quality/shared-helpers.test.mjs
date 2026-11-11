// Exercise the guard against tracked consumers in a temporary repository.
import { strict as assert } from 'node:assert'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { check } from './shared-helpers.mjs'

void test('checks tracked setup files and rejects duplicate helpers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kerf-helpers-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
  try {
    git('init', '-q')
    mkdirSync(join(dir, 'packages/demo/test'), { recursive: true })
    const file = join(dir, 'packages/demo/test/server.setup.mjs')
    writeFileSync(file, "import { freePort } from '../../../scripts/lib/helpers.mjs'\n")
    git('add', 'packages/demo/test/server.setup.mjs')
    assert.equal(check(dir).files.length, 1)
    assert.deepEqual(check(dir).problems, [])
    writeFileSync(file, 'const freePort = () => 42\n')
    assert.match(check(dir).problems[0], /duplicate freePort/)
    const cli = spawnSync(process.execPath, [
      new URL('./shared-helpers.mjs', import.meta.url).pathname,
      dir,
    ])
    assert.equal(cli.status, 1)
    writeFileSync(file, 'const delay = (ms) => new Promise((ok) => setTimeout(ok, ms))\n')
    assert.match(check(dir).problems[0], /duplicate sleep/)
    for (const source of [
      'const sleep = function(ms) { return new Promise(ok => setTimeout(ok, ms)) }',
      'const delay = (ms) => new Promise(ok => setTimeout(ok, ms))',
      'const delay = ms => new Promise((ok) => setTimeout(ok, ms))',
      'const tick = () => new Promise(ok => setTimeout(ok))',
    ]) {
      writeFileSync(file, source + '\n')
      assert.ok(
        check(dir).problems.some((problem) => /duplicate sleep/.test(problem)),
        source,
      )
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

void test('rejects tracked full HTML esc and repository root calculations', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kerf-helper-source-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
  try {
    git('init', '-q')
    const examples = {
      'scripts/copy.mjs': `export const repoRoot = "/copied/root"\nexport const esc = s => s.replace(/[&<>"]/g, c => c)\n`,
      'packages/demo/src/sequential.ts': `const escapeHtml = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')`,
      'packages/veneer-core/src/charts/scene.ts': `export const esc = (v: string) => v.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]!)`,
      'evals/gates/veneer-exit.mjs': `import {join,dirname} from 'node:path'; import {fileURLToPath} from 'node:url'; const root = join(dirname(fileURLToPath(import.meta.url)), '..'); const repo = join(root, '..')`,
      'packages/start/test/e2e/e2e-realtime.mjs': `import {dirname,resolve} from 'node:path'; import {fileURLToPath} from 'node:url'; const here = dirname(fileURLToPath(import.meta.url)); const repo = resolve(here, '../../../..')`,
      'packages/core/scripts/parity.mjs': `import {join,dirname} from 'node:path'; import {fileURLToPath} from 'node:url'; const here = dirname(fileURLToPath(import.meta.url)); const pkg = join(here, '..'); const repo = join(pkg, '..', '..')`,
      'packages/veneer/scripts/dither.mjs': `import {join,resolve,dirname} from 'node:path'; import {fileURLToPath} from 'node:url'; const pkg = join(dirname(fileURLToPath(import.meta.url)), '..'); const repo = resolve(pkg, '../..')`,
      'packages/demo/scripts/alias.mjs': `import {resolve as r, dirname as d} from 'node:path'; import {fileURLToPath as f} from 'node:url'; const here = d(f(import.meta.url)); const home = r(here, '../../..')`,
    }
    for (const [path, source] of Object.entries(examples)) {
      mkdirSync(join(dir, path, '..'), { recursive: true })
      writeFileSync(join(dir, path), source + '\n')
    }
    git('add', '.')
    for (const path of Object.keys(examples)) writeFileSync(join(dir, path), '// no helper\n')
    for (const [path, source] of Object.entries(examples)) {
      writeFileSync(join(dir, path), source + '\n')
      const result = check(dir)
      assert.ok(
        result.problems.some((problem) => problem.startsWith(path + ':')),
        path,
      )
      if (path === 'scripts/copy.mjs') {
        assert.ok(result.problems.some((problem) => problem.includes('duplicate repoRoot')))
        assert.ok(result.problems.some((problem) => problem.includes('duplicate esc')))
      }
      const cli = spawnSync(process.execPath, [
        new URL('./shared-helpers.mjs', import.meta.url).pathname,
        dir,
      ])
      assert.equal(cli.status, 1, path)
      writeFileSync(join(dir, path), '// no helper\n')
    }
    writeFileSync(
      join(dir, 'scripts/copy.mjs'),
      `import { repoRoot } from '../lib/helpers.mjs'\nconst fake = 'const esc = s => s.replace(/[&<>"]/g, c => c)'\n`,
    )
    writeFileSync(
      join(dir, 'packages/demo/scripts/alias.mjs'),
      "import {resolve as r, dirname as d} from 'node:path'; import {fileURLToPath as f} from 'node:url'; const here = d(f(import.meta.url)); const packageRoot = r(here, '..')\n",
    )
    writeFileSync(
      join(dir, 'packages/veneer-core/src/charts/scene.ts'),
      'const esc = (v: string) => v.replace(/[&<]/g, c => c)\n',
    )
    assert.deepEqual(check(dir).problems, [])
    const valid = spawnSync(process.execPath, [
      new URL('./shared-helpers.mjs', import.meta.url).pathname,
      dir,
    ])
    assert.equal(valid.status, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

for (const [name, source, expected, suffix] of [
  [
    'shadowMiss',
    "import {dirname,resolve} from 'node:path';import {fileURLToPath} from 'node:url';const here=dirname(fileURLToPath(import.meta.url)); function unrelated(){const here='/var/unrelated';return here}; const root=resolve(here,'..');console.log(root)",
    1,
    'root',
  ],
  [
    'unrelatedResolve',
    "import {dirname} from 'node:path';import {fileURLToPath} from 'node:url';const here=dirname(fileURLToPath(import.meta.url));const custom={resolve(){return '/package/assets'}};const assets=custom.resolve(here,'..');console.log(assets)",
    0,
    '/package/assets',
  ],
  [
    'functionShadow',
    "import {dirname,resolve} from 'node:path';import {fileURLToPath} from 'node:url';const here=dirname(fileURLToPath(import.meta.url));function assets(){function resolve(){return '/assets'};const root=resolve(here,'..');console.log(root)};assets()",
    0,
    '/assets',
  ],
  [
    'hoistedFunctionShadow',
    "import {dirname,resolve} from 'node:path';import {fileURLToPath} from 'node:url';const here=dirname(fileURLToPath(import.meta.url));function assets(){const root=resolve(here,'..');function resolve(){return '/assets'};console.log(root)};assets()",
    0,
    '/assets',
  ],
  [
    'namespaceRoot',
    "import * as path from 'node:path';import * as url from 'node:url';const root=path.resolve(path.dirname(url.fileURLToPath(import.meta.url)),'..');console.log(root)",
    1,
    'root',
  ],
  [
    'rootArrow',
    "import {fileURLToPath} from 'node:url';const repoRoot=()=>fileURLToPath(new URL('../',import.meta.url));console.log(repoRoot())",
    1,
    'root',
  ],
  [
    'rootFunction',
    "import {fileURLToPath} from 'node:url';export function repoRoot(){return fileURLToPath(new URL('../',import.meta.url))};console.log(repoRoot())",
    1,
    'root',
  ],
]) {
  void test(`binding-aware root detection: ${name}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-helper-binding-'))
    try {
      execFileSync('git', ['init', '-q', dir])
      mkdirSync(join(dir, 'scripts'))
      const file = join(dir, 'scripts/probe.mjs')
      writeFileSync(file, source)
      execFileSync('git', ['-C', dir, 'add', '.'])
      const run = spawnSync(process.execPath, [file], { encoding: 'utf8' })
      assert.equal(run.status, 0)
      assert.equal(
        run.stdout.trim().replace(/\/$/, ''),
        suffix === 'root' ? realpathSync(dir) : suffix,
      )
      const cli = spawnSync(
        process.execPath,
        [new URL('./shared-helpers.mjs', import.meta.url).pathname, dir],
        { encoding: 'utf8' },
      )
      assert.equal(cli.status, expected, `${name}: ${cli.stderr}`)
      assert.equal(check(dir).problems.length, expected)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
}

for (const [name, path, source] of [
  [
    'site script root',
    'site/scripts/copy.mjs',
    "import {resolve} from 'node:path'; const root = resolve(import.meta.dirname, '../..')",
  ],
  [
    'site content root',
    'site/scripts/content/context.mjs',
    "import {dirname,join} from 'node:path'; import {fileURLToPath} from 'node:url'; const site = join(dirname(fileURLToPath(new URL('../content.mjs', import.meta.url))), '..'); const repo = join(site, '..')",
  ],
  [
    'site setup timer',
    'site/test/copy.setup.mjs',
    'const sleep = (ms) => new Promise(ok => setTimeout(ok, ms))',
  ],
  [
    'text escape',
    'site/scripts/text.mjs',
    `const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')`,
  ],
  [
    'existing scope text',
    'scripts/text.mjs',
    `const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')`,
  ],
  ['existing scope attribute', 'scripts/attr.mjs', `const esc = t => t.replace(/[&<"]/g, c => c)`],
  ['attribute escape', 'site/scripts/attr.mjs', `const esc = t => t.replace(/[&<"]/g, c => c)`],
  ['full escape', 'site/scripts/full.mjs', `const esc = t => t.replace(/[&<>"]/g, c => c)`],
]) {
  void test(`site helper gate rejects ${name}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-site-helper-'))
    try {
      execFileSync('git', ['init', '-q', dir])
      mkdirSync(join(dir, path, '..'), { recursive: true })
      writeFileSync(join(dir, path), source + '\n')
      execFileSync('git', ['-C', dir, 'add', '.'])
      const cli = spawnSync(
        process.execPath,
        [new URL('./shared-helpers.mjs', import.meta.url).pathname, dir],
        { encoding: 'utf8' },
      )
      assert.equal(cli.status, 1, name)
      assert.match(cli.stderr, new RegExp(path.replaceAll('.', '\\.')))
      assert.equal(check(dir).files.length, 1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
}

void test('site helper gate accepts canonical delegates and distinct escape policies', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kerf-site-distinct-'))
  try {
    execFileSync('git', ['init', '-q', dir])
    mkdirSync(join(dir, 'site/scripts'), { recursive: true })
    writeFileSync(
      join(dir, 'site/scripts/valid.mjs'),
      `
import { esc as canonical } from '@kerf/core/markup'
const esc = s => canonical(s, 'text')
const numeric = v => v.replace(/[&<]/g, c => '&#' + c.charCodeAt(0) + ';')
const partial = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const apostrophe = v => v.replace(/[&<>"']/g, c => c)
`,
    )
    writeFileSync(
      join(dir, 'site/scripts/numeric.mjs'),
      `const esc = v => v.replace(/[&<>]/g, c => '&#' + c.charCodeAt(0) + ';')`,
    )
    writeFileSync(
      join(dir, 'site/scripts/coercion.mjs'),
      `const esc = v => String(v).replace(/[&<>"]/g, c => c)`,
    )
    writeFileSync(
      join(dir, 'site/scripts/apostrophe.mjs'),
      `const esc = v => v.replace(/[&<>"']/g, c => c)`,
    )
    execFileSync('git', ['-C', dir, 'add', '.'])
    assert.deepEqual(check(dir).problems, [])
    const cli = spawnSync(process.execPath, [
      new URL('./shared-helpers.mjs', import.meta.url).pathname,
      dir,
    ])
    assert.equal(cli.status, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
