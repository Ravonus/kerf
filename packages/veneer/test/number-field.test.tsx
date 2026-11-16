import { state } from '@kerf-js/core'
import { render } from '@kerf-js/core/test'
import userEvent from '@testing-library/user-event'
import { NumberField } from '../src/NumberField'

const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve))
afterEach(() => { document.body.innerHTML = '' })

function mount() {
  const value = state<number | null>(12), heard: (number | null)[] = []
  const { container } = render(() => <NumberField label="Size" min={4} max={144} step={.5}
    value={value.value} onValueChange={(next) => { value.value = next; heard.push(next) }} />)
  return { value, heard, container, input: container.querySelector<HTMLInputElement>('[role="spinbutton"]')! }
}
async function replace(input: HTMLInputElement, user: ReturnType<typeof userEvent.setup>, text: string) {
  input.focus()
  input.select()
  await user.keyboard(text)
  await tick()
}

describe('NumberField drafts', () => {
  test('human digit input18 stays18 with min4 and primitive controlled props', async () => {
    const { value, heard, input } = mount(), user = userEvent.setup()
    await tick()
    await replace(input, user, '18')
    expect(input.value).toBe('18')
    expect(value.value).toBe(18)
    expect(heard).toEqual([18])
    expect(document.activeElement).toBe(input)
    expect(input.getAttribute('aria-valuenow')).toBe('18')
  })
  test('partial decimals and repeated focused edits preserve the raw draft', async () => {
    const { value, heard, input } = mount(), user = userEvent.setup()
    await tick()
    await replace(input, user, '8.')
    expect(input.value).toBe('8.')
    expect(value.value).toBe(8)
    await user.keyboard('5')
    expect(input.value).toBe('8.5')
    expect(value.value).toBe(8.5)
    expect(heard).toEqual([8, 8.5])
    input.blur()
    await replace(input, user, '18')
    expect(input.value).toBe('18')
    expect(value.value).toBe(18)
    expect(document.activeElement).toBe(input)
  })
  test('out-of-range drafts emit no invalid values and clamp on Enter or blur', async () => {
    const { value, heard, input } = mount(), user = userEvent.setup()
    await tick()
    await replace(input, user, '1')
    expect(input.value).toBe('1')
    expect(value.value).toBe(12)
    expect(heard).toEqual([])
    await user.keyboard('{Enter}')
    expect(input.value).toBe('4')
    expect(value.value).toBe(4)
    await replace(input, user, '999')
    expect(input.value).toBe('999')
    expect(value.value).toBe(99)
    input.blur()
    await tick()
    expect(input.value).toBe('144')
    expect(value.value).toBe(144)
    expect(heard.every(next => next === null || next >= 4 && next <= 144)).toBe(true)
  })
  test('Escape discards an invalid draft before the event reaches its parent', async () => {
    const { value, heard, container, input } = mount(), user = userEvent.setup(), bubbled: string[] = []
    container.addEventListener('keydown', event => { if (event.key === 'Escape') bubbled.push(input.value) })
    await tick()
    await replace(input, user, '-')
    expect(input.value).toBe('-')
    await user.keyboard('{Escape}')
    expect(input.value).toBe('12')
    expect(value.value).toBe(12)
    expect(heard).toEqual([])
    expect(bubbled).toEqual(['12'])
  })
  test('arrows, page keys, Home/End and steppers keep bounded draft-aware behavior', async () => {
    const { value, container, input } = mount(), user = userEvent.setup()
    await tick()
    await replace(input, user, '8.5')
    await user.keyboard('{ArrowUp}')
    expect(value.value).toBe(9)
    await user.keyboard('{PageDown}')
    expect(value.value).toBe(4)
    await user.keyboard('{End}')
    expect(value.value).toBe(144)
    await user.keyboard('{Home}')
    expect(value.value).toBe(4)
    await replace(input, user, '1')
    await user.click(container.querySelector<HTMLButtonElement>('[aria-label="Increase"]')!)
    expect(value.value).toBe(4)
    expect(input.value).toBe('4')
  })
})
