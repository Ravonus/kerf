import { addTags, announce } from '@weft-js/warp-core'
import type { State } from '@weft-js/core'
import { afterFlush } from '../atoms'

export function tagActions({
  value,
  draft,
  armed,
  refs,
  onEdit,
  onSubmit,
}: {
  value: () => State<string[]>
  draft: State<string>
  armed: State<boolean>
  refs: { host?: HTMLElement | undefined }
  onEdit: () => void
  onSubmit: () => void
}) {
  const say = (text: string) => {
    if (refs.host) announce(refs.host.ownerDocument, text)
  }
  const add = (raw: string) => {
    const { list, added } = addTags(value().value, raw)
    draft.value = ''
    if (!added.length) return
    value().value = list
    armed.value = false
    say(`Added ${added.join(', ')}. ${list.length} in total.`)
    onEdit()
  }
  const drop = (tag: string) => {
    value().value = value().value.filter((t) => t !== tag)
    armed.value = false
    say(`Removed ${tag}.`)
    onEdit()
    afterFlush(() => refs.host?.focus())
  }
  const key = (e: KeyboardEvent) => {
    const text = draft.value.trim()
    if ((e.key === 'Enter' || e.key === ',') && text) {
      e.preventDefault()
      add(text)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onSubmit()
    } else if (e.key === 'Backspace' && !draft.value && value().value.length) {
      if (armed.value) drop(value().value[value().value.length - 1]!)
      else armed.value = true
    } else if (e.key !== 'Backspace') armed.value = false
  }
  const paste = (e: ClipboardEvent) => {
    const t = e.clipboardData?.getData('text') ?? ''
    if (/[\s,;]/.test(t.trim())) {
      e.preventDefault()
      add(`${draft.value} ${t}`)
    }
  }
  return { add, drop, key, paste }
}
