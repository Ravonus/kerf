// @vitest-environment node
// A generated shape with no markup of its own (one component the compiler can't see into) is marked thin, so
// navigation shows a page outline in its place instead of a blank outlet.
import { describe, expect, it } from 'vitest'
import { thinShape } from '../vite/shapes.mjs'

const tpl = (html: string) => `const t = _$tpl(${JSON.stringify(html)});`

describe('thinShape', () => {
  it('is thin when the templates hold only the skeleton scope and bars', () => {
    expect(thinShape(tpl('<div data-scope="skeleton-scope" aria-busy="true"></div>'))).toBe(true)
    expect(thinShape(tpl('<span data-skeleton class="x"></span>'))).toBe(true)
    expect(thinShape('export default () => null')).toBe(true)
  })

  it('is not thin once a template has structure of its own', () => {
    expect(
      thinShape(tpl('<div data-scope="skeleton-scope"><h1><span data-skeleton></span></h1></div>')),
    ).toBe(false)
    expect(thinShape(tpl('<article></article>'))).toBe(false)
  })
})
