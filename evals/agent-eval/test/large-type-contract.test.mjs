import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const repo = fileURLToPath(new URL('../../..', import.meta.url))
const ref = join(repo, 'evals/agent-eval/tasks/large-live/reference/weft-warp/src')
const require = createRequire(join(process.env.WEFT_T06_TOOL_ROOT ?? repo, 'package.json'))
const compiler = join(dirname(dirname(require.resolve('typescript'))), 'bin/tsc')
const nodeTypes = dirname(require.resolve('@types/node/package.json'))
const stubs = `
declare module '@weft-js/start/data' { export class StartError extends Error { constructor(code: string, message: string) } }
declare module '@weft-js/start' {
  export interface Context { user: { id: string; name: string } | null }
  export interface PublishOptions { to?: string; volatile?: boolean; exceptSelf?: boolean }
  export interface StandardSchemaV1<I = unknown, O = I> {
    '~standard': { version: 1; vendor: string; validate(value: unknown): { value: O; issues?: undefined } | { issues: { message: string }[]; value?: undefined } | Promise<{ value: O; issues?: undefined } | { issues: { message: string }[]; value?: undefined }> }
  }
}
declare module '@t3-oss/env-core' { export function createEnv(config: unknown): unknown }
declare module 'zod' { export const z: { string(): { min(n: number): { default(value: string): unknown } } } }
`
function compile(dir) {
  return spawnSync(
    process.execPath,
    [compiler, '-p', join(dir, 'tsconfig.json'), '--pretty', 'false'],
    {
      encoding: 'utf8',
    },
  )
}

test('actual multiplayer handler parameter and explicit Node env types reject regressions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-large-types-'))
  try {
    mkdirSync(join(dir, 'node_modules/@types'), { recursive: true })
    symlinkSync(nodeTypes, join(dir, 'node_modules/@types/node'))
    writeFileSync(
      join(dir, 'server.ts'),
      readFileSync(join(repo, 'packages/multiplayer/src/server.ts')),
    )
    writeFileSync(join(dir, 'stubs.d.ts'), stubs)
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          noEmit: true,
          strict: true,
          skipLibCheck: true,
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          types: [],
        },
        include: ['*.ts'],
      }),
    )
    const presence = readFileSync(join(ref, 'server/presence.ts'), 'utf8')
    const params = presence.match(/multiplayer<([^>]+)>/)?.[1]
    assert.equal(params, '{ room: string }')
    const contract = `import { multiplayer } from './server'\nconst mp = multiplayer<${params}>({ user: () => ({ id: 'user' }) })\ntype Room = Parameters<typeof mp.on['mp.hello']>[0]['params']\nconst room: Room = { room: 'board' }\nvoid room\n`
    const env = readFileSync(join(ref, 'env.server.ts'), 'utf8')
    writeFileSync(join(dir, 'contract.ts'), contract)
    writeFileSync(join(dir, 'env.server.ts'), env)
    let child = compile(dir)
    assert.equal(child.status, 0, child.stdout + child.stderr)
    writeFileSync(
      join(dir, 'contract.ts'),
      contract.replace('multiplayer<{ room: string }>', 'multiplayer<{ id: string }>'),
    )
    child = compile(dir)
    assert.notEqual(child.status, 0)
    assert.match(child.stdout, /TS2353.*'room'/)
    writeFileSync(join(dir, 'contract.ts'), contract)
    writeFileSync(
      join(dir, 'env.server.ts'),
      env
        .replace('/// <reference types="node" />\n', '')
        .replace("import process from 'node:process'\n", ''),
    )
    child = compile(dir)
    assert.notEqual(child.status, 0)
    assert.match(child.stdout, /TS2591.*process/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
