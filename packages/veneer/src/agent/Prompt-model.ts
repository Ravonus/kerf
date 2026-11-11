import { announce, applySuggest, suggestQuery } from '@kerf/veneer-core'
import { derived, state } from '@kerf/core'
import { held } from './bits'
import type { PromptProps, PromptSuggestion, PromptTool } from './Prompt'

export function promptState(p: PromptProps, id: string) {
  const draft = held<string>(
    () => p.value,
    '',
    () => p.onValueChange,
  )
  const toolset = derived(() => p.tools ?? ['attach', 'slash', 'mic', 'web'])
  const shown = (t: PromptTool) => toolset.value.includes(t)
  const open = state<ReturnType<typeof suggestQuery>>(null)
  const active = state(0)
  const drag = state(false)
  const options = derived(() => {
    const q = open.value
    if (!q) return []
    const list = (q.trigger === '/' ? p.commands : p.mentions) ?? []
    return list.filter((o) => o.value.slice(1).toLowerCase().startsWith(q.query))
  })
  const listed = derived(() => options.value.length > 0)
  const oid = (o: PromptSuggestion) => `${id}-o-${o.value.slice(1)}`
  const current = derived(() => options.value[Math.min(active.value, options.value.length - 1)])
  const activeId = derived(() => (current.value ? oid(current.value) : undefined))
  const hasFiles = derived(() => p.attachments !== undefined || !!p.files?.length)
  return { draft, shown, open, active, drag, options, listed, oid, current, activeId, hasFiles }
}

type PromptState = ReturnType<typeof promptState>
type Context = PromptState & { p: PromptProps; getBox: () => HTMLTextAreaElement | undefined }

export function suggestActions({ open, active, draft, getBox }: Context) {
  const look = () => {
    open.value = suggestQuery(getBox()!.value, getBox()!.selectionStart)
    active.value = 0
  }
  const pick = (value: string) => {
    const q = open.value!
    const next = applySuggest(getBox()!.value, q.start, getBox()!.selectionStart, value)
    draft.set(next.text)
    open.value = null
    getBox()!.value = next.text
    getBox()!.focus()
    getBox()!.setSelectionRange(next.caret, next.caret)
  }
  return { look, pick }
}

export function sendActions({ p, draft, open, getBox }: Context) {
  const send = () => {
    const text = draft.value.trim()
    if (!text) return
    if (p.busy) {
      if (!p.onQueue) return
      p.onQueue(text)
      announce(getBox()!.ownerDocument, 'Queued. It will run after the current step.')
    } else if (p.blocked) return
    else p.onSubmit?.(text)
    draft.set('')
    open.value = null
  }
  const sendOrStop = () => (p.busy ? p.onStop?.() : send())
  return { send, sendOrStop }
}

export function keyAction(
  { p, listed, options, open, active, current }: Context,
  pick: ReturnType<typeof suggestActions>['pick'],
  send: ReturnType<typeof sendActions>['send'],
) {
  const onKey = (e: KeyboardEvent) => {
    if (listed.value) {
      const n = options.value.length
      if (e.key === 'Escape') {
        e.preventDefault()
        open.value = null
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        active.value = (active.value + (e.key === 'ArrowDown' ? 1 : n - 1)) % n
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pick(current.value!.value)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      send()
    } else if (e.key === 'Escape' && p.busy) {
      e.preventDefault()
      p.onStop?.()
    }
  }
  return onKey
}

export function fileActions({ p, drag }: Context) {
  const add = (list: FileList | null | undefined) => {
    const f = [...(list ?? [])]
    if (f.length) p.onAttach?.(f)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    drag.value = false
    add(e.dataTransfer?.files)
  }
  const over = (e: DragEvent) => {
    e.preventDefault()
    drag.value = true
  }
  return { add, onDrop, over }
}
