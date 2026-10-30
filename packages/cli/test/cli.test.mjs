import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bin, fixture, project, spreadBug } from './helpers.mjs'

const weft = (...args) => {
  const r = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' })
  return { code: r.status, stdout: r.stdout, stderr: r.stderr }
}

describe('weft (bin)', () => {
  it('routes and routes --meta read an app with src/routes (@weft/start from the workspace)', () => {
    const app = join(import.meta.dirname, '../../start/test/fixtures/app')
    const list = JSON.parse(weft('routes', '--json', '--root', app).stdout)
    expect(list.routes.map(r => r.path)).toContain('/users/[id]')
    const r = weft('routes', '--meta', '--json', '--root', app)
    expect(r.code).toBe(1) // the fixture's /deferred-meta route is an H007 on purpose
    const meta = JSON.parse(r.stdout)
    expect(meta.routes.find(x => x.path === '/about').meta.title).toBe('About · Acme')
    expect(meta.diagnostics).toMatchObject([{ code: 'H007', file: 'src/routes/deferred-meta.tsx', span: [expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number)], docs: 'weft docs H007' }])
    expect(r.stderr).toMatch(/^src\/routes\/deferred-meta\.tsx:\d+:\d+ {2}H007 error/m)
  }, 60_000)

  it('check --json: JSON on stdout, human text on stderr, exit 0 on the reference', () => {
    const r = weft('check', '--json', '--root', fixture)
    expect(r.code).toBe(0)
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, summary: { files: 6 } })
    expect(r.stderr).toContain('weft check: 6 files, 0 errors, 0 warnings')
  })

  it('check exits 1 when there are errors, and prints them for humans', () => {
    const app = readFileSync(join(fixture, 'src/App.tsx'), 'utf8')
    const r = weft('check', '--root', project({ 'src/App.tsx': app.replace(...spreadBug) }))
    expect(r.code).toBe(1)
    expect(r.stdout).toBe('')
    expect(r.stderr).toMatch(/^src\/App\.tsx:21:44 {2}W014 error/m)
  })

  it('tasks --json and docs work from the bin', () => {
    expect(JSON.parse(weft('tasks', '--json', '--root', fixture).stdout).tasks[0].name).toBe('check')
    expect(weft('docs', 'W015', '--root', fixture).stdout).toContain('# W015')
  })

  it('db and start refuse what they can\'t do, with a usage error', () => {
    const dir = project()
    expect(weft('db', 'push', '--root', dir)).toMatchObject({ code: 2, stderr: expect.stringContaining('use generate') })
    expect(weft('start', '--runtime', 'workerd', '--root', dir)).toMatchObject({ code: 2, stderr: expect.stringContaining('unknown runtime') })
  })

  it('agents-md --check exits 1 when AGENTS.md is missing or stale', () => {
    const dir = project()
    expect(weft('agents-md', '--check', '--root', dir).code).toBe(1)
    expect(weft('agents-md', '--root', dir).code).toBe(0)
    expect(weft('agents-md', '--check', '--json', '--root', dir)).toMatchObject({ code: 0, stdout: expect.stringContaining('"current": true') })
  })

  it('usage errors exit 2 with a stable code', () => {
    const r = weft('frobnicate', '--json')
    expect(r.code).toBe(2)
    expect(JSON.parse(r.stdout)).toEqual({ ok: false, error: { code: 'E_USAGE', message: 'unknown command frobnicate' } })
    expect(weft('check', '--wat').code).toBe(2)
  })
})
