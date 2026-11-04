import { vi } from 'vitest'
import { highlight } from '../src/code'
import { copyButtons } from '../src/copy'

test('highlight preserves indentation, escaping and the copied source', async () => {
  const source = 'const x = "<&"\n  if (x) {\n    return x\n  }'
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  document.body.innerHTML = `<div data-scope="codeblock"><button data-act="copy"></button><code>${highlight(source)}</code></div>`
  const lines = [...document.querySelectorAll<HTMLElement>('[data-part="line"]')]
  expect(lines.map((line) => line.style.getPropertyValue('--indent'))).toEqual([
    '0ch',
    '2ch',
    '4ch',
    '2ch',
  ])
  expect(lines.map((line) => line.textContent).join('\n')).toBe(source)
  expect(document.querySelector('code')!.innerHTML).toContain('&lt;&amp;')
  const stop = copyButtons()
  document.querySelector<HTMLButtonElement>('button')!.click()
  await Promise.resolve()
  await Promise.resolve()
  expect(writeText).toHaveBeenCalledWith(source)
  stop()
  document.body.replaceChildren()
})
