import { screen, within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { mount } from '#adapter'
import { Board } from './solution'

const initialTasks = () => [
  { id: '1', title: 'Write docs', done: false },
  { id: '2', title: 'Write tests', done: false },
  { id: '3', title: 'Ship', done: true },
]
function setup() {
  const user = userEvent.setup()
  mount(Board, { initialTasks: initialTasks() })
  return { user }
}
const col = (label: string) => screen.getByRole('region', { name: label })
const titles = (label: string) => within(col(label)).queryAllByTestId('title').map(t => t.textContent?.trim())
const heading = (label: string) => within(col(label)).getByRole('heading').textContent?.trim()
const note = (title: string) => screen.getByLabelText(`Note for ${title}`) as HTMLInputElement
const filter = () => screen.getByLabelText('Filter') as HTMLInputElement
const toggle = (user: ReturnType<typeof userEvent.setup>, title: string) => user.click(screen.getByRole('checkbox', { name: title }))

test('counts in headings', () => {
  setup()
  expect(heading('Todo')).toBe('Todo (2)')
  expect(heading('Done')).toBe('Done (1)')
})

test('filter applies to both columns and the counts', async () => {
  const { user } = setup()
  await user.type(filter(), 'WRITE')
  expect(titles('Todo')).toEqual(['Write docs', 'Write tests'])
  expect(titles('Done')).toEqual([])
  expect(heading('Done')).toBe('Done (0)')
  await user.clear(filter())
  await user.type(filter(), 'docs')
  expect(titles('Todo')).toEqual(['Write docs'])
  expect(heading('Todo')).toBe('Todo (1)')
})

test('toggling while filtered moves the task and updates counts', async () => {
  const { user } = setup()
  await user.type(filter(), 'write')
  await toggle(user, 'Write docs')
  expect(titles('Todo')).toEqual(['Write tests'])
  expect(titles('Done')).toEqual(['Write docs'])
  expect(heading('Done')).toBe('Done (1)')
})

test('adding respects the active filter', async () => {
  const { user } = setup()
  await user.type(filter(), 'write')
  await user.type(screen.getByLabelText('New task'), 'Write blog{Enter}')
  await user.type(screen.getByLabelText('New task'), 'Deploy')
  await user.click(screen.getByRole('button', { name: 'Add' }))
  expect((screen.getByLabelText('New task') as HTMLInputElement).value).toBe('')
  expect(titles('Todo')).toEqual(['Write docs', 'Write tests', 'Write blog'])
  await user.clear(filter())
  expect(titles('Todo')).toEqual(['Write docs', 'Write tests', 'Write blog', 'Deploy'])
  await user.type(screen.getByLabelText('New task'), '   ')
  await user.click(screen.getByRole('button', { name: 'Add' }))
  expect(heading('Todo')).toBe('Todo (4)')
})

test('a note survives being filtered out and back', async () => {
  const { user } = setup()
  await user.type(note('Ship'), 'after review')
  await user.type(filter(), 'write')
  expect(screen.queryByLabelText('Note for Ship')).toBeNull()
  await user.clear(filter())
  expect(note('Ship').value).toBe('after review')
})

test('a note follows its task to the other column', async () => {
  const { user } = setup()
  await user.type(note('Write tests'), 'unit + e2e')
  await toggle(user, 'Write tests')
  expect(titles('Done')).toContain('Write tests')
  expect(note('Write tests').value).toBe('unit + e2e')
  expect(note('Write docs').value).toBe('')
})

test('notes stay with their task while the filter narrows', async () => {
  const { user } = setup()
  await user.type(note('Write tests'), 'tests-note')
  await user.type(filter(), 'tests')
  expect(note('Write tests').value).toBe('tests-note')
})
