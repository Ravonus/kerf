// Keep the public choice sheet whole while components load only their own rules.
import { scopesOf } from './parse.mjs'

/** Choice rules in their original order, including shared and conditional rules. */
export function choices(list) {
  const scopes = {
    checkbox: ['checkbox'],
    radio: ['radio'],
    switch: ['switch'],
    segmented: ['segmented'],
    select: ['field', 'select'],
  }
  return new Map(
    Object.entries(scopes).map(([name, own]) => [
      `choice-${name}`,
      list.filter((item) => {
        if (item.kind !== 'rule') return true
        const found = scopesOf(item.text)
        return !found.length || found.some((scope) => own.includes(scope))
      }),
    ]),
  )
}
