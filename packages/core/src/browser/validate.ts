import type { StandardSchema } from '../index'

export const valid = <T>(schema: StandardSchema<T>, v: unknown): { value: T } | undefined => {
  const r = schema['~standard'].validate(v)
  return r instanceof Promise || r.issues ? undefined : { value: r.value }
}
