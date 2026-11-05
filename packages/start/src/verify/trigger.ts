import type postgres from 'postgres'
import { Broke } from './support'

export async function checkTrigger(sql: postgres.Sql, table: string) {
  const [t] =
    await sql`select t.tgenabled from pg_trigger t join pg_class c on c.oid = t.tgrelid where t.tgname = 'weft_changes_ins' and c.relname = ${table}`
  if (!t)
    throw new Broke(
      'trigger',
      `\`${table}\` has no change trigger: run \`weft db live\`, and apply the migration there`,
    )
  if (t.tgenabled === 'D')
    throw new Broke('trigger', `the change trigger on \`${table}\` is disabled`)
}
