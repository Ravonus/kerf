// A tiny Standard Schema (standardschema.dev) so the fixture needs no validation library.
import type { StandardSchemaV1 } from '@kerf/start'

export function object<T extends Record<string, 'string' | 'number'>>(
  shape: T,
): StandardSchemaV1<{ [K in keyof T]: T[K] extends 'string' ? string : number }> {
  return {
    '~standard': {
      version: 1,
      vendor: 'fixture',
      validate(value: any) {
        if (!value || typeof value !== 'object')
          return { issues: [{ message: 'expected an object' }] }
        for (const k in shape) {
          if (typeof value[k] !== shape[k])
            return { issues: [{ message: `expected a ${shape[k]}`, path: [k] }] }
          if (shape[k] === 'string' && !value[k])
            return { issues: [{ message: 'required', path: [k] }] }
        }
        return { value }
      },
    },
  }
}
