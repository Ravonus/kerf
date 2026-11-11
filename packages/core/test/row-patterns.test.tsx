import { expect, test } from 'vitest'
import { state } from '@kerf-js/core'
import { flush, render, screen } from '@kerf-js/core/test'

function Rows({ rows }: { rows: () => [string, { name: [string] }, ...number[]][] }) {
  return (
    <ul>
      {rows().map(
        ([
          id,
          {
            name: [first],
          },
          ...more
        ]) => (
          <li key={id}>
            {first}:{more.length}
          </li>
        ),
      )}
    </ul>
  )
}

test('a row destructures nested patterns and a rest, and stays live', async () => {
  const rows = state<[string, { name: [string] }, ...number[]][]>([['a', { name: ['Ann'] }, 1, 2]])
  render(() => <Rows rows={() => rows.value} />)
  expect(screen.getByRole('listitem').textContent).toBe('Ann:2')
  rows.value = [['a', { name: ['Bea'] }, 1, 2, 3]]
  await flush()
  expect(screen.getByRole('listitem').textContent).toBe('Bea:3')
})
