import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { bin } from './helpers.mjs'

// NODE_PATH off: pnpm's shims point it at the workspace's hoisted packages, which an app does not have.
const weft = (cwd: string, ...args: string[]) => {
  const env = { ...process.env, NODE_PATH: '' }
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, env, encoding: 'utf8' })
  return { code: r.status, stderr: r.stderr }
}

it('weft capture runs the project’s @weft-js/capture, and says how to add it when it is missing', () => {
  const empty = mkdtempSync(join(tmpdir(), 'weft-capture-'))
  expect(weft(empty, 'capture', 'help')).toMatchObject({
    code: 2,
    stderr: expect.stringContaining('pnpm add -D @weft-js/capture'),
  })
  rmSync(empty, { recursive: true, force: true })
  expect(weft(join(import.meta.dirname, '../../capture'), 'capture', 'help')).toMatchObject({
    code: 0,
    stderr: expect.stringContaining('weft capture <command>'),
  })
})
