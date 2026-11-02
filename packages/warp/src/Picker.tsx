import { isSheet, messages, pickerPanel, reportMissing, todayIso, uid, type Presentation } from '@weft-js/warp-core'
import { onMount, state, untrack, watch, type State } from '@weft-js/core'
import { bindable, type Bindable, type Openable } from './bind'
import { Button } from './Button'
import { Field, type FieldProps } from './Field'
import type { IconRef } from './Icon'
import { Icon } from './Icon'
import { use } from '@weft-js/warp-core/weft'
import './fields'
import '@weft-js/warp-core/styles/rich/body.css'
import '@weft-js/warp-core/styles/rich/helpers.css'
import '@weft-js/warp-core/styles/rich/pick.css'
import '@weft-js/warp-core/styles/rich/segments.css'
import '@weft-js/warp-core/styles/rich/popover.css'

export { bindable, type Bindable, type Openable } from './bind'
export type RichFieldProps = Omit<FieldProps, 'value' | 'defaultValue'> & {
  required?: boolean
  name?: string
  locale?: string
  /** Pins "today" (server render, tests); the browser's clock otherwise. */
  today?: string
  presentation?: Presentation
}

/**
 * The locale and today a picker renders with. The server and the hydrating client must agree, so both start from the
 * prop (or en-US and the server's clock, which weft carries over in the state payload); after mount the document's lang
 * and the browser's clock take over, a microtask later so hydration itself writes nothing.
 */
export function usePickerEnv(locale: () => string | undefined, today: () => string | undefined) {
  const loc = state(untrack(locale) ?? 'en-US')
  const now = state(untrack(today) ?? todayIso())
  onMount(() => {
    queueMicrotask(() => {
      if (!untrack(locale)) loc.value = document.documentElement.lang || navigator.language || 'en-US'
      if (!untrack(today)) now.value = todayIso()
    })
    watch(locale, l => { if (l) loc.value = l })
  })
  return { locale: loc, today: now }
}

/** The open flag of a panel, from `open`, `defaultOpen` and the panel's first render: contents are built on first open. */
export function useOpen(open: () => State<boolean> | boolean | undefined, defaultOpen: () => boolean | undefined, onChange: () => ((o: boolean) => void) | undefined) {
  const flag = bindable<boolean>(open, defaultOpen, false, () => (o: boolean) => untrack(onChange)?.(o))
  const built = state(untrack(() => flag.value))
  return {
    get value() { return flag.value },
    get built() { return built.value },
    set(v: boolean) { if (v) built.value = true; flag.set(v) },
  }
}

/**
 * The panel of a picker: a child of the control, so the label stays up and the sweep stays in while it is open (04
 * "Popovers stay attached"). Anatomy from the specimen: sweep · handle · sheet-head (title, Done) · content.
 */
export function Panel({ label, open, trigger, presentation, align, kind, children }: { label: string; open: { value: boolean; built: boolean; set(v: boolean): void }; trigger: () => HTMLElement; presentation?: Presentation; align?: 'start' | 'end'; kind?: string; children: () => any }) {
  let panel: HTMLDialogElement | undefined
  const done = () => open.set(false)
  use(pickerPanel, () => panel, () => ({ open: open.value, trigger: trigger(), presentation, align, onClose: done }))
  return (
    <dialog ref={(n: any) => (panel = n)} data-scope="popover" data-kind={kind} data-align={align} data-sweep="" popover="manual" aria-label={label}>
      <span data-part="sweep" aria-hidden="true"></span>
      <div data-part="handle" aria-hidden="true"></div>
      <div data-part="sheet-head"><span>{label}</span><Button emphasis="soft" size="sm" data-part="done" onClick={done}>Done</Button></div>
      {open.built && children()}
    </dialog>
  )
}

/** The trigger at the end of a composite: a calendar or clock icon button (aria-haspopup, aria-expanded). */
export function Trigger({ el, icon, label, open, disabled, onToggle }: { el?: (el: HTMLButtonElement) => void; icon: IconRef; label: string; open: boolean; disabled?: boolean; onToggle: () => void }) {
  return (
    <button ref={(n: any) => el?.(n)} type="button" data-part="trigger" aria-haspopup="dialog" aria-expanded={open ? 'true' : 'false'} aria-label={label} disabled={disabled} onClick={onToggle}>
      <Icon name={icon} />
    </button>
  )
}

/** A hidden input with the ISO value, so a native form posts it. */
export function Hidden({ name, value }: { name?: string; value: () => string }) {
  return <>{name && <input type="hidden" name={name} value={value()} />}</>
}

/**
 * A composite in the field shell: a body role=group named by the visible label; segments keep their short names. `bound`
 * is its value: a form's reset goes back to the first one (`onReset` clears what the composite holds beside it), and
 * `required` is a hidden text input (a type=hidden one is never validated) that is empty while the value is, so the
 * form won't submit; the browser's own message shows as the field's error.
 */
export function Composite({ control, bound, onReset, ...props }: any) {
  const missing = state<string | undefined>(undefined)
  const blank = () => { const v = bound.value; return v === null || v === '' || (typeof v === 'object' && Object.values(v).includes(null)) }
  let proxy: HTMLInputElement | undefined
  const reset = () => {
    bound.reset()
    onReset?.()
    missing.value = undefined
    if (proxy) proxy.value = blank() ? '' : 'set' // the native reset emptied it, and the value may not have changed
  }
  return (
    <Field
      {...props}
      error={props.error ?? (blank() ? missing.value : undefined)}
      group
      reset={reset}
      control={p => (
        <>
          {untrack(() => control(p))}
          {props.required && <input ref={(n: any) => (proxy = n)} onInvalid={(e: Event) => (missing.value = reportMissing(e))} data-part="sr-only" tabindex="-1" aria-hidden="true" required disabled={props.disabled} readonly={props.readonly} value={blank() ? '' : 'set'} />}
        </>
      )}
    />
  )
}

export { isSheet, messages, uid }
