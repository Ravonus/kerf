import { later } from '../db'

// H007: meta reads a deferred field.
export const load = async () => ({ late: later(5, 'x') })
export const meta = ({ data }: any) => ({ title: data.late })

export default function DeferredMeta() {
  return <p>never</p>
}
