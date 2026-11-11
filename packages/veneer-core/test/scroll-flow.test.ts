// The scroll flow's fallback (flow.ts): where view() is missing it watches what the CSS moves, read from the sheets.
import { expect, test, vi } from 'vitest'
import { flow } from '../src/flow'

test('the fallback watches what the sheet flows, and a sheet that comes late still counts', async () => {
  const seen: Element[] = []
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe(el: Element) {
        seen.push(el)
      }
    },
  )
  vi.stubGlobal('CSS', { supports: () => false })
  document.body.innerHTML =
    '<table data-scope="table"><tbody><tr id="a"><td></td></tr></tbody></table><div data-scope="kanban" id="k"></div>'
  flow(document)
  expect(seen).toEqual([]) // not armed: the page holds still until a person scrolls
  document.dispatchEvent(new Event('scroll'))
  expect(seen).toEqual([]) // armed, but no sheet yet: nothing is watched, so nothing can be held back
  const style = document.createElement('style')
  style.textContent =
    '@media screen { @supports (animation-timeline: view()) { :where([data-scope="table"] tbody > tr) { --_flow-r: 1; } } }'
  document.head.append(style)
  const row = document.createElement('tr')
  document.querySelector('tbody')!.append(row)
  await new Promise((r) => {
    setTimeout(r)
  })
  expect(seen).toContain(document.getElementById('a'))
  expect(seen).toContain(row)
  expect(seen).not.toContain(document.getElementById('k'))
  vi.unstubAllGlobals()
})
