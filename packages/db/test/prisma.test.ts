// The `db.adapter` suite on a real generated client over SQLite: `prisma generate` and `db push` run first, as an app's would.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LIST_ROWS, listSuite } from '@kerf/core/test/plugins'
import { decodeCursor } from '@kerf/start/list'
import { prismaSource, type PrismaDelegate } from '../src/prisma'

const dir = mkdtempSync(join(tmpdir(), 'kerf-prisma-'))
const url = `file:${join(dir, 'test.db')}`
interface Client {
  task: PrismaDelegate & {
    deleteMany(): Promise<unknown>
    createMany(args: object): Promise<unknown>
  }
  $disconnect(): Promise<void>
}
let prisma: Client

beforeAll(async () => {
  const env = { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' }
  execFileSync('pnpm', ['exec', 'prisma', 'generate'], { env, stdio: 'pipe' })
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'push'], { env, stdio: 'pipe' })
  const { PrismaClient } = await import('./generated/client')
  const { PrismaLibSql } = await import('@prisma/adapter-libsql')
  prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) }) as unknown as Client
})
afterAll(async () => {
  await prisma?.$disconnect()
  rmSync(dir, { recursive: true, force: true })
})

const spec = {
  columns: { id: 'id', title: 'title', status: 'status', rank: 'rank_no' },
  search: ['title'],
  insensitive: false,
}

test('prismaSource passes db.adapter@1', async () => {
  const make = async () => {
    await prisma.task.deleteMany()
    await prisma.task.createMany({
      data: LIST_ROWS.map(({ id, title, status, rank, secret }) => ({
        id,
        title,
        status,
        rank_no: rank,
        secret,
      })),
    })
    return prismaSource(prisma.task, spec)
  }
  const checks = await listSuite({ make, decode: decodeCursor })
  expect(checks.filter((c) => !c.ok)).toEqual([])
  expect(checks.length).toBeGreaterThan(20)
})

test('a missing row is null, not a thrown P2025', async () => {
  const s = prismaSource(prisma.task, spec)
  expect(await s.update('none', { title: 'x' })).toBeNull()
  expect(await s.remove('none')).toBe(false)
})

test('any other failure stays a failure', async () => {
  const s = prismaSource(
    { update: () => Promise.reject(new Error('down')) } as unknown as PrismaDelegate,
    spec,
  )
  await expect(s.update('x', {})).rejects.toThrow('down')
})
