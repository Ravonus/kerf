// The `db.adapter` suite on the Firestore emulator: `FIRESTORE_EMULATOR_HOST`, as the SDK reads it.
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { LIST_ROWS, listSuite } from 'weft/test/plugins'
import { decodeCursor } from '@weft/start/list'
import { firestoreSource } from '../src/firestore'

const host = process.env.FIRESTORE_EMULATOR_HOST
const spec = { columns: { id: 'id', title: 'title', status: 'status', rank: 'rank_no' }, search: ['title'] }

test.skipIf(!host)('firestoreSource passes db.adapter@1', async () => {
  const db = getFirestore(initializeApp({ projectId: 'weft-test' }))
  const col = db.collection(`t${Date.now()}`)
  const make = async () => {
    const old = await col.get()
    await Promise.all(old.docs.map(d => d.ref.delete()))
    await Promise.all(LIST_ROWS.map(({ id, title, status, rank, secret }) => col.doc(id).set({ title, status, rank_no: rank, secret })))
    return firestoreSource(col, spec)
  }
  const checks = await listSuite({ make, decode: decodeCursor })
  expect(checks.filter(c => !c.ok)).toEqual([])
})

test('search and another sort are refused up front', async () => {
  const b: any = { select: () => b, where: () => b, orderBy: () => b }
  await expect(firestoreSource(b, spec).list({ mode: 'cursor', limit: 5, offset: 0, after: null, sort: { field: 'status', dir: 'asc' }, search: 'x', filter: {} } as any)).rejects.toThrow('Q002')
})
