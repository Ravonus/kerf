import { screen } from '@testing-library/dom'
import type { Target } from './types'

const refs = new Map<string, WeakRef<Element>>()
const refOf = new WeakMap<Element, string>()
let nextRef = 0

export function ref(el: Element) {
  let r = refOf.get(el)
  if (!r) {
    r = `e${++nextRef}`
    refOf.set(el, r)
    refs.set(r, new WeakRef(el))
  }
  return r
}

export const describe = (t: Target) =>
  typeof t === 'string'
    ? t
    : 'role' in t
      ? `${t.role}${t.name !== undefined ? ` "${t.name}"` : ''}`
      : 'label' in t
        ? `label "${t.label}"`
        : `text "${t.text}"`

export function findAll(t: Target): Element[] {
  if (typeof t === 'string') {
    const el = refs.get(t.replace(/^@/, ''))?.deref()
    return el?.isConnected ? [el] : []
  }
  if ('role' in t)
    return screen.queryAllByRole(
      t.role,
      t.name === undefined
        ? {}
        : { name: t.exact === false ? (n: string) => n.includes(t.name!) : t.name },
    )
  if ('label' in t) return screen.queryAllByLabelText(t.label, { exact: t.exact ?? true })
  return screen.queryAllByText(t.text, { exact: t.exact ?? true })
}

export function find(t: Target): Element {
  const all = findAll(t)
  if (all.length === 1) return all[0]!
  if (!all.length)
    throw new Error(
      `nothing matches ${describe(t)}${typeof t === 'string' ? ' (refs come from the latest snapshot)' : ''}. Take a snapshot to see the roles and names on the page`,
    )
  throw new Error(
    `${all.length} elements match ${describe(t)}: ${all
      .slice(0, 5)
      .map((e) => `@${ref(e)}`)
      .join(', ')}. Use a ref, or narrow the name`,
  )
}
