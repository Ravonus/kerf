// Keep the public text sheet whole while field shells load their shared rules.
import { scopesOf } from './parse.mjs'

/** Field-related text rules retain their original selectors and order. */
export function textFields(list) {
  return list.filter((item) => {
    if (item.kind !== 'rule') return true
    if (/data-scope="(?:strength|quantity|otp|editable|input-group)"/.test(item.text)) return false
    if (/data-part="(?:stepper|scrub|mask)"|data-kind="(?:number|mask)"/.test(item.text))
      return false
    const found = scopesOf(item.text)
    return !found.length || found.includes('field')
  })
}
