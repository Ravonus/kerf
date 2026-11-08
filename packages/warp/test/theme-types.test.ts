import { expect, test } from 'vitest'
import type { WarpOptions } from '../plugin.mjs'

const options: WarpOptions = {
  system: { space: { page: 24 }, text: { code: { family: 'mono', size: 14 } } },
  parts: { 'text/code': { font: { family: 'mono', size: 14 } } },
}
void options

const invalid: WarpOptions = {
  parts: { 'text/code': { font: {
    // @ts-expect-error Code has no font weight consumer in the type shim.
    weight: 500,
  } } },
}
void invalid

test('keeps the classified type role options', () => {
  expect(options.parts?.['text/code']?.font?.size).toBe(14)
})
