// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import { state } from '../src/index'
import { flush, render, screen } from '../src/test'

describe('a row can destructure a tuple', () => {
  test('`Object.entries(x).map(([k, v]) => …)` renders and follows the value', async () => {
    const seen = state<Record<string, string>>({ a: 'one' })
    render(() => (
      <ul>
        {Object.entries(seen.value).map(([id, name]) => (
          <li key={id}>
            {id}={name}
          </li>
        ))}
      </ul>
    ))
    expect(screen.getByRole('listitem').textContent).toBe('a=one')
    seen.value = { a: 'two', b: 'three' }
    await flush()
    expect(screen.getAllByRole('listitem').map((l) => l.textContent)).toEqual(['a=two', 'b=three'])
  })
})
