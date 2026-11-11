// @vitest-environment node
// The page's native scrollbar has to stay hidden while ScrollRail draws one, whatever an app sets on :root. An app
// commonly sets scrollbar-width or scrollbar-color there to style its other scroll areas; an unlayered rule like that
// outranks a plain declaration in veneer's layer, so the page showed two bars. !important in the layer outranks it.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(__dirname, '../styles/layout/scroll-rail.css'), 'utf8')

describe('ScrollRail hides the native page bar for good', () => {
  it('hides it with !important, so an app rule on :root cannot bring it back', () => {
    expect(css).toMatch(
      /html:has\(> body \[data-scope="scroll-rail"\]\)\)\s*\{\s*scrollbar-width:\s*none !important;/,
    )
    expect(css).toMatch(
      /\[data-scope="scroll-rail"\]\)\)::-webkit-scrollbar\s*\{\s*display:\s*none !important;/,
    )
  })
})
