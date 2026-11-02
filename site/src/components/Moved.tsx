import { navigate } from '@weft/start'
import { onMount } from 'weft'

/** An old address: goes to the new one. */
export function Moved(props: { to: string }) {
  onMount(() => navigate(props.to, { replace: true }))
  return <p data-site="moved"><a href={props.to}>This page moved.</a></p>
}
