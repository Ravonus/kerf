import { z } from 'zod'
import { describe, expect, test } from 'vitest'
import { describe as contract } from '../src/contract.mjs'
import { remote } from '../src/rust'

/** The contract, as far as these tests read it. */
interface Described {
  functions: {
    errors?: string[]
    impl: { ctx: string; output: { properties: Record<string, unknown> } }
  }[]
  services: Record<string, { hash: string; functions: string[] }>
  diagnostics: { code: string; why: string }[]
}

function contractFixture(search: ReturnType<typeof remote>) {
  const entry = (kind: string, id: string, def: object): [string, unknown] => [
    id,
    { kind, $id: id, def: { impl: search, ...def } },
  ]
  const of = (...fs: [string, unknown][]) => contract(new Map(fs)) as Described

  return { entry, of }
}

type ContractFixture = ReturnType<typeof contractFixture>

function registerContractShapeTests({ entry, of }: ContractFixture) {
  test('a function with `impl` names its service, its context and its wire', () => {
    const at = z.codec(z.iso.datetime(), z.date(), {
      decode: (s) => new Date(s),
      encode: (d) => d.toISOString(),
    })
    const { functions, services, diagnostics } = of(
      entry('query', 'a.111111', {
        input: z.object({ q: z.string() }),
        output: z.object({ at }),
        cache: { life: 'minutes' },
      }),
      entry('mutation', 'b.111111', {
        output: z.null(),
        auth: 'user',
        errors: { Gone: z.object({ id: z.string() }) },
      }),
      entry('query', 'c.111111', { output: z.string(), cache: { life: 'minutes', scope: 'user' } }),
      entry('query', 'd.111111', { output: z.string(), impl: remote('rust://other') }),
    )
    expect(diagnostics).toEqual([])
    expect(functions[0]!.impl).toMatchObject({
      kind: 'remote',
      target: 'rust://search',
      service: 'search',
      ctx: 'shared',
    })
    expect(functions[0]!.impl.output.properties.at).toMatchObject({
      type: 'string',
      format: 'date-time',
    }) // what Rust sends, not the Date
    expect(functions[1]!.impl).toMatchObject({ ctx: 'user', errors: { Gone: { type: 'object' } } })
    expect(functions[1]!.errors).toContain('Gone')
    expect(functions[2]!.impl.ctx).toBe('ctx')
    expect(Object.keys(services).sort()).toEqual(['other', 'search'])
    expect(services.search!.functions).toEqual(['a.111111', 'b.111111', 'c.111111'])
  })

  test('the hash moves with a schema, and only for its own service', () => {
    const pair = () => [
      entry('query', 'a.1', { output: z.string() }),
      entry('query', 'b.1', { output: z.string(), impl: remote('rust://other') }),
    ]
    const one = of(...pair())
    const same = of(...pair())
    const edited = of(entry('query', 'a.1', { output: z.number() }), pair()[1]!)
    expect(same.services).toEqual(one.services)
    expect(edited.services.search!.hash).not.toBe(one.services.search!.hash)
    expect(edited.services.other!.hash).toBe(one.services.other!.hash)
  })
}

function registerContractValidationTests({ entry, of }: ContractFixture) {
  test('an app with no sidecar has no `services`', () => {
    expect('services' in contract(new Map())).toBe(false)
  })

  test("R101: no output, what JSON can't carry, a one-way transform; a codec passes", () => {
    const codes = (def: object) =>
      of(entry('query', 'x.1', def)).diagnostics.filter((d) => d.code === 'R101').length
    expect(codes({})).toBe(1)
    expect(codes({ output: z.date() })).toBe(1)
    expect(codes({ output: z.bigint() })).toBe(1)
    expect(codes({ output: z.void() })).toBe(1)
    expect(codes({ output: z.null(), input: z.date() })).toBe(1)
    expect(
      codes({ output: z.null(), input: z.object({ a: z.string().transform((s) => s.length) }) }),
    ).toBe(1)
    expect(
      codes({
        output: z.null(),
        input: z.array(z.object({ a: z.preprocess((v) => v, z.string()) })),
      }),
    ).toBe(1)
    expect(codes({ output: z.null(), errors: { Bad: z.date() } })).toBe(1)
    expect(codes({ output: z.object({ a: z.string().transform((s) => s.length) }) })).toBe(0) // TS parses what comes back
    expect(
      codes({
        output: z.string(),
        input: z.object({
          a: z.string().trim(),
          at: z.codec(z.iso.datetime(), z.date(), {
            decode: (s) => new Date(s),
            encode: (d) => d.toISOString(),
          }),
        }),
      }),
    ).toBe(0)
  })
}

function registerContractDiagnosticTests({ entry }: ContractFixture) {
  test('R101 is only for `impl`: a TS function keeps C001', () => {
    const { diagnostics } = contract(
      new Map([['t', { kind: 'query', $id: 't.1', def: { output: z.date() } }]]),
    ) as Described
    expect(diagnostics.map((d) => d.code)).toEqual(['C001'])
  })

  test('R102: object unions, wherever they sit; `.nullable()` and scalars pass; the setting allows them', () => {
    const union = z.union([z.object({ a: z.string() }), z.object({ b: z.string() })])
    const codes = (def: object, rust?: Parameters<typeof contract>[1]) =>
      (contract(new Map([entry('query', 'x.1', def)]), rust) as Described).diagnostics
        .filter((d) => d.code === 'R102')
        .map((d) => /'s `([^`]+)` is a plain/.exec(d.why)![1])
    expect(codes({ output: union })).toEqual(['output'])
    expect(codes({ output: z.null(), input: z.object({ a: z.array(union) }) })).toEqual(['input.a'])
    expect(codes({ output: z.null(), errors: { E: union } })).toEqual(['error E'])
    expect(codes({ output: z.object({ a: z.string() }).nullable() })).toEqual([])
    expect(codes({ output: z.union([z.string(), z.number()]) })).toEqual([])
    expect(
      codes({
        output: z.discriminatedUnion('k', [
          z.object({ k: z.literal('a') }),
          z.object({ k: z.literal('b') }),
        ]),
      }),
    ).toEqual([])
    expect(codes({ output: union }, { unions: 'allow' })).toEqual([])
  })
}

export function registerContractTests(search: ReturnType<typeof remote>) {
  describe('the contract', () => {
    const fixture = contractFixture(search)
    registerContractShapeTests(fixture)
    registerContractValidationTests(fixture)
    registerContractDiagnosticTests(fixture)
  })
}
