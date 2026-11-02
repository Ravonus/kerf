import { state, type State, watch } from '@weft-js/core'
import { Button } from '../Button'
import { Checkbox } from '../Choice'
import { Input } from '../Field'
import { toast } from '../Toast'
import '../styles'
import '@weft-js/warp-core/styles/flows/tokens.css'
import '@weft-js/warp-core/styles/flows/base.css'
import '@weft-js/warp-core/styles/rich/helpers.css'
import '@weft-js/warp-core/styles/layout/tokens.css'
import '@weft-js/warp-core/styles/layout/row.css'
import '@weft-js/warp-core/styles/layout/stack.css'

/**
 * A secret shown once (09 §4.2, §4.6): a read-only field with Copy, and a checkbox the Done button waits on. Shared by
 * API keys and webhook signing secrets. `done` goes true when it's been acknowledged.
 */
export function SecretReveal({ label, secret, done, ack }: { label: string; secret: string; done: State<boolean>; ack: string }) {
  const copy = () => {
    navigator.clipboard?.writeText(secret).catch(() => {})
    toast.show({ title: 'Copied', description: 'It’s on your clipboard. Paste it once, then clear it.' })
  }
  return (
    <div data-scope="stack" style="padding-block-start:var(--warp-space-related)">
      <Input label={label} readonly value={secret} autofocus spellcheck="false" onFocus={(e: any) => e.currentTarget.select()} />
      <div><Button emphasis="frame" onClick={copy}>Copy</Button></div>
      <Checkbox checked={done.value} onChange={(e: any) => (done.value = e.currentTarget.checked)}>{ack}</Checkbox>
    </div>
  )
}

export const useReveal = (open: State<boolean>) => {
  const secret = state('')
  const seen = state(false)
  watch(() => open.value, on => { if (!on) { secret.value = ''; seen.value = false } })
  return { secret, seen }
}
