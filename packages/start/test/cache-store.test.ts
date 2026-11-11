// The shared cache's store: memory bounded and never stale after a reset, and concurrent misses sharing one run.
import { expect, test, vi } from 'vitest'
import { query } from '@weft-js/start'
import { fnOf } from '@weft-js/start/data'
import { memoryStore, type Stored } from '@weft-js/start/cache'
import { createScope, fetchQuery } from '../src/exec'

const later = (v: unknown, versions: number[] = [], tags: string[] = []): Stored => ({
  v,
  tags,
  versions,
  expires: Date.now() + 60_000,
})

test('past its size the least recently used value goes; an expired value is gone when read', async () => {
  const store = memoryStore({ values: 2 })
  await store.set('a', later(1))
  await store.set('b', later(2))
  await store.get('a') // a is now the most recent
  await store.set('c', later(3))
  expect(await store.get('b')).toBeUndefined()
  expect((await store.get('a'))?.v).toBe(1)
  await store.set('old', { ...later(4), expires: Date.now() - 1 })
  expect(await store.get('old')).toBeUndefined()
})

test('tag versions never repeat, so a value stored before a reset of the tags never matches again', async () => {
  const store = memoryStore({ tags: 2 })
  const [before] = await store.versions(['t'])
  await store.bump(['t'])
  const [bumped] = await store.versions(['t'])
  expect(bumped).not.toBe(before)
  await store.bump(['x', 'y']) // past 2: every version starts over
  const [after] = await store.versions(['t'])
  expect(after).not.toBe(before)
  expect(after).not.toBe(bumped)
})

test('concurrent misses on one shared value run the query once and all get its answer', async () => {
  let runs = 0
  let release!: () => void
  const gate = new Promise<void>((ok) => {
    release = ok
  })
  const slow = query({
    $id: 'cache-store.slow',
    tags: ['slow'],
    cache: { life: 60 },
    run: async () => {
      runs++
      await gate
      return { n: runs }
    },
  })
  const store = memoryStore()
  const ask = () =>
    fetchQuery(createScope(new Request('http://x/'), { store }), fnOf(slow), undefined)
  const all = Promise.all([ask(), ask(), ask()])
  await vi.waitFor(() => expect(runs).toBe(1))
  release()
  const answers = await all
  expect(runs).toBe(1)
  expect(answers.map((a) => a.v)).toEqual([{ n: 1 }, { n: 1 }, { n: 1 }])
  expect(answers.every((a) => a.tags.includes('slow'))).toBe(true)
})
