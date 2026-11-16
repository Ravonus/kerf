import { describe, expect, it } from 'vitest'
import { routesCommand } from '../src/start.mjs'
import { metaTable } from '../src/meta-table.mjs'
import { docs } from '../src/docs.mjs'
import { project } from './helpers.mjs'

describe('HTTP route diagnostics and discovery', () => {
  it('lists server-only methods and rejects a GET collision with H018', async () => {
    const good = project({
      'src/routes/index.tsx': 'export default () => null',
      'src/routes/index.http.ts': 'export function POST() {}',
    })
    const table = await routesCommand(good)
    expect(table.ok).toBe(true)
    expect(metaTable(table)).toContain('/  HTTP POST')
    expect(table.routes).toContainEqual(
      expect.objectContaining({ path: '/', kind: 'http', methods: ['POST'] }),
    )
    const bad = project({
      'src/routes/[id].tsx': 'export default () => null',
      'src/routes/[name].http.ts': 'export function GET() {}',
    })
    const collision = await routesCommand(bad)
    expect(collision.ok).toBe(false)
    expect(collision.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'H018', severity: 'error' }),
    )
  })

  it('documents declaration errors in kerf docs diagnostics', async () => {
    const root = project()
    const page = await docs(root, 'diagnostics')
    expect(page.text).toContain('H018')
    expect(page.text).toContain('H019')
    expect((await docs(root, 'start')).text).toContain('name.http.ts')
    expect((await docs(root, 'config')).text).toContain('site.cors')
  })
})
