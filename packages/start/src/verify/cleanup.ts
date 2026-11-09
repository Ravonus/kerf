import type postgres from 'postgres'
import type { VerifyResult } from '../verify'
import { Broke, clean, type insert } from './support'

export async function cleanup(o: {
  ac: AbortController
  row: Awaited<ReturnType<typeof insert>> | undefined
  ms: VerifyResult['ms']
  sql: postgres.Sql | undefined
  listener: postgres.Sql | undefined
  marker: string
}) {
  const { ac, row, ms, sql, listener, marker } = o
  let cleaning: unknown
  ac.abort()
  if (row) {
    const t = performance.now()
    try {
      await row.remove()
      ms.cleanup = Math.round(performance.now() - t)
    } catch (e) {
      cleaning = e
    }
  }
  await Promise.all([sql?.end({ timeout: 1 }), listener?.end({ timeout: 1 })]).catch(() => {})
  if (cleaning) throw new Broke('cleanup', `row \`${marker}\` is still there: ${clean(cleaning)}`)
}
