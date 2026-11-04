import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))

for (const stage of ['production', 'development', 'clean'])
  await test(`the check reports a ${stage} dependency audit faithfully`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'weft-audit-test-'))
    try {
      const program = join(dir, 'audit.cjs')
      writeFileSync(
        program,
        `#!/usr/bin/env node
const stage = process.argv.includes('--prod') ? 'production' : 'development'
if (process.env.WEFT_AUDIT_FAILURE === stage) {
  console.error('fixture audit failure')
  process.exit(23)
}
`,
        { mode: 0o755 },
      )
      if (process.platform === 'win32')
        writeFileSync(join(dir, 'pnpm.cmd'), `@"${process.execPath}" "${program}" %*\r\n`)
      else symlinkSync(program, join(dir, 'pnpm'))
      const result = spawnSync(process.execPath, ['scripts/check.mjs', '--only=npm-audit'], {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${dir}${delimiter}${process.env.PATH}`,
          WEFT_AUDIT_FAILURE: stage,
        },
      })
      assert.equal(result.status, stage === 'clean' ? 0 : 1, result.stdout + result.stderr)
      if (stage !== 'clean') assert.match(result.stdout, /fixture audit failure/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
