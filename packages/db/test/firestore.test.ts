// The `db.adapter` suite on the Firestore emulator: `FIRESTORE_EMULATOR_HOST`, as the SDK reads it.
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { LIST_ROWS, listSuite } from '@kerf/core/test/plugins'
import { decodeCursor } from '@kerf/start/list'
import { firestoreSource, type FirestoreCollection, type FirestoreQuery } from '../src/firestore'

const host = process.env.FIRESTORE_EMULATOR_HOST
const spec = {
  columns: { id: 'id', title: 'title', status: 'status', rank: 'rank_no' },
  search: ['title'],
}

// Needs the Firestore emulator running.
test.skipIf(!host)('firestoreSource passes db.adapter@1', async () => {
  const db = getFirestore(initializeApp({ projectId: 'kerf-test' }))
  const col = db.collection(`t${Date.now()}`)
  const make = async () => {
    const old = await col.get()
    await Promise.all(old.docs.map((d) => d.ref.delete()))
    await Promise.all(
      LIST_ROWS.map(({ id, title, status, rank, secret }) =>
        col.doc(id).set({ title, status, rank_no: rank, secret }),
      ),
    )
    return firestoreSource(col, spec)
  }
  const checks = await listSuite({ make, decode: decodeCursor })
  expect(checks.filter((c) => !c.ok)).toEqual([])
})

test('an update with nothing in it reads the row: the SDK refuses an empty one', async () => {
  const doc = { id: 'a', exists: true, data: () => ({ title: 'x' }) }
  const ref = {
    get: () => Promise.resolve(doc),
    update: () => Promise.reject(new Error('at least one field')),
  }
  const col = { doc: () => ref } as unknown as FirestoreCollection
  expect(await firestoreSource(col, spec).update('a', {})).toEqual({ id: 'a', title: 'x' })
})

test('search and another sort are refused up front', async () => {
  const b = {
    select: () => b,
    where: () => b,
    orderBy: () => b,
  } as unknown as FirestoreCollection & FirestoreQuery
  await expect(
    firestoreSource(b, spec).list({
      mode: 'cursor',
      limit: 5,
      offset: 0,
      after: null,
      sort: { field: 'status', dir: 'asc' },
      search: 'x',
      filter: {},
    }),
  ).rejects.toThrow('Q002')
})
