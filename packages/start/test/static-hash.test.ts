// A static level is skipped on refresh when its hash holds: what an island shows inside isn't part of it.
import { outsideIslands } from '../src/server/render'

const island = (props: string, inside: string) =>
  `<!--wi:["a.tsx#1","0",[${props}]]--><!--[-->${inside}<!--]-->`

test('what an island renders inside is left out; the page around it and its props stay', () => {
  const page = (inside: string, props = '1') => `<h1>Menu</h1>${island(props, inside)}<p>after</p>`
  expect(outsideIslands(page('<ul><li>one</li></ul>'))).toBe(
    outsideIslands(page('<ul><li>one</li><li>two</li></ul>')),
  )
  expect(outsideIslands(page('x'))).not.toBe(outsideIslands(page('x', '2')))
  expect(outsideIslands(page('x'))).toBe('<h1>Menu</h1><!--wi:["a.tsx#1","0",[1]]--><p>after</p>')
})

test('holes and islands nested inside an island go with it; the ones after it are their own', () => {
  const h = `${island('1', '<!--[--><b>1</b><!--]-->' + island('2', '<!--[-->deep<!--]-->'))}<i>mid</i>${island('3', 'x')}`
  expect(outsideIslands(h)).toBe(
    '<!--wi:["a.tsx#1","0",[1]]--><i>mid</i><!--wi:["a.tsx#1","0",[3]]-->',
  )
})

test('markup with no islands, or markers that never close, is kept whole', () => {
  expect(outsideIslands('<p>plain</p>')).toBe('<p>plain</p>')
  const broken = '<p>a</p><!--wi:["a.tsx#1","0",[]]--><!--[--><b>open'
  expect(outsideIslands(broken)).toBe(broken)
})
