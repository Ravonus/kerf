// `@kerf/start/db`: what doesn't depend on the driver (research 28 §2). `schemasOf(schema).todos.insert` is a Zod
// schema per table, so a table is its own validator: `input: schemas.todos.insert.pick({ title: true })`.

import { getTableName, isTable, type Table } from 'drizzle-orm'
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
  type BuildSchema,
} from 'drizzle-zod'

export type { DbHandle, Migration } from './core'

type TablesOf<S> = { [K in keyof S as S[K] extends Table ? K : never]: S[K] }
type Select<T extends Table> = BuildSchema<'select', T['_']['columns'], undefined, undefined>
type Insert<T extends Table> = BuildSchema<'insert', T['_']['columns'], undefined, undefined>
type Update<T extends Table> = BuildSchema<'update', T['_']['columns'], undefined, undefined>
/** The select and insert types of each table in a schema. */
export type Schemas<S> = {
  [K in keyof TablesOf<S>]: TablesOf<S>[K] extends infer T extends Table
    ? { select: Select<T>; insert: Insert<T>; update: Update<T> }
    : never
}

/** `refine`: per table, per column, what drizzle-zod takes: `{ todos: { title: s => s.trim().min(1) } }`. */
export function schemasOf<S extends Record<string, unknown>>(
  schema: S,
  refine: { [K in keyof TablesOf<S>]?: Record<string, (s: never) => unknown> } = {},
): Schemas<S> {
  const out: Record<string, unknown> = {}
  for (const [k, t] of Object.entries(schema)) {
    if (!isTable(t)) continue
    const r = (refine as Record<string, never>)[k]
    out[k] = {
      select: createSelectSchema(t, r),
      insert: createInsertSchema(t, r),
      update: createUpdateSchema(t, r),
    }
  }
  return out as Schemas<S>
}

export { getTableName }
