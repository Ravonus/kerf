import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { claudeBin, goldens, registryPort, repo, tgz } from '../lib/paths.mjs'
import { env } from '../lib/sandbox.mjs'
import { install } from './install.mjs'

function hashTree(dir) {
  const hash = createHash('sha256')
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      if (e.name === 'node_modules') continue
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile()) hash.update(relative(dir, p)).update(readFileSync(p))
    }
  }
  walk(dir)
  return hash.digest('hex').slice(0, 16)
}

export async function golden({ withRegistry, stackNames, stacks, packagesCommit, say }) {
  await withRegistry(async () => {
    const manifest = {
      madeAt: new Date().toISOString(),
      packages: packagesCommit(),
      claude: execFileSync(claudeBin, ['--version'], { encoding: 'utf8' }).trim(),
      node: process.version,
      stacks: {},
    }
    for (const name of stackNames) {
      const dir = join(goldens, name),
        box = { root: dir, app: join(dir, 'app'), home: join(dir, 'home'), tmp: join(dir, 'tmp') }
      rmSync(dir, { recursive: true, force: true })
      mkdirSync(box.home, { recursive: true })
      mkdirSync(box.tmp)
      if (name !== 'kerf-veneer') throw new Error('S5 supports only kerf-veneer')
      say(`== ${name}`)
      install({
        dir,
        app: box.app,
        commands: stacks[name],
        environment: env(box),
        registry: `http://localhost:${registryPort}/`,
      })
      for (const d of [...stacks[name].built, '.git'])
        rmSync(join(box.app, d), { recursive: true, force: true })
      const pkg = JSON.parse(readFileSync(join(box.app, 'package.json'), 'utf8'))
      const installed = (n) => {
        try {
          return JSON.parse(readFileSync(join(box.app, 'node_modules', n, 'package.json'), 'utf8'))
            .version
        } catch {
          return null
        }
      }
      manifest.stacks[name] = {
        tree: hashTree(box.app),
        versions: Object.fromEntries(
          ['react', 'next', 'vite', '@kerf-js/core', '@kerf-js/veneer', 'tailwindcss']
            .map((n) => [n, installed(n)])
            .filter(([, v]) => v),
        ),
        scripts: pkg.scripts,
        agentFiles: ['AGENTS.md', 'CLAUDE.md', 'README.md'].filter((f) =>
          existsSync(join(box.app, f)),
        ),
      }
    }
    writeFileSync(join(goldens, 'manifest.json'), JSON.stringify(manifest, null, 2))
    console.log(JSON.stringify(manifest, null, 2))
  })
}

export async function pack({ packagesCommit, say }) {
  rmSync(tgz, { recursive: true, force: true })
  const { packWithAddon } = await import(join(repo, 'packages/create-kerf/scripts/pack-all.mjs'))
  const packed = packWithAddon(tgz)
  if (!Object.keys(packed).some((n) => n.startsWith('@kerf-js/compiler-')))
    throw new Error(
      'no native addon packed: run build:native in packages/core, a real install gets one',
    )
  say(`${Object.keys(packed).length} tarballs from ${packagesCommit().slice(0, 10)}`)
}
