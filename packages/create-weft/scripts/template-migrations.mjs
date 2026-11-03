#!/usr/bin/env node
// A template's `drizzle/`, from its schema: drizzle-kit's own output, so `weft db generate` carries on from it, with the
// SQL made safe to run over existing tables. Run it after changing a template's schema; a test fails until you do.
//
//   node packages/create-weft/scripts/template-migrations.mjs <template>...
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scaffold } from '../src/index.mjs'
import { VERSIONS } from '../src/stack.mjs'
import { idempotent, loadTemplate } from '../src/templates.mjs'

const names = process.argv.slice(2)
if (!names.length) throw new Error('usage: template-migrations.mjs <template>...')

const work = mkdtempSync(join(tmpdir(), 'weft-template-'))
try {
  const dependencies = Object.fromEntries(['drizzle-kit', 'drizzle-orm'].map(name => [name, VERSIONS[name]]))
  writeFileSync(join(work, 'package.json'), JSON.stringify({ private: true, dependencies }))
  execFileSync('npm', ['install', '--silent', '--no-audit', '--no-fund'], { cwd: work, stdio: 'inherit' })
  for (const name of names) {
    if (loadTemplate(name).requires.db === 'none') continue
    const app = join(work, name)
    scaffold(app, { template: name })
    rmSync(join(app, 'drizzle'), { recursive: true })
    execFileSync(join(work, 'node_modules/.bin/drizzle-kit'), ['generate', `--name=${name}`], { cwd: app, stdio: ['ignore', 'ignore', 'inherit'] })
    for (const file of readdirSync(join(app, 'drizzle')).filter(f => f.endsWith('.sql'))) writeFileSync(join(app, 'drizzle', file), idempotent(readFileSync(join(app, 'drizzle', file), 'utf8')))
    const hash = createHash('sha256').update(readFileSync(join(app, 'src/db/schema.ts'))).digest('hex').slice(0, 16)
    writeFileSync(join(app, 'drizzle/.schema-hash'), `${hash}\n`)
    const out = fileURLToPath(new URL(`../templates/${name}/files/drizzle`, import.meta.url))
    rmSync(out, { recursive: true, force: true })
    cpSync(join(app, 'drizzle'), out, { recursive: true })
    console.log(`${name}: ${out}`)
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
