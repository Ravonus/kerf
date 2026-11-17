import { screen } from '@testing-library/dom'
import { state } from '@kerf-js/core'
import { flush, render } from '@kerf-js/core/test'

// kerf-allow T005: node identity and local state prove a refetch did not remount the active editor.
test('a truthy object replacement updates props without remounting a ternary branch', async () => {
  const row = state<{ label: string } | null>({ label: 'Before' })
  function Editor(props: { row: { label: string } }) {
    const edited = state(false)
    return (
      <button onClick={() => (edited.value = true)}>
        {props.row.label} {edited.value ? 'edited' : 'fresh'}
      </button>
    )
  }
  render(() => <div>{row.value ? <Editor row={row.value} /> : <p>Empty</p>}</div>)
  const original = screen.getByRole('button')
  original.click()
  await flush()
  row.value = { label: 'After' }
  await flush()
  expect(screen.getByRole('button')).toBe(original)
  expect(original.textContent).toBe('After edited')
  row.value = null
  await flush()
  expect(screen.queryByRole('button')).toBeNull()
  row.value = { label: 'New' }
  await flush()
  expect(screen.getByRole('button').textContent).toBe('New fresh')
})
