'use server'

import { eq, inArray } from 'drizzle-orm'
import { refresh, updateTag } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db'
import { orders } from '@/db/schema'
import { pageSize, statuses } from '@/lib/orders'
import { currentUser } from './auth'
import { ordersTag } from './data'

const id = z.int().positive()

function written() {
  updateTag(ordersTag)
  refresh()
}

export async function markShipped(rawIds: number[]) {
  await currentUser()
  const ids = z.array(id).min(1).max(pageSize).parse(rawIds)
  await db.update(orders).set({ status: 'shipped' }).where(inArray(orders.id, ids))
  written()
}

export async function setStatus(rawId: number, rawStatus: string) {
  await currentUser()
  await db.update(orders).set({ status: z.enum(statuses).parse(rawStatus) }).where(eq(orders.id, id.parse(rawId)))
  written()
}
