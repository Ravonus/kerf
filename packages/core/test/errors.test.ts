import { describe, expect, it } from 'vitest'
import { KerfError, type PublicFailure } from '@kerf-js/core/errors'
import { StateError } from '../src/scope'

describe('KerfError', () => {
  it('keeps native Error identity, stack and cause', () => {
    const cause = new Error('private detail')
    const error = new KerfError('operation failed', { cause })
    expect(error).toBeInstanceOf(Error)
    expect(error.cause).toBe(cause)
    expect(error.stack).toContain('Error: operation failed')
    expect(Object.keys(error)).toEqual([])
  })

  it('keeps the StateError code and fix in their existing form', () => {
    const error = new StateError('S008', 'unsupported storage', 'use local storage')
    expect(error).toBeInstanceOf(StateError)
    expect(error).toBeInstanceOf(KerfError)
    expect(error.message).toBe('S008: unsupported storage\n  fix: use local storage')
    expect(JSON.parse(JSON.stringify(error))).toEqual({ code: 'S008' })
  })

  it('gives a transport an independent public value', () => {
    const value: PublicFailure = {
      code: 'example',
      status: 422,
      message: 'Check your input.',
      issues: [{ path: ['items', 0], message: 'Pick an item.' }],
      data: { retry: false },
    }
    expect(JSON.parse(JSON.stringify(value))).toEqual(value)
  })
})
