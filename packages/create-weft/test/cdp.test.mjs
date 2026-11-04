// A launch that fails must not leave its Chrome running: the packed gates run many in a row.
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { launch } from '../scripts/cdp.mjs'

const fakeChrome = (body) => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-fake-chrome-'))
  const exe = join(dir, 'chrome')
  writeFileSync(exe, `#!/bin/sh\n${body}\n`)
  chmodSync(exe, 0o755)
  return { dir, exe }
}
const profiles = () => new Set(readdirSync(tmpdir()).filter((f) => f.startsWith('weft-chrome-')))

test.skipIf(process.platform === 'win32')(
  'a Chrome whose debugger never answers is killed, with its profile',
  async () => {
    // skipped on Windows: the fake is a shell script
    const { dir, exe } = fakeChrome(
      'echo $$ > "$(dirname "$0")/pid"\necho "DevTools listening on ws://127.0.0.1:9/none" >&2\nexec sleep 60',
    )
    const before = profiles()
    await expect(launch(exe)).rejects.toThrow()
    const pid = Number(readFileSync(join(dir, 'pid'), 'utf8'))
    expect(() => process.kill(pid, 0)).toThrow()
    expect([...profiles()].filter((p) => !before.has(p))).toEqual([])
    rmSync(dir, { recursive: true })
  },
)

test.skipIf(process.platform === 'win32')(
  'a Chrome that exits at once fails the launch straight away',
  async () => {
    // skipped on Windows: the fake is a shell script
    const { dir, exe } = fakeChrome('exit 3')
    const started = Date.now()
    await expect(launch(exe)).rejects.toThrow(/exited with 3/)
    expect(Date.now() - started).toBeLessThan(5000)
    expect(existsSync(dir)).toBe(true)
    rmSync(dir, { recursive: true })
  },
)
