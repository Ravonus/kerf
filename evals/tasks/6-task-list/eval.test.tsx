import { screen, within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { mount } from '#adapter'
import { TaskList } from './solution'

const initialTasks = [
  { id: '1', title: 'Write' },
  { id: '2', title: 'Test' },
  { id: '3', title: 'Ship' },
]
function setup() {
  const user = userEvent.setup()
  mount(TaskList, { initialTasks: initialTasks.map(t => ({ ...t })) })
  return { user }
}
const titles = () =>
  within(screen.getByRole('list', { name: 'Tasks' }))
    .getAllByRole('listitem')
    .map(li => within(li).getByTestId('title').textContent?.trim())
const note = (title: string) => screen.getByLabelText(`Note for ${title}`) as HTMLInputElement
const click = (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(screen.getByRole('button', { name }))
const count = () => screen.getByTestId('count').textContent?.trim()

test('renders tasks and count', () => {
  setup()
  expect(titles()).toEqual(['Write', 'Test', 'Ship'])
  expect(count()).toBe('3 tasks')
})

test('notes follow their task when moved', async () => {
  const { user } = setup()
  await user.type(note('Write'), 'w-note')
  await click(user, 'Move down Write')
  expect(titles()).toEqual(['Test', 'Write', 'Ship'])
  expect(note('Write').value).toBe('w-note')
  expect(note('Test').value).toBe('')
  await click(user, 'Move up Ship')
  expect(titles()).toEqual(['Test', 'Ship', 'Write'])
  expect(note('Write').value).toBe('w-note')
  expect(note('Ship').value).toBe('')
})

test('moving past the ends does nothing', async () => {
  const { user } = setup()
  await click(user, 'Move up Write')
  await click(user, 'Move down Ship')
  expect(titles()).toEqual(['Write', 'Test', 'Ship'])
})

test('remove keeps the other notes', async () => {
  const { user } = setup()
  await user.type(note('Test'), 't-note')
  await user.type(note('Ship'), 's-note')
  await click(user, 'Remove Write')
  expect(titles()).toEqual(['Test', 'Ship'])
  expect(note('Test').value).toBe('t-note')
  expect(note('Ship').value).toBe('s-note')
  expect(count()).toBe('2 tasks')
  await click(user, 'Remove Test')
  expect(count()).toBe('1 task')
  expect(note('Ship').value).toBe('s-note')
})

test('add appends, clears input, ignores blanks', async () => {
  const { user } = setup()
  await user.type(note('Write'), 'keep')
  await user.type(screen.getByLabelText('New task'), '  Deploy  ')
  await click(user, 'Add')
  expect(titles()).toEqual(['Write', 'Test', 'Ship', 'Deploy'])
  expect((screen.getByLabelText('New task') as HTMLInputElement).value).toBe('')
  expect(note('Deploy').value).toBe('')
  expect(note('Write').value).toBe('keep')
  await user.type(screen.getByLabelText('New task'), 'Review{Enter}')
  expect(titles()).toEqual(['Write', 'Test', 'Ship', 'Deploy', 'Review'])
  await user.type(screen.getByLabelText('New task'), '   ')
  await click(user, 'Add')
  expect(count()).toBe('5 tasks')
})

test('notes follow their task when sorted', async () => {
  const { user } = setup()
  await user.type(note('Write'), 'w')
  await user.type(note('Test'), 't')
  await click(user, 'Sort A-Z')
  expect(titles()).toEqual(['Ship', 'Test', 'Write'])
  expect(note('Write').value).toBe('w')
  expect(note('Test').value).toBe('t')
  expect(note('Ship').value).toBe('')
})

test('new task with a note survives a sort', async () => {
  const { user } = setup()
  await user.type(screen.getByLabelText('New task'), 'Alpha{Enter}')
  await user.type(note('Alpha'), 'first')
  await click(user, 'Sort A-Z')
  expect(titles()[0]).toBe('Alpha')
  expect(note('Alpha').value).toBe('first')
})
