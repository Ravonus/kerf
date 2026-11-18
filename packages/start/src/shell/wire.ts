// Versioned frames contain JSON values and outcomes only. No legacy navigation fields are admitted.
import type { RouteSchema } from '../shell'

export const SHELL_MEDIA = 'application/x-ndjson'
export const SHELL_VERSION = 1
export const SHELL_BYTES = 256 * 1024
export const SHELL_FRAME_BYTES = 64 * 1024
export const SHELL_DEFERRED = 64
export const SHELL_TIMEOUT = 30_000

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

export function invalid(): never {
  throw new Error('Invalid shell route data')
}

export function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function fields(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    record(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  )
}

const reserved = new Set(['__proto__', 'constructor', 'prototype', 'then', 'toJSON'])

export function safeKey(key: string) {
  return !reserved.has(key)
}

function json(value: unknown, depth = 0): value is Json {
  if (depth > 32) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value))
    return (
      Object.keys(value).length === value.length && value.every((item) => json(item, depth + 1))
    )
  return (
    record(value) &&
    Object.entries(value).every(([key, item]) => safeKey(key) && json(item, depth + 1))
  )
}

function same(a: Json, b: Json): boolean {
  if (a === b) return true
  if (Array.isArray(a))
    return Array.isArray(b) && a.length === b.length && a.every((item, i) => same(item, b[i]!))
  return (
    record(a) &&
    record(b) &&
    Object.keys(a).length === Object.keys(b).length &&
    Object.entries(a).every(([key, item]) => Object.hasOwn(b, key) && same(item, b[key]!))
  )
}

export async function validate(schema: RouteSchema | undefined, value: unknown): Promise<Json> {
  if (!json(value)) invalid()
  if (!schema) return value === null ? value : invalid()
  if (schema['~standard']?.version !== 1) invalid()
  const result = await schema['~standard'].validate(value)
  if ('issues' in result || !json(result.value) || !same(value, result.value)) invalid()
  return result.value
}
