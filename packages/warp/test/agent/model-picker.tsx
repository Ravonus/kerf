import { flush, render } from '@weft-js/core/test'
import { Toaster } from '../../src/Toast'
import { ModelPicker } from '../../src/agent/ModelPicker'
import { key } from './support'

const MODELS = [
  {
    id: 'a',
    name: 'Large',
    provider: 'One',
    capabilities: ['tools'],
    context: '200k',
    cost: '$$$',
  },
  { id: 'b', name: 'Small', short: 'S', provider: 'Two', context: '8k', cost: '$' },
]

export function registerModelPickerGroupedOptionsKeysA() {
  test('ModelPicker: grouped options, keys, a pick closes and returns focus', async () => {
    const seen: string[] = []
    const { container: c } = render(() => (
      <>
        <Toaster />
        <ModelPicker models={MODELS} onChange={(v) => seen.push(v)} />
      </>
    ))
    await flush()
    const chip = c.querySelector<HTMLElement>('[data-part="model"]')!
    chip.focus()
    chip.click()
    await flush()
    expect(chip.getAttribute('aria-expanded')).toBe('true')
    const opts = [...c.querySelectorAll<HTMLElement>('[role="option"]')]
    expect(c.querySelectorAll('[role="listbox"] [role="group"]').length).toBe(2)
    expect(document.activeElement).toBe(opts[0])
    expect(opts[0]!.textContent).toContain('tools')
    expect(opts[0]!.textContent).toContain('200k · $$$')
    key(opts[0]!, 'ArrowDown')
    expect(document.activeElement).toBe(opts[1])
    key(opts[1]!, 'Enter')
    await flush()
    expect(seen).toEqual(['b'])
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(chip)
    expect(chip.textContent).toContain('Small')
  })
  test('Escape closes the picker with no change, and the compact chip shows the short name', async () => {
    const seen = vi.fn()
    const { container: c } = render(() => (
      <ModelPicker models={MODELS} value="b" compact onChange={seen} />
    ))
    await flush()
    const chip = c.querySelector<HTMLElement>('[data-part="model"]')!
    expect(chip.textContent).toContain('S')
    chip.click()
    await flush()
    key(document.activeElement!, 'Escape')
    await flush()
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    expect(seen).not.toHaveBeenCalled()
  })
}
