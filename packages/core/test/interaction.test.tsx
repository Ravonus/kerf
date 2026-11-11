// Research 45: boxes, one row per key, and what reaches the line.
import { createRoot, flush, watch } from '@kerf-js/core'
import { bitsOf, interaction, seams } from '@kerf-js/core/interaction'

afterEach(() => {
  seams.line = undefined
})

test('with no share it is three plain boxes, each call its own', () => {
  createRoot((dispose) => {
    const a = interaction(),
      b = interaction()
    a.hover.value = true
    expect(b.hover.value).toBe(false)
    expect(a.remote.value).toEqual({ hover: 0, focus: 0, pressed: 0 })
    dispose()
  })
})

test('same key, same row; the line opens once and closes with the last owner', () => {
  const sent: number[] = []
  let opened = 0,
    left = 0
  seams.line = () => {
    opened++
    return {
      set: (b) => void sent.push(b),
      leave() {
        left++
      },
    }
  }
  let one!: () => void, two!: () => void
  const a = createRoot((d) => {
    one = d
    return interaction({ share: 'k' })
  }, null)
  const b = createRoot((d) => {
    two = d
    return interaction({ share: 'k' })
  }, null)
  expect(a).toBe(b)
  expect(opened).toBe(1)
  a.hover.value = true
  flush()
  expect(sent).toEqual([bitsOf(true, false, false)])
  one()
  expect(left).toBe(0)
  two()
  expect(left).toBe(1)
})

test('what arrives touches `remote` only, so local logic stays still and nothing goes back out', () => {
  const sent: number[] = []
  let heard!: Parameters<NonNullable<typeof seams.line>>[1]
  seams.line = (_, h) => {
    heard = h
    return { set: (b) => void sent.push(b), leave() {} }
  }
  createRoot((dispose) => {
    const ui = interaction({ share: 'r' })
    let runs = 0
    watch(
      () => ui.hover.value,
      (on) => {
        if (on) runs++
      },
    )
    flush()
    heard({ hover: 2, focus: 0, pressed: 0 })
    flush()
    expect(ui.remote.value.hover).toBe(2)
    expect(ui.hover.value).toBe(false)
    expect(runs).toBe(0)
    expect(sent).toEqual([])
    dispose()
  })
})
