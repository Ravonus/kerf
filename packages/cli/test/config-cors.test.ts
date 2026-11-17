import { expect, it } from 'vitest'
import { configSchema } from '../src/load-config.mjs'

it('CORS accepts named origins or a credential-free wildcard, and rejects unsafe or malformed config', () => {
  for (const cors of [
    { origins: '*' },
    { origins: '*', credentials: false },
    { origins: ['https://partner.example'], credentials: true, headers: ['x-agorix-grant'] },
  ])
    expect(configSchema.safeParse({ site: { cors } }).success).toBe(true)
  for (const cors of [
    { origins: '*', credentials: true },
    { origins: ['https://partner.example/path'] },
    { origins: ['null'] },
    { origins: [], headers: ['bad header'] },
  ])
    expect(configSchema.safeParse({ site: { cors } }).success).toBe(false)
})
