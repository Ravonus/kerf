// Every way to scaffold sign-in has the table Better Auth's jwt plugin signs with: `createAuth` turns it on by default.
import { describe, expect, it } from 'vitest'
import { authFiles, sharedAuthTables } from '../src/stack.mjs'

describe('the jwks table', () => {
  for (const db of ['sqlite', 'postgres', 'mysql'])
    for (const [layer, table] of [
      ['drizzle', 'export const jwks ='],
      ['prisma', '@@map("jwks")'],
      ['native', 'jwks'],
    ])
      it(`${layer} on ${db}`, () => {
        const { tables } = authFiles({ db, layer, ui: 'none' })
        expect(tables).toContain(table)
        expect(tables).toMatch(/publicKey/)
        expect(tables).toMatch(/privateKey/)
      })

  it("in a template, under Better Auth's own column names", () => {
    expect(sharedAuthTables()).toContain("publicKey: text('publicKey').notNull()")
    expect(sharedAuthTables()).toContain(
      "expiresAt: timestamp('expiresAt', { withTimezone: true })",
    )
  })

  it('agents are told login is not a JWT only when the app has it', async () => {
    const { agentsFile } = await import('../src/templates.mjs')
    expect(
      agentsFile({ ui: 'veneer', db: 'postgres', layer: 'drizzle', auth: true, shipped: undefined }),
    ).toContain('never a JWT')
    expect(
      agentsFile({ ui: 'veneer', db: 'postgres', layer: 'drizzle', auth: false, shipped: undefined }),
    ).not.toContain('JWT')
  })
})
