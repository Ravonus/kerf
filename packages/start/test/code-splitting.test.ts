// A fresh app's `kerf build` prints no bundler deprecation or unlabeled chunk group, from Kerf's config or Nitro's.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { build, resolveConfig } from 'vite'
import kerfStart from '../src/vite.mjs'
import { KIT_CHUNKS, labelChunkGroups } from '../src/vite/shared.mjs'

const made: string[] = []
const tmp = (prefix: string) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  made.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const write = (root: string, files: Record<string, string>) => {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
}

type Group = { name: unknown; debugName?: string }
type Output = { codeSplitting?: { groups?: Group[] }; advancedChunks?: unknown }

describe('code-splitting groups', () => {
  it("puts the client's kit chunks in `codeSplitting`, each with a debugName", async () => {
    const root = tmp('kerf-chunks-')
    write(root, { 'src/routes/index.tsx': 'export default () => <h1>Hi</h1>\n' })
    const config = await resolveConfig(
      { configFile: false, root, plugins: [kerfStart({ root })], logLevel: 'silent' },
      'build',
    )
    const client = config.environments.client!.build
    const output = (client.rolldownOptions?.output ?? client.rollupOptions?.output) as Output
    expect(output.advancedChunks).toBeUndefined()
    expect(output.codeSplitting?.groups?.map((g) => g.debugName)).toEqual(['icons', 'kit'])
  })

  it("labels Nitro's server group, so Rolldown builds the groups without a warning", async () => {
    // the shape Nitro's server bundle config has (nitro/dist/vite.mjs): a chunk per package, named by a function
    const nitro = labelChunkGroups(
      { output: { codeSplitting: { groups: [{ test: /node_modules/, name: () => 'lib' }] } } },
      'nitro',
    ) as { output: Output }
    expect(nitro.output.codeSplitting?.groups?.[0]?.debugName).toBe('nitro 0')
    const root = tmp('kerf-groups-')
    write(root, {
      'entry.js': "import('./node_modules/a/index.js').then((m) => console.log(m.a))\n",
      'node_modules/a/index.js': 'export const a = 1\n',
    })
    const logs: string[] = []
    await build({
      configFile: false,
      root,
      logLevel: 'silent',
      build: {
        write: false,
        rolldownOptions: {
          input: join(root, 'entry.js'),
          onLog: (_level, log) => void logs.push(`${log.code}: ${log.message}`),
          output: {
            codeSplitting: {
              groups: [...KIT_CHUNKS, ...nitro.output.codeSplitting!.groups!] as never,
            },
          },
        },
      },
    })
    expect(logs.filter((l) => /DEBUG_NAME|debugName|advancedChunks/.test(l))).toEqual([])
  })
})
