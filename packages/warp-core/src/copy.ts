// Apart from code.ts: a page of static code blocks wants this listener and none of the tokenizer.

/**
 * Every `[data-act="copy"]` in the document, by one listener: the code is the nearest `[data-scope="codeblock"]`'s, or
 * the button's `data-copy-text`, or what `data-copy-url` answers. A page of static code blocks needs this once and no
 * other script.
 */
export function copyButtons(doc: Document = document) {
  const onClick = (e: Event) => {
    const button = (e.target as Element).closest?.<HTMLElement>('[data-act="copy"]')
    if (!button) return
    const code = button.closest('[data-scope="codeblock"]')?.querySelector('code')
    const url = button.dataset.copyUrl
    const text = url ? fetch(url).then(r => r.text()) : Promise.resolve(button.dataset.copyText ?? code?.textContent ?? '')
    void text.then(t => navigator.clipboard?.writeText(t)).then(() => {
      button.dataset.done = ''
      setTimeout(() => delete button.dataset.done, 1600)
    })
  }
  doc.addEventListener('click', onClick)
  return () => doc.removeEventListener('click', onClick)
}
