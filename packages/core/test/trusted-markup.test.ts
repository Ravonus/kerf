// Core grants HTML only to its compiler/template and same-origin navigation boundaries, never a default policy.
import { expect, test, vi } from 'vitest'
import { trustedMarkup } from '../src/trusted-markup'

test('named policies are reused and raw markup receives no default policy', () => {
  const createPolicy = vi.fn((_name: string, rules: { createHTML(value: string): string }) => ({
    createHTML: (value: string) => ({ trusted: rules.createHTML(value) }),
  }))
  vi.stubGlobal('trustedTypes', { createPolicy })
  try {
    expect(trustedMarkup('<main/>')).toEqual({ trusted: '<main/>' })
    expect(trustedMarkup('<p/>')).toEqual({ trusted: '<p/>' })
    expect(trustedMarkup('<article/>')).toEqual({ trusted: '<article/>' })
    expect(createPolicy.mock.calls.map((args) => args[0])).toEqual(['kerf-html'])
  } finally {
    vi.unstubAllGlobals()
  }
})
