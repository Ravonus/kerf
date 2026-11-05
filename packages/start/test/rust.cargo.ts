import { describe, expect, test } from 'vitest'
import { readCargo } from '../src/sidecar.mjs'

function registerCargoDiagnosticTests(
  read: (lines: string[]) => ReturnType<typeof readCargo>,
  message: (code: string, text: string, file?: string, line?: number) => string,
) {
  test("an error that names a function's types or method is R103, with its id and place", () => {
    const { diagnostics } = read([
      message('E0063', 'missing field `lang` in initializer of `SearchDocsOutputItem`'),
      message('E0046', 'not all trait items implemented, missing: `search_docs`'),
    ])
    expect(diagnostics.map((d) => [d.code, d.function, d.file, d.span[0]])).toEqual([
      ['R103', 'searchDocs.abc123', 'crates/search/src/main.rs', 9],
      ['R103', 'searchDocs.abc123', 'crates/search/src/main.rs', 9],
    ])
  })

  test("any other error is R109, and another service's function isn't this one's", () => {
    const { diagnostics } = read([
      message('E0412', 'cannot find type `strr` in this scope'),
      message('E0599', 'no method `other` found'),
    ])
    expect(diagnostics.map((d) => d.code)).toEqual(['R109', 'R109'])
  })
}

function registerCargoBuildTests(read: (lines: string[]) => ReturnType<typeof readCargo>) {
  test('a build gives the binary; warnings and the summary line are not errors', () => {
    const r = read([
      JSON.stringify({
        reason: 'compiler-artifact',
        executable: '/x/target/debug/build-script-build',
        target: { kind: ['custom-build'] },
      }),
      JSON.stringify({
        reason: 'compiler-artifact',
        executable: '/x/target/debug/search',
        target: { kind: ['bin'] },
      }),
      JSON.stringify({
        reason: 'compiler-message',
        message: { level: 'warning', message: 'unused', spans: [] },
      }),
      JSON.stringify({
        reason: 'compiler-message',
        message: {
          level: 'error',
          message: 'aborting due to 1 previous error',
          code: null,
          spans: [],
        },
      }),
      JSON.stringify({ reason: 'build-finished', success: true }),
      'not json',
    ])
    expect(r).toMatchObject({ ok: true, exe: '/x/target/debug/search', diagnostics: [] })
  })
}

export function registerCargoTests() {
  describe("cargo's messages", () => {
    const contractOf = {
      functions: [
        { id: 'searchDocs.abc123', name: 'searchDocs', impl: { service: 'search' } },
        { id: 'other.abc123', name: 'other', impl: { service: 'elsewhere' } },
      ],
    }
    const message = (code: string, text: string, file = 'src/main.rs', line = 9) =>
      JSON.stringify({
        reason: 'compiler-message',
        message: {
          level: 'error',
          code: { code },
          message: text,
          rendered: `error: ${text}`,
          spans: [
            {
              is_primary: true,
              file_name: file,
              line_start: line,
              column_start: 2,
              line_end: line,
              column_end: 5,
            },
          ],
        },
      })
    const read = (lines: string[]) =>
      readCargo(lines.join('\n'), {
        contract: contractOf,
        service: 'search',
        root: '/app',
        dir: '/app/crates/search',
      })

    registerCargoDiagnosticTests(read, message)
    registerCargoBuildTests(read)
  })
}
