import { runInNewContext } from 'node:vm'
import { KerfError } from '@kerf-js/core/errors'
import { describe, expect, it } from 'vitest'
import { query } from '../src/data/definitions'
import { fns } from '../src/data/foundation'
import { FnError, StartError } from '../src/data/primitives'
import { dbError } from '../src/exec/errors'
import { createScope } from '../src/exec/scope'
import { createHandler } from '../src/server'
import {
  captureFailure,
  createFailureCapture,
  presentFailure,
  reportFailure,
} from '../src/server/failure'

const route = { surface: 'page', code: 'E_ROUTE' } as const
const secret = 'private error detail'
const reference = '0123456789abcdef01234567'

describe('failure capture', () => {
  it('projects identical fields for primitives, cross-realm errors, cyclic and aggregate causes', () => {
    const cyclic = new Error(secret)
    cyclic.cause = cyclic
    const foreign: unknown = runInNewContext('new Error("private foreign detail")')
    const aggregate = new AggregateError([cyclic, foreign], secret, { cause: cyclic })
    const unknown = {
      get message() {
        throw new Error('must not read untrusted message')
      },
      code: 'Q019',
      status: 429,
      answer: { message: secret },
      reference,
      toJSON: () => ({ secret }),
    }
    for (const thrown of [
      null,
      undefined,
      2,
      Symbol(secret),
      secret,
      foreign,
      cyclic,
      aggregate,
      unknown,
    ]) {
      const captured = captureFailure(thrown, createFailureCapture(reference), route)
      expect(captured.cause).toBe(thrown)
      expect(captured.classification).toBe('fault')
      expect(presentFailure(captured)).toEqual({
        code: 'E_ROUTE',
        status: 500,
        message: 'Something went wrong.',
        ref: reference,
      })
    }
  })

  it('retains the first capture in an attempt and gives independent retries new references', () => {
    const error = new Error(secret)
    const attempt = createFailureCapture(reference)
    const first = captureFailure(error, attempt, { ...route, operation: '/balances/$id' })
    expect(captureFailure(error, attempt, { surface: 'stream', code: 'E_STREAM' })).toBe(first)
    expect(captureFailure(first, attempt, route)).toBe(first)
    expect(first.operation).toBe('/balances/$id')
    expect(first.reference).toBe(reference)
    expect(Object.isFrozen(first)).toBe(true)

    const retry = captureFailure(error, createFailureCapture(), route)
    expect(retry.reference).toMatch(/^[0-9a-f]{24}$/)
    expect(retry.reference).not.toBe(first.reference)
    expect(captureFailure(new Error(secret), attempt, route).reference).not.toBe(first.reference)
  })

  it('can carry a primitive occurrence handle without collapsing repeated primitive throws', () => {
    const attempt = createFailureCapture()
    const first = captureFailure(secret, attempt, route)
    expect(captureFailure(first, attempt, route)).toBe(first)
    expect(captureFailure(secret, attempt, route).reference).not.toBe(first.reference)
  })
})

describe('failure presentation', () => {
  it('publishes only explicitly approved refusal fields and snapshots JSON', () => {
    const attempt = createFailureCapture(reference)
    const data = { retry: ['later'] }
    const path = ['email']
    const captured = captureFailure(new Error(secret), attempt, {
      surface: 'function',
      context: { secret },
      expected: {
        code: 'example/conflict',
        status: 409,
        message: 'Already registered.',
        issues: [{ message: 'Choose another.', path }],
        data,
      },
    })
    data.retry[0] = secret
    path[0] = secret
    expect(captured.classification).toBe('expected')
    expect(presentFailure(captured)).toEqual({
      code: 'example/conflict',
      status: 409,
      message: 'Already registered.',
      issues: [{ message: 'Choose another.', path: ['email'] }],
      data: { retry: ['later'] },
    })
    expect(captureFailure(secret, attempt, route).reference).toBe(reference)
  })

  it('falls back to a fault for a 5xx approval or non-JSON data', () => {
    let reads = 0
    const data = Object.defineProperty({ nested: '' }, 'nested', {
      enumerable: true,
      get() {
        reads++
        return secret
      },
    })
    for (const [status, payload] of [
      [503, undefined],
      [409, data],
    ] as const) {
      const captured = captureFailure(
        new FnError({ message: secret, code: 'upstream' }, status),
        createFailureCapture(reference),
        {
          surface: 'function',
          expected: {
            code: 'upstream',
            status,
            message: secret,
            ...(payload && { data: payload }),
          },
        },
      )
      expect(presentFailure(captured)).toEqual({
        code: 'E_REQUEST',
        status: 500,
        message: 'Something went wrong.',
        ref: reference,
      })
    }
    expect(reads).toBe(0)
  })

  it('adds bounded pre-redacted debug details only in explicitly selected development mode', () => {
    const captured = captureFailure(new Error(secret), createFailureCapture(reference), {
      ...route,
      debug: { message: 'redacted', stack: 'x'.repeat(3000), source: 'load', causes: ['safe'] },
    })
    expect(presentFailure(captured)).not.toHaveProperty('debug')
    expect(presentFailure(captured, 'development').debug).toEqual({
      message: 'redacted',
      stack: 'x'.repeat(2048),
      source: 'load',
      causes: ['safe'],
    })
  })
})

