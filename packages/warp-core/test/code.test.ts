import { vi } from 'vitest'
import { highlight, tokenize } from '../src/code'
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

test('editor tokens keep keyword case, captures, offsets and comment precedence', () => {
  const source = 'CONST value = "return 7"; // false 9\nselect value -- null\n# import'
  expect(tokenize(source).map(({ kind, start, end }) => [kind, source.slice(start, end)])).toEqual([
    ['keyword', 'CONST'],
    ['string', '"return 7"'],
    ['comment', '// false 9'],
    ['keyword', 'select'],
    ['comment', '-- null'],
    ['comment', '# import'],
  ])
  expect(tokenize('true + 42', 'unknown')).toEqual([
    { kind: 'keyword', start: 0, end: 4 },
    { kind: 'number', start: 7, end: 9 },
  ])
  expect(tokenize('{"return": "false", "n": -2.5e+3}', 'json').map((span) => span.kind)).toEqual([
    'string',
    'number',
  ])
})

test.each(['tsx', 'jsx', 'ts', 'js', 'mjs', 'jsonc'])(
  '%s preview retains tags, names, escaped strings and multiline comments',
  (language) => {
    const source = 'const View = <Button title="<&">42</Button>\n/* return\n  false */'
    const box = document.createElement('div')
    const html = highlight(source, language)
    box.innerHTML = html
    const spans = [...box.querySelectorAll('span[class]')].map((span) => [
      span.className,
      span.textContent,
    ])
    expect(spans).toEqual([
      ['k', 'const'],
      ['t', 'View'],
      ['t', 'Button'],
      ['s', '"<&"'],
      ['n', '42'],
      ['t', 'Button'],
      ['c', '/* return'],
      ['c', '  false */'],
    ])
    expect([...box.children].map((line) => line.textContent).join('\n')).toBe(source)
    tokenize('return 3')
    expect(highlight(source, language)).toBe(html)
  },
)
