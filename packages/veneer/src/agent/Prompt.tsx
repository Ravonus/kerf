import { announce, autosize, installSweep, uid } from '@kerf-js/veneer-core'
import { onMount, untrack, type State } from '@kerf-js/core'
import { use } from '@kerf-js/veneer-core/kerf'
import { promptState, suggestActions, sendActions, keyAction, fileActions } from './Prompt-model'
import { promptView } from './Prompt-view'
import type { ContextUse } from './ContextMeter'
import type { ModelOption } from './ModelPicker'
import '../styles'
import '@kerf-js/veneer-core/styles/app/prompt.css'
import '@kerf-js/veneer-core/styles/app/composer.css'
import '@kerf-js/veneer-core/styles/app/suggest.css'

/** A tool the composer's row can offer. */
export type PromptTool = 'attach' | 'slash' | 'mic' | 'web'
/** A file attached to the prompt. */
export type PromptFile = { id: string; name: string; progress?: number }
/** A completion shown under the prompt. */
export type PromptSuggestion = { value: string; description?: string | undefined }
/** What the prompt hands out through `control`. */
export interface PromptControl {
  insert(text: string): void
  focus(): void
}

/** Props for Prompt. */
export interface PromptProps {
  value?: State<string> | string
  /** Called with the draft on every keystroke. */
  onValueChange?: (v: string) => void
  onSubmit?: (text: string) => void
  /** Pressing Stop or Escape while busy. Stop keeps what arrived. */
  onStop?: () => void
  /** A message sent while busy goes to the queue. */
  onQueue?: (text: string) => void
  busy?: boolean | undefined
  /** Why Send is off ("You're offline"): the button stays focusable and says why. */
  blocked?: string
  label?: string | undefined
  placeholder?: string
  tools?: PromptTool[]
  /** The picked model's id: a state, or a plain value with `onModelChange`. */
  model?: State<string> | string
  models?: ModelOption[]
  /** Called with the id of the model picked. */
  onModelChange?: (id: string) => void
  context?: ContextUse
  /** Called from the context meter's Compact: summarise the conversation to free room. */
  onCompact?: () => void
  /** Attached files shown as chips above the input, with upload progress. */
  files?: PromptFile[]
  /** Your own attachment row, in place of `files`. */
  attachments?: unknown
  /** Called with the files picked or dropped. */
  onAttach?: (files: File[]) => void
  /** Called with a file's id when its chip is removed. */
  onRemoveFile?: (id: string) => void
  /** What `/` offers: one suggestion each, with a description. */
  commands?: PromptSuggestion[]
  /** What `@` offers: one suggestion each, with a description. */
  mentions?: PromptSuggestion[]
  /** Whether the Web toggle is on. */
  web?: boolean
  /** Called with the Web toggle's new state. */
  onWebChange?: (on: boolean) => void
  /** Whether dictation is on: the mic button turns critical. */
  mic?: boolean
  /** Called when the mic button is pressed. */
  onMic?: () => void
  /** Phone: fewer tools, the model's short name. */
  compact?: boolean | undefined
  /** Hands over insert() and focus(), for SpeechInput's Insert. */
  control?: ((c: PromptControl) => void) | undefined
  /** Above the composer: Suggestions. */
  children?: unknown
}

/**
 * Prompt (07 §1.1, §1.6): one composer in the field's sweep. It grows to 8 lines; Enter sends, Shift+Enter adds a line,
 * Escape stops. Send and Stop are one button, so focus never drops. `/` and `@` open a suggest listbox on the textarea
 * (aria-activedescendant); files come by button or drop, the drag holding the sweep. Busy sends go to `onQueue`.
 */
export function Prompt(p: PromptProps) {
  const id = uid('prompt')
  const model = promptState(
    untrack(() => p),
    id,
  )
  const { draft } = model
  let box: HTMLTextAreaElement | undefined
  let host: HTMLElement | undefined
  let picker: HTMLInputElement | undefined
  use(
    autosize,
    () => box,
    () => draft.value,
  )
  onMount(() => {
    p.control?.({
      insert(text) {
        draft.set(draft.value ? `${draft.value} ${text}` : text)
        box!.focus({ preventScroll: true })
        installSweep().confirm(host)
        announce(box!.ownerDocument, 'Inserted into the message box.')
      },
      focus: () => box!.focus(),
    })
  })
  const context = { ...model, p: untrack(() => p), getBox: () => box }
  const { look, pick } = suggestActions(context)
  const { send, sendOrStop } = sendActions(context)
  const onKey = keyAction(context, pick, send)
  const { add, onDrop, over } = fileActions(context)
  return promptView({
    ...context,
    look,
    pick,
    sendOrStop,
    onKey,
    add,
    onDrop,
    over,
    id,
    setHost: (n) => (host = n),
    setBox: (n) => (box = n),
    setPicker: (n) => (picker = n),
    getPicker: () => picker,
  })
}
