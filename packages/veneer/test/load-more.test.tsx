// LoadMore's end message is for the end: while there is more to load, only the button shows.
import { render } from '@kerf-js/core/test'
import { LoadMore } from '../src/index'

test('the end message shows only once the list is done', () => {
  const more = render(() => <LoadMore onLoad={() => {}} message="That is everything." />)
  expect(more.container.querySelector('[aria-live]')!.textContent).toBe('')
  expect(more.container.querySelector('button')).not.toBeNull()

  const end = render(() => <LoadMore onLoad={() => {}} done message="That is everything." />)
  expect(end.container.querySelector('[aria-live]')!.textContent).toBe('That is everything.')
  expect(end.container.querySelector('button')).toBeNull()
})
