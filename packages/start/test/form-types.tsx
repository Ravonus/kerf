import type { FormApi } from '../src/form'
import { Input } from '../../warp/src/Field'

export function fieldTypes(form: FormApi, kind: 'text' | 'multiple') {
  const text = form.field('email', 'email')
  const multiple = form.field('tags', 'multiple')
  const dynamic = form.field('tags', kind)
  const input = <Input label="Email" type="email" {...text} />
  const stringValue: string | undefined = text.value
  const arrayValue: string[] | undefined = multiple.value
  const dynamicValue: string | string[] | undefined = dynamic.value
  type Assert<T extends true> = T
  type TextRejectsArray = Assert<string[] extends NonNullable<typeof text.value> ? false : true>
  type MultipleRejectsString = Assert<string extends NonNullable<typeof multiple.value> ? false : true>
  const negatives: [TextRejectsArray, MultipleRejectsString] = [true, true]
  return { input, stringValue, arrayValue, dynamicValue, negatives }
}
