// `ui={row}`: a press shows where it didn't happen. Before data-press it was drawn only as data-hold, the same as a
// hover, so pressing a row in one pane looked like nothing more than a hover in the other.
import { createRoot, flush } from '@weft-js/core'
import { interaction } from '@weft-js/core/interaction'
import '../src/ui'

test('a press from here or from elsewhere marks the host data-press, and letting go clears it', () => {
  const el = document.createElement('label')
  createRoot(dispose => {
    const row = interaction()
    const drawn = row.attach(el)
    row.remote.value = { hover: 1, focus: 0, pressed: 0 }
    flush()
    expect(el.hasAttribute('data-hold')).toBe(true)
    expect(el.hasAttribute('data-press')).toBe(false)
    row.remote.value = { hover: 1, focus: 0, pressed: 1 }
    flush()
    expect(el.hasAttribute('data-press')).toBe(true)
    row.remote.value = { hover: 0, focus: 0, pressed: 0 }
    row.pressed.value = true
    flush()
    expect(el.hasAttribute('data-press')).toBe(true)
    row.pressed.value = false
    flush()
    expect(el.hasAttribute('data-press')).toBe(false)
    drawn.destroy()
    dispose()
  }, null)
})
