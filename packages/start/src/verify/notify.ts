import { CHANNEL } from '../changes-sql.mjs'
import { Broke } from './support'

export async function waitNotice(
  heard: string[],
  table: string,
  id: string,
  timeout: number,
  setHearing: (fn: () => void) => void,
) {
  const seen = () =>
    heard.some((h) => {
      try {
        const m = JSON.parse(h)
        return m.t === table && (!m.i || m.i.includes(id))
      } catch {
        return false
      }
    })
  if (!seen())
    await new Promise<void>((ok) => {
      const t = setTimeout(ok, timeout)
      setHearing(() => {
        if (seen()) {
          clearTimeout(t)
          ok()
        }
      })
    })
  if (!seen())
    throw new Broke(
      'notify',
      `the trigger on \`${table}\` sent nothing on \`${CHANNEL}\` within ${timeout} ms`,
    )
}
