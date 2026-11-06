import { describe, expect, it } from 'vitest'
import { reportFindings } from '../src/audit/report.mjs'

const findings = () =>
  new Map([
    [
      'L024 robots',
      {
        code: 'L024',
        text: 'meta noindex and x-robots-tag: noindex',
        header: true,
        routes: new Set(['/']),
        forms: new Set(['phone']),
      },
    ],
  ])

describe('explicit public indexing', () => {
  it('refuses a public release when markup or a proxy blocks indexing', () => {
    expect(reportFindings(findings(), ['/'], ['phone'], 'public')[0]?.severity).toBe('error')
  })
  it('preserves intentional private and backward-compatible exclusions', () => {
    expect(reportFindings(findings(), ['/'], ['phone'], 'private')[0]?.severity).toBe('warning')
    expect(reportFindings(findings(), ['/'], ['phone'])[0]?.severity).toBe('warning')
  })
  it('does not promise that a host header disappears on production', () => {
    const finding = reportFindings(findings(), ['/'], ['phone'], 'public')[0]!
    expect(finding).toHaveProperty('why', expect.stringContaining('host or proxy'))
    expect(finding).not.toHaveProperty(
      'why',
      expect.stringContaining('on the production URL it is gone'),
    )
  })
})
