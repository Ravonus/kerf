import type { LoadArgs } from '@kerf-js/start'
import { prefs } from '../state/prefs'

// S002: a `load` serves every visitor, so it can't read a scope.
export const load = async (_: LoadArgs) => ({ theme: prefs.theme.value })

export default function Leak(props: { data: { theme: string } }) {
  return <p>{props.data.theme}</p>
}
