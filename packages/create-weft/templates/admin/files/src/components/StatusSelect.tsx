import { Select, type Option } from '@weft/warp'
import { onMount, watch } from 'weft'

/** Warp's Select with `value` honoured: on its own, a `<select>` built before its options opens on the first one. */
export function StatusSelect({ value, ...props }: { label: string; name?: string; options: Option[]; value?: string; disabled?: boolean; onChange?: (e: Event) => void }) {
  let box: HTMLDivElement | undefined
  onMount(() => {
    const select = box!.querySelector('select')!
    select.value = value ?? ''
    watch(() => value, now => { select.value = now ?? '' })
  })
  return <div ref={(n: HTMLDivElement) => (box = n)}><Select {...props} value={value} /></div>
}
