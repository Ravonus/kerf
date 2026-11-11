import type { AgentEvent } from '@kerf-js/veneer'

export const ROLLBACK_ARGS =
  '{\n  "project": "mobile-bff",\n ' +
  ' "to": "d-4801",\n  "regions": ' +
  '["ap-south"]\n}'

export const ROLLBACK_ASK: AgentEvent[] = [
  {
    kind: 'reasoning',
    text:
      'A rollback changes production,' +
      ' so I should check the target ' +
      'first and ask before running ' +
      'it.',
  },
  {
    kind: 'tool',
    id: 'check',
    name: 'get_deploy',
    args: '{ "deploy": "d-4801" }',
  },
  {
    kind: 'tool-result',
    id: 'check',
    output: 'd-4801 · live · healthy · 412 ms p95',
    ms: 280,
  },
  {
    kind: 'text',
    text:
      '`d-4801` is healthy, so it is ' +
      'a safe place to go back to. ' +
      'This changes production, so I ' +
      'need your approval.',
  },
  {
    kind: 'approval',
    id: 'rollback',
    name: 'rollback',
    args: ROLLBACK_ARGS,
  },
]

export const ROLLBACK_RUN: AgentEvent[] = [
  { kind: 'tool', id: 'rollback' },
  {
    kind: 'tool-result',
    id: 'rollback',
    output: 'mobile-bff is on d-4801 in ap-south',
    ms: 2100,
  },
  {
    kind: 'text',
    text:
      'Done. `mobile-bff` is back on ' +
      '`d-4801`, and the checks are ' +
      'passing.',
  },
  { kind: 'done' },
]

export const ROLLBACK_DENIED: AgentEvent[] = [
  { kind: 'tool-result', id: 'rollback', denied: true },
  {
    kind: 'text',
    text: 'Okay, I left production as it is.',
  },
  { kind: 'done' },
]
