// Digests for the gen step: canonical JSON with sorted keys, so the same request always has the same sha256.
import { createHash } from 'node:crypto'

/** A copy of `value` with every object's keys sorted, for canonical JSON. */
export function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted)
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value))
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .toSorted()
        .map((key) => [key, sorted(value[key])]),
    )
  return value
}

/** Canonical JSON: sorted keys, no whitespace, undefined fields left out. */
export const canonical = (value) => JSON.stringify(sorted(value))

/** The sha256 of a string or bytes, as hex. */
export const sha256 = (data) => createHash('sha256').update(data).digest('hex')

/**
 * A request's digest: the fields that decide its output. An input counts by its recipe digest when it has one,
 * since GPUs differ in the last bit, and by its bytes' digest otherwise.
 */
export function requestDigest(request) {
  const { adapter, model, op, prompt, negative, seed, size, n, params } = request
  const inputs = request.inputs.map(({ role, digest }) => ({ role, digest }))
  return sha256(canonical({ adapter, model, op, prompt, negative, seed, size, n, params, inputs }))
}
