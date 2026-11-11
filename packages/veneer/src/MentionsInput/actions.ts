import {
  caretPoint,
  comboPopup,
  findTrigger,
  mentionToken,
  parseMentions,
  serializeMentions,
  shiftMarks,
  type MentionItem,
  type MentionMark,
} from '@kerf-js/veneer-core'
import { flush, onCleanup, watch, type State } from '@kerf-js/core'
import { use } from '@kerf-js/veneer-core/kerf'
import type { bindable } from '../bind'
import type { MentionsInputProps } from '../MentionsInput'

export type MentionRefs = {
  marks: MentionMark[]
  written: string
  at?: { trigger: string; query: string; at: number } | undefined
  area?: HTMLTextAreaElement | undefined
  pop?: HTMLDivElement | undefined
  mark?: HTMLSpanElement | undefined
  timer?: ReturnType<typeof setTimeout> | undefined
  stop?: AbortController | undefined
}
type Data = {
  held: ReturnType<typeof bindable<string>>
  text: State<string>
  hits: State<MentionItem[]>
  active: State<number>
  open: State<boolean>
  said: State<string>
  empty: State<string>
  refs: MentionRefs
}
export function mentionActions(d: Data, triggers: () => MentionsInputProps['triggers']) {
  const { held, text, open, refs } = d
  const cancel = () => {
    clearTimeout(refs.timer)
    refs.stop?.abort()
    refs.stop = undefined
  }
  onCleanup(cancel)
  use(
    comboPopup,
    () => refs.pop,
    () => ({ open: open.value, anchor: refs.mark!, onClose: () => (open.value = false) }),
  )
  // a value set from outside: a write of our own compares equal
  watch(
    () => held.value,
    (v) => {
      if (v === refs.written) return
      const next = parseMentions(v)
      refs.written = v
      refs.marks = next.marks
      text.value = next.text
    },
  )
  const scan = mentionSearch(d, triggers, cancel)
  return mentionHandlers(d, scan)
}

function mentionSearch(
  d: Data,
  triggers: () => MentionsInputProps['triggers'],
  cancel: () => void,
) {
  const { refs, hits, active, empty, open } = d
  const place = () => {
    const a = refs.area!
    const p = caretPoint(a, refs.at!.at)
    refs.mark!.style.insetInlineStart = `${a.offsetLeft + Math.min(p.x, a.clientWidth - 220)}px`
    refs.mark!.style.insetBlockStart = `${a.offsetTop + p.y}px`
  }
  const scan = () => {
    const a = refs.area!
    refs.at = findTrigger(a.value, a.selectionStart, Object.keys(triggers()), refs.marks)
    cancel()
    if (!refs.at) {
      open.value = false
      return
    }
    const found = refs.at
    // oxlint-disable-next-line typescript/no-misused-promises -- the body catches its own failure, and a sync wrapper would add a closure to a hot field
    refs.timer = setTimeout(async () => {
      const me = (refs.stop = new AbortController())
      try {
        const r = await triggers()[found.trigger]!(found.query, me.signal)
        if (me !== refs.stop) return
        hits.value = r
        active.value = 0
        empty.value = r.length ? '' : `No matches for ${found.trigger}${found.query}`
        place()
        open.value = true
      } catch {
        if (me === refs.stop) open.value = false
      }
    }, 120)
  }
  return scan
}

function mentionHandlers(d: Data, scan: () => void) {
  const { held, text, hits, active, open, said, refs } = d
  const publish = (reason: 'keyboard' | 'pointer') => {
    refs.written = serializeMentions(refs.area!.value, refs.marks)
    held.set(refs.written, reason)
  }
  const pick = (n: number, reason: 'keyboard' | 'pointer') => {
    const a = refs.area!,
      it = hits.value[n]
    if (!it || !refs.at) return
    const shown = refs.at.trigger + it.label
    const end = a.selectionStart
    const was = a.value
    a.setRangeText(`${shown} `, refs.at.at, end, 'end')
    refs.marks = [
      ...shiftMarks(refs.marks, was, a.value),
      {
        start: refs.at.at,
        end: refs.at.at + shown.length,
        token: mentionToken(refs.at.trigger, it),
      },
    ]
    open.value = false
    text.value = a.value
    publish(reason)
    a.focus()
    said.value = `${it.label} inserted`
  }
  const onInput = () => {
    const a = refs.area!
    refs.marks = shiftMarks(refs.marks, text.value, a.value)
    text.value = a.value
    publish('keyboard')
    scan()
  }
  const onKey = (e: KeyboardEvent) => {
    if (!open.value || e.isComposing) return
    if (e.key === 'Escape') {
      e.preventDefault()
      open.value = false
      return
    }
    const n = hits.value.length
    if (!n) return
    const by = ({ ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[e.key]
    if (by) {
      e.preventDefault()
      active.value = (active.value + by + n) % n
      flush()
      refs.pop?.querySelector('[data-active]')?.scrollIntoView?.({ block: 'nearest' })
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      pick(active.value, 'keyboard')
    }
  }
  return { onInput, onKey, scan, pick }
}
