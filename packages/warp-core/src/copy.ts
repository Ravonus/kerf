// Apart from code.ts: a page of static code blocks wants this listener and none of the tokenizer.

/** A highlighted block's lines are spans with no newline between them, so textContent would run them together. */
const source = (code: Element | null | undefined) => {
  const lines = code?.querySelectorAll('[data-part="line"]')
  return lines?.length ? Array.from(lines, l => l.textContent).join('\n') : code?.textContent ?? ''
}

// The pre-mounted polite announcer (toast.ts's announce, without pulling the toast store into a static page).
const say = (doc: Document, text: string) => {
  const el = doc.querySelector<HTMLElement>('[data-scope="announcer"][aria-live="polite"]')
  if (!el) return
  el.textContent = ''
  setTimeout(() => (el.textContent = text), 60)
}

/**
 * Every `[data-act="copy"]` in the document, by one listener: the code is the nearest `[data-scope="codeblock"]`'s, or
 * the button's `data-copy-text`, or what `data-copy-url` answers. A page of static code blocks needs this once and no
 * other script. A copy that lands sets `data-done` (and, on a `[data-copy]` control, `data-state="copied"`); one the browser refuses sets
 * `data-failed` (and `data-state="failed"`) for a moment instead.
 */
export function copyButtons(doc: Document = document) {
  const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>()
  const onClick = (e: Event) => {
    const button = (e.target as Element).closest?.<HTMLElement>('[data-act="copy"]')
    if (!button) return
    const code = button.closest('[data-scope="codeblock"]')?.querySelector('code')
    const url = button.dataset.copyUrl
    const text = url ? fetch(url).then(r => r.text()) : Promise.resolve(button.dataset.copyText ?? source(code))
    const show = (ok: boolean) => {
      clearTimeout(timers.get(button))
      delete button.dataset.done
      delete button.dataset.failed
      button.dataset[ok ? 'done' : 'failed'] = ''
      // a [data-copy] control swaps its glyph by data-state (components.css, Copy action)
      if ('copy' in button.dataset) button.dataset.state = ok ? 'copied' : 'failed'
      say(doc, ok ? 'Copied' : 'Couldn’t copy. Select the text and copy it yourself.')
      timers.set(button, setTimeout(() => { delete button.dataset.done; delete button.dataset.failed; if ('copy' in button.dataset) delete button.dataset.state }, ok ? 1600 : 2400))
    }
    // a refused write (no permission, no focus, no clipboard at all) is a state of the button, not an uncaught error
    text
      .then(t => {
        const clip = doc.defaultView?.navigator.clipboard ?? navigator.clipboard
        if (!clip) throw new Error('no clipboard')
        return clip.writeText(t)
      })
      .then(() => show(true), () => show(false))
  }
  doc.addEventListener('click', onClick)
  return () => doc.removeEventListener('click', onClick)
}
