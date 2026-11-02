import { navigate } from '@weft-js/start'
import { onMount } from '@weft-js/core'

/** An old address: goes to the new one. */
export function Moved(props: { to: string }) {
  onMount(() => { void navigate(props.to, { replace: true }) })
  return <p data-site="moved"><a href={props.to}>This page moved.</a></p>
}
