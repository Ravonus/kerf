// Apart from code.ts: a page of static code blocks wants this listener and none of the tokenizer.

/** A highlighted block's lines are spans with no newline between them, so textContent would run them together. */
const source = (code: Element | null | undefined) => {
  const lines = code?.querySelectorAll('[data-part="line"]')
  return lines?.length ? Array.from(lines, l => l.textContent).join('\n') : code?.textContent ?? ''
}

// The polite announcer (toast.ts's announce, without pulling the toast store into a static page). A page of static code
// blocks may have no Toaster or Shell to mount one, and then the result was said to no one: make one, once.
const say = (doc: Document, text: string) => {
  let el = doc.querySelector<HTMLElement>('[data-scope="announcer"][aria-live="polite"]')
  if (!el) {
    el = doc.createElement('div')
    el.setAttribute('data-scope', 'announcer')
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')
    el.setAttribute('aria-atomic', 'true')
    el.style.cssText = 'position:absolute;inline-size:1px;block-size:1px;overflow:clip;clip-path:inset(50%);white-space:nowrap'
    doc.body.append(el)
  }
  const live = el
  live.textContent = ''
  setTimeout(() => (live.textContent = text), 60)
}

const FAILED = 'Couldn’t copy'

/**
 * Every `[data-act="copy"]` in the document, by one listener: the code is the nearest `[data-scope="codeblock"]`'s, or
 * the button's `data-copy-text`, or what `data-copy-url` answers. A page of static code blocks needs this once and no
 * other script. A copy that lands sets `data-done` (and, on a `[data-copy]` control, `data-state="copied"`); one the browser refuses sets
 * `data-failed` (and `data-state="failed"`) for a moment instead, with a visible "Couldn’t copy" note in the button and the same
 * words in a polite live region (made if the page has none).
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
      // a red glyph alone says something went wrong, not what: a refusal also says so in words, beside the button
      button.querySelector(':scope > [data-part="copy-note"]')?.remove()
      if (!ok) {
        const note = doc.createElement('span')
        note.setAttribute('data-part', 'copy-note')
        note.setAttribute('aria-hidden', 'true') // the announcer says it; this is for eyes
        note.textContent = FAILED
        button.append(note)
      }
      say(doc, ok ? 'Copied' : `${FAILED}. Select the text and copy it yourself.`)
      timers.set(button, setTimeout(() => {
        delete button.dataset.done; delete button.dataset.failed; if ('copy' in button.dataset) delete button.dataset.state
        button.querySelector(':scope > [data-part="copy-note"]')?.remove()
      }, ok ? 1600 : 2400))
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