describe('legacy error compatibility', () => {
  it('keeps the StartError and FnError constructor contracts', () => {
    const error = new StartError('Q019', 'limited', 'wait', { status: 429 })
    expect(error).toBeInstanceOf(KerfError)
    expect(error.message).toBe('Q019: limited\n  fix: wait')
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      code: 'Q019',
      status: 429,
      extra: { status: 429 },
    })
    const hydrated = new FnError(
      { code: 'Q019', reference, stack: 'dev stack', data: { retry: true } },
      429,
    )
    expect(hydrated).toBeInstanceOf(KerfError)
    expect(hydrated).toMatchObject({
      code: 'Q019',
      message: 'server function failed (429)',
      status: 429,
      reference,
      stack: 'dev stack',
      data: { retry: true },
    })
  })

  it('retains the originating database error without serializing it in StartError', () => {
    const cause = new Error('no such table: inventory')
    const error = dbError(cause)
    expect(error).toBeInstanceOf(StartError)
    expect(error).toMatchObject({ code: 'Q014', cause, status: 500 })
    expect(Object.keys(error as StartError)).not.toContain('cause')
  })

  it('keeps the exact route payload fields, diagnostic code and reserved reference', () => {
    const scope = createScope(new Request('http://localhost'))
    scope.failure.reference = reference
    const reports: string[] = []
    const options = {
      manifest: { dir: 'src/routes', layouts: [], routes: [] },
      modules: {},
      onDiagnostic: (event: { code: string }) => reports.push(event.code),
    }
    const error = new Error(secret)
    const details = { status: 503, code: 'Q016' }
    expect(reportFailure(scope, options, error, details)).toEqual({
      status: 503,
      message: 'Something went wrong.',
      reference,
    })
    expect(reportFailure(scope, { ...options, dev: true }, error, details)).toEqual({
      status: 503,
      message: secret,
      reference,
      stack: error.stack,
    })
    expect(reports).toEqual(['Q016', 'Q016'])
  })
})

it('keeps production function failure bytes and the explicit legacy FnError path', async () => {
  const unhandled = query({
    run: () => {
      throw new Error(secret)
    },
  })
  const declared = query({
    run: () => {
      throw new FnError({ message: secret, code: 'example' }, 503)
    },
  })
  const handler = createHandler({
    manifest: { dir: 'src/routes', layouts: [], routes: [] },
    modules: {},
    requestOrigin: false,
  })
  try {
    const call = (id: string) => handler(new Request(`http://localhost/_kerf/fn/${id}`))
    const unexpected = await call(unhandled.$id)
    expect(unexpected.status).toBe(500)
    const ref = unexpected.headers.get('x-kerf-error')
    expect(ref).toMatch(/^[0-9a-f]{24}$/)
    expect(await unexpected.json()).toEqual({
      e: { status: 500, message: 'Server function failed.', reference: ref },
    })
    const explicit = await call(declared.$id)
    expect(explicit.status).toBe(503)
    expect(await explicit.json()).toEqual({ e: { code: 'example', message: secret } })
  } finally {
    fns.delete(unhandled.$id)
    fns.delete(declared.$id)
  }
})
