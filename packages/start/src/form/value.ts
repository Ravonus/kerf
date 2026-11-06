/** The raw values restored after a failed form submission. */
export type FormValue = string | string[] | undefined

/** A field's restoration mode. Omit it to retain the raw value. */
export type FieldKind = 'text' | 'email' | 'multiple' | 'raw'

/** Project a restored value to the declared field kind. */
export function fieldValue(value: FormValue, kind: 'text' | 'email'): string | undefined
export function fieldValue(value: FormValue, kind: 'multiple'): string[] | undefined
export function fieldValue(value: FormValue, kind?: FieldKind): FormValue
export function fieldValue(value: FormValue, kind?: FieldKind): FormValue {
  if (kind === 'text' || kind === 'email') return Array.isArray(value) ? value[0] : value
  if (kind === 'multiple') return value === undefined ? undefined : [value].flat()
  return value
}
