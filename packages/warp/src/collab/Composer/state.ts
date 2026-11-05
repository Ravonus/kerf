import { announce, insertMention, mentionQuery, nextIndex } from '@weft-js/warp-core'
import { derived, state, type State } from '@weft-js/core'
import type { ComposerProps, Mentionable, QuoteDraftValue } from '../Composer'

type Params = {
  quote: () => ComposerProps['quote']
  mentions: () => ComposerProps['mentions']
  onSend: () => ComposerProps['onSend']
  onAttach: () => ComposerProps['onAttach']
  onEmoji: () => ComposerProps['onEmoji']
}
export function composerState({ quote, mentions, onSend, onAttach, onEmoji }: Params) {
  const hint = state<string | null>(null)
  const query = state<string | null>(null)
  const active = state(0)
  const hasPeople = derived(() => (mentions() ?? []).length > 0)
  const canAttach = derived(() => onAttach() !== undefined)
  const canEmoji = derived(() => onEmoji() !== undefined)
  const shown = derived(() => {
    const q = query.value?.toLowerCase()
    return q === undefined
      ? []
      : (mentions() ?? []).filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8)
  })
  const open = derived(() => query.value !== null && shown.value.length > 0)
  const draft = derived(() => quote()?.value ?? null)
  const refs: { ta?: HTMLTextAreaElement | undefined } = {}

  const d = { hint, query, active, hasPeople, canAttach, canEmoji, shown, open, draft, refs }
  const actions = composerActions(d, quote, onSend)
  return { ...d, ...actions }
}
type Data = {
  hint: State<string | null>
  query: State<string | null>
  active: State<number>
  hasPeople: { readonly value: boolean }
  shown: { readonly value: Mentionable[] }
  open: { readonly value: boolean }
  draft: { readonly value: QuoteDraftValue | null }
  refs: { ta?: HTMLTextAreaElement | undefined }
}
function composerActions(
  d: Data,
  quote: () => ComposerProps['quote'],
  onSend: () => ComposerProps['onSend'],
) {
  const { hint, query, active, hasPeople, draft, refs } = d
  const removeQuote = () => {
    if (quote()) quote()!.value = null
    hint.value = null
  }
  const closeList = () => {
    query.value = null
    active.value = 0
  }
  const scan = () => {
    const q = refs.ta ? mentionQuery(refs.ta.value, refs.ta.selectionStart) : null
    query.value = q && hasPeople.value ? q.query : null
    active.value = 0
  }
  const pick = (p: Mentionable) => {
    const next = insertMention(refs.ta!.value, refs.ta!.selectionStart, p.name.split(/\s+/)[0]!)
    refs.ta!.value = next.value
    refs.ta!.setSelectionRange(next.caret, next.caret)
    closeList()
    refs.ta!.focus()
  }
  const send = () => {
    const text = refs.ta!.value.trim()
    const q = draft.value
    if (!text) {
      if (!q) return
      hint.value = 'Add a reply to the quote'
      announce(refs.ta!.ownerDocument, 'Add a reply to the quote', true)
      return refs.ta!.focus()
    }
    refs.ta!.value = ''
    closeList()
    removeQuote()
    onSend()(q ? { text, quote: q } : { text })
  }
  const key = composerKeys(d, closeList, pick, removeQuote, send)
  const insert = (text: string) => {
    refs.ta!.setRangeText(text, refs.ta!.selectionStart, refs.ta!.selectionEnd, 'end')
    refs.ta!.focus()
  }
  return { removeQuote, closeList, scan, pick, send, key, insert }
}
function composerKeys(
  d: Data,
  closeList: () => void,
  pick: (p: Mentionable) => void,
  removeQuote: () => void,
  send: () => void,
) {
  const { open, active, shown, draft, refs } = d
  return (e: KeyboardEvent) => {
    if (open.value) {
      const to = nextIndex(e.key, active.value, shown.value.length, { orientation: 'vertical' })
      if (to >= 0 && e.key !== 'Home' && e.key !== 'End') {
        e.preventDefault()
        active.value = to
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        return closeList()
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        return pick(shown.value[active.value]!)
      }
    }
    if (e.key === 'Escape' && draft.value) {
      e.preventDefault()
      removeQuote()
      return announce(refs.ta!.ownerDocument, 'Quote removed')
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      send()
    }
  }
}
