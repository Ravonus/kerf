/** contracts diagnostic entries in catalog order. */
export const contracts = [
  {
    code: 'C001',
    severity: 'warning',
    by: 'cli',
    catches:
      "A function's `input` or `output` schema can't become JSON Schema: the contract says `{}`",
    fix: "Use a schema with JSON Schema support (Zod 4 has it), or drop what can't be represented",
  },
  {
    code: 'C002',
    severity: 'error',
    by: 'start',
    catches: "A function's value failed its `output` schema (dev and tests)",
    fix: 'Fix `run`, or the schema',
  },
]
