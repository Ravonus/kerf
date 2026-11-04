import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { pack, pin, writePackedPolicy } from '../../packages/create-weft/scripts/tarballs.mjs'
import { writeToolShim } from '../../packages/create-weft/scripts/tool-shim.mjs'

await test('restricted PATH preserves a launcher that resolves its sibling executable', () => {
  const root = mkdtempSync(join(tmpdir(), 'weft-packed-shim-'))
  try {
    const tools = join(root, "original tools'"), bin = join(root, 'restricted')
    mkdirSync(tools); mkdirSync(bin)
    const launcher = join(tools, 'pnpm')
    writeFileSync(join(tools, 'actual'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 })
    writeFileSync(launcher, '#!/bin/sh\nexec "$(dirname "$0")/actual" "$@"\n', { mode: 0o755 })
    const shim = join(bin, 'pnpm')
    writeToolShim(shim, launcher)
    assert.equal(execFileSync(shim, ['two words', 'next'], {
      encoding: 'utf8', env: { PATH: `${bin}:/usr/bin:/bin` },
    }), 'two words\nnext\n')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

await test('packed pnpm installs keep the age policy and use transitive tarball overrides', () => {
  const root = mkdtempSync(join(tmpdir(), 'weft-packed-policy-'))
  try {
    const source = join(root, 'source'), dest = join(root, 'tgz'), scope = join(root, 'scope'), app = join(scope, 'person')
    for (const dir of [source, dest, scope, app]) mkdirSync(dir)
    writeFileSync(join(source, 'package.json'), JSON.stringify({ name: '@weft-js/packed-test', version: '1.0.0', scripts: { prepack: 'node -e "console.log(\'lifecycle output\')"' } }))
    const tarball = pack(source, dest)
    assert.ok(readFileSync(tarball.slice(5)).length > 0)
    const bridge = join(root, 'bridge')
    mkdirSync(bridge)
    writeFileSync(join(bridge, 'package.json'), JSON.stringify({ name: 'packed-bridge', version: '1.0.0', dependencies: { '@weft-js/packed-test': '9.9.9' } }))
    const bridgeTarball = pack(bridge, dest)
    const tarballs = { '@weft-js/packed-test': tarball }
    const pkg = pin({ name: 'consumer', version: '1.0.0', private: true, dependencies: { 'packed-bridge': bridgeTarball }, overrides: { other: '1.0.0' }, pnpm: { overrides: { another: '2.0.0' } } }, tarballs)
    assert.equal(pkg.overrides.other, '1.0.0')
    assert.equal(pkg.pnpm.overrides.another, '2.0.0')
    assert.equal(pkg.pnpm.overrides['@weft-js/packed-test'], tarball)
    writeFileSync(join(app, 'package.json'), JSON.stringify(pkg))
    writePackedPolicy(scope, tarballs, ['person'])
    const policy = readFileSync(join(scope, 'pnpm-workspace.yaml'), 'utf8')
    assert.match(policy, /minimumReleaseAge: 4320\n/)
    assert.match(policy, /minimumReleaseAgeExclude:\n  - '@weft-js\/\*'/)
    execFileSync('pnpm', ['install', '--no-frozen-lockfile', '--offline'], { cwd: app, stdio: 'pipe' })
    const standalone = join(root, 'standalone')
    mkdirSync(standalone)
    writePackedPolicy(standalone, tarballs)
    writeFileSync(join(standalone, 'package.json'), JSON.stringify(pkg))
    execFileSync('pnpm', ['install', '--no-frozen-lockfile', '--offline'], { cwd: standalone, stdio: 'pipe' })
    const fromStandaloneBridge = createRequire(realpathSync(join(standalone, 'node_modules/packed-bridge/package.json')))
    assert.equal(JSON.parse(readFileSync(fromStandaloneBridge.resolve('@weft-js/packed-test/package.json'), 'utf8')).version, '1.0.0')
    const fromBridge = createRequire(realpathSync(join(app, 'node_modules/packed-bridge/package.json')))
    assert.equal(JSON.parse(readFileSync(fromBridge.resolve('@weft-js/packed-test/package.json'), 'utf8')).version, '1.0.0')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
