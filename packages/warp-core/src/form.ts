// A form's reset, for state the browser's reset can't reach: one document listener, whatever the number of fields, so a
// field needs no form yet when it mounts and a form can be swapped around it.
type Entry = { el: Element; fn: () => void }

const entries = new WeakMap<Document, Set<Entry>>()

/**
 * Call `fn` after the form holding `el` resets: after the native reset (a macrotask later, since the event fires before
 * it), and not at all if a handler cancelled it. An action, for `use`; the option is `fn`.
 */
export function formReset(el: Element, fn: () => void) {
  const doc = el.ownerDocument
  let set = entries.get(doc)
  if (!set) {
    entries.set(doc, (set = new Set()))
    const all = set
    doc.addEventListener('reset', e => {
      const form = e.target as Element
      setTimeout(() => { if (!e.defaultPrevented) for (const x of Array.from(all)) if (form.contains(x.el)) x.fn() })
    }, true)
  }
  const entry = { el, fn }
  set.add(entry)
  return { update(next: () => void) { entry.fn = next }, destroy() { set.delete(entry) } }
}

type Watch = { el: Element; fn: (message: string | undefined) => void; on: boolean }

const watches = new WeakMap<Document, Set<Watch>>()

/**
 * The browser's constraint message for the controls inside `el`, drawn by warp, never as its bubble: one document
 * listener, in capture since `invalid` doesn't bubble. `fn` hears the message, and undefined once the control is valid
 * again. The form's first invalid control takes focus, on the part a person types in (a Select's trigger, not its hidden
 * select). A composite's hidden input is left to `reportMissing`. An action, for `use`; the option is `fn`.
 */
export function formInvalid(el: Element, fn: Watch['fn']) {
  const doc = el.ownerDocument
  let set = watches.get(doc)
  if (!set) {
    watches.set(doc, (set = new Set()))
    const all = set
    doc.addEventListener('invalid', e => {
      const input = e.target as HTMLInputElement
      if (input.matches('[data-part="sr-only"]')) return
      const x = [...all].find(w => w.el.contains(input))
      if (!x) return
      e.preventDefault()
      x.on = true
      x.fn(input.validationMessage)
      if (input.form?.querySelector(':invalid') === input) (x.el.querySelector<HTMLElement>('[data-part="input"]') ?? input).focus()
    }, true)
    const check = (e: Event) => {
      const input = e.target as HTMLInputElement
      if (input.validity?.valid) for (const x of all) if (x.on && x.el.contains(input)) { x.on = false; x.fn(undefined) }
    }
    doc.addEventListener('input', check, true)
    doc.addEventListener('change', check, true)
  }
  const watch: Watch = { el, fn, on: false }
  set.add(watch)
  return { update(next: Watch['fn']) { watch.fn = next }, destroy() { set.delete(watch) } }
}

/**
 * An `invalid` on a composite's hidden required input: the field draws the message itself, so no bubble, and the first
 * invalid control of the form takes focus on the field's first real control. Returns the browser's message.
 */
export function reportMissing(e: Event) {
  e.preventDefault()
  const input = e.target as HTMLInputElement
  if (input.form?.querySelector(':invalid') === input) input.closest('[data-part="body"]')?.querySelector<HTMLElement>('[tabindex="0"], button:not(:disabled)')?.focus()
  return input.validationMessage
}
