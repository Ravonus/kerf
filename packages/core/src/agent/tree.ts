import { computeAccessibleName, getRole, isInaccessible } from 'dom-accessibility-api'

const interactive = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'option',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'switch',
  'slider',
  'spinbutton',
  'treeitem',
])
const landmarks = new Set([
  'heading',
  'dialog',
  'alert',
  'alertdialog',
  'status',
  'list',
  'listitem',
  'table',
  'row',
  'cell',
  'navigation',
  'main',
  'form',
  'region',
  'tabpanel',
  'img',
  'progressbar',
  'log',
  'group',
  'article',
  'banner',
  'contentinfo',
  'columnheader',
  'rowheader',
  'grid',
  'gridcell',
  'menu',
  'menubar',
  'tablist',
  'tree',
  'radiogroup',
  'search',
  'paragraph',
  'meter',
])

function states(el: Element, role: string) {
  const out: string[] = []
  const h = el as HTMLInputElement
  if (role === 'heading')
    out.push(`level=${/^H(\d)$/.exec(el.tagName)?.[1] ?? el.getAttribute('aria-level') ?? 2}`)
  if (('disabled' in h && h.disabled) || el.getAttribute('aria-disabled') === 'true')
    out.push('disabled')
  if (role === 'checkbox' || role === 'radio' || role === 'switch')
    out.push(h.checked || el.getAttribute('aria-checked') === 'true' ? 'checked' : 'unchecked')
  if (el.getAttribute('aria-expanded')) out.push(`expanded=${el.getAttribute('aria-expanded')}`)
  if (el.getAttribute('aria-selected') === 'true') out.push('selected')
  if (el.getAttribute('aria-pressed')) out.push(`pressed=${el.getAttribute('aria-pressed')}`)
  if (el.getAttribute('aria-invalid') === 'true') out.push('invalid')
  if (document.activeElement === el && el !== document.body) out.push('focused')
  return out
}

function valueOf(el: Element, role: string) {
  if (
    el instanceof HTMLInputElement &&
    !['checkbox', 'radio', 'button', 'submit'].includes(el.type)
  )
    return el.value
  if (el instanceof HTMLTextAreaElement) return el.value
  if (el instanceof HTMLSelectElement) return [...el.selectedOptions].map((o) => o.text).join(', ')
  if (role === 'slider' || role === 'spinbutton' || role === 'progressbar' || role === 'meter')
    return el.getAttribute('aria-valuetext') ?? el.getAttribute('aria-valuenow') ?? undefined
  return undefined
}

const ownText = (el: Element) =>
  [...el.childNodes]
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent!.trim())
    .filter(Boolean)
    .join(' ')
export const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s)

/** The page as roles and names, one line each, indented by nesting: `- button "Add Banana" [ref=e5]`. */
export function tree(root: Element, onlyInteractive: boolean, ref: (el: Element) => string) {
  const lines: string[] = []
  const walk = (el: Element, depth: number) => {
    if (el.hasAttribute('data-weft-devtools')) return
    if (
      el instanceof HTMLElement &&
      (el.hidden || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'TEMPLATE')
    )
      return
    if (isInaccessible(el)) return
    const role = getRole(el) ?? ''
    const keep = onlyInteractive
      ? interactive.has(role)
      : interactive.has(role) || landmarks.has(role)
    let next = depth
    if (keep) {
      const name = computeAccessibleName(el)
      const value = valueOf(el, role)
      const st = states(el, role)
      const text = !onlyInteractive && !name && !interactive.has(role) ? ownText(el) : ''
      lines.push(
        `${'  '.repeat(depth)}- ${role}${name ? ` ${JSON.stringify(clip(name))}` : ''}${value !== undefined ? ` value=${JSON.stringify(clip(value))}` : ''}${st.length ? ` [${st.join(', ')}]` : ''} [ref=${ref(el)}]${text ? `: ${clip(text)}` : ''}`,
      )
      next = depth + 1
      if (interactive.has(role)) return // a control's name already says what's inside it
    } else if (!onlyInteractive) {
      const text = ownText(el)
      if (text && !['OPTION'].includes(el.tagName))
        lines.push(`${'  '.repeat(depth)}- text: ${clip(text)}`)
    }
    for (const c of el.children) walk(c, next)
  }
  walk(root, 0)
  return lines
}

/** Lines of `b` that are new since `a` (by content, in order), with removed lines as `- removed: …`. */
export function diff(a: string[], b: string[]) {
  const strip = (l: string) => l.trim()
  const before = new Map<string, number>()
  for (const l of a) before.set(strip(l), (before.get(strip(l)) ?? 0) + 1)
  const out: string[] = []
  for (const l of b) {
    const k = strip(l)
    const n = before.get(k) ?? 0
    if (n) before.set(k, n - 1)
    else out.push(`+ ${k}`)
  }
  for (const [k, n] of before) for (let i = 0; i < n; i++) out.push(`- ${k}`)
  return out
}
