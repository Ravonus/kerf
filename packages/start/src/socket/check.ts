import { StartError, type Context, type Fn, type StandardSchemaV1 } from '../data'
import type { Bucket } from './types'

export function take(b: Bucket, perSecond: number, burst: number) {
  const now = Date.now()
  b.tokens = Math.min(burst, b.tokens + ((now - b.at) * perSecond) / 1000)
  b.at = now
  if (b.tokens < 1) return false
  b.tokens--
  return true
}

export async function check(schema: StandardSchemaV1 | undefined, value: unknown, what: string) {
  if (!schema) return value
  const r = await schema['~standard'].validate(value)
  if (!r.issues) return r.value
  throw new StartError(
    'Q002',
    `${what} was refused: ${r.issues.map((i) => i.message).join('; ')}`,
    'send what the schema accepts',
    {
      status: 400,
      issues: r.issues.map((i) => ({
        message: i.message,
        path: i.path?.map((p) => (typeof p === 'object' ? p.key : p)),
      })),
    },
  )
}

type Authorize = ((args: { ctx: Context; params: unknown }) => unknown) &
  Record<'read' | 'write', (args: { ctx: Context; key: unknown }) => unknown>
export const allowed = async (
  fn: Fn,
  ctx: Context,
  params: unknown,
  write?: boolean,
): Promise<boolean> => {
  const a = fn.def.authorize as Authorize
  return !!(await (fn.kind === 'shared'
    ? a[write ? 'write' : 'read']({ ctx, key: params })
    : a({ ctx, params })))
}

export const denied = (fn: Fn) =>
  new StartError(
    'R011',
    `\`${fn.$id}\`: \`authorize\` refused this client`,
    'sign in, or check `authorize`',
  )
