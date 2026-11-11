import type { AgentEvent } from '@kerf/veneer'
import { DEPLOY_SOURCES } from './agent-sources'

export const WHY_TEXT =
  'Deploy `d-4819` failed its ' +
  'health check. The new retry ' +
  'code tries five times on ' +
  'every timed out upstream call,' +
  ' so one slow request in ' +
  'ap-south holds a connection ' +
  'for 15 seconds [1]. Three ' +
  'failed checks in a row held ' +
  'the deploy back, so nobody ' +
  'was served the bad version ' +
  '[2].\n\nThe cause is one line ' +
  'in the retry settings [3]:\n\n' +
  '```TypeScript\nconst attempts ' +
  '= 5 // was 2\n```\n\n- `d-4801` ' +
  'is still live and healthy.\n- ' +
  'Lowering `attempts` to 2 ' +
  'should get the deploy ' +
  'through.\n'

export const WHY_FAILED: AgentEvent[] = [
  {
    kind: 'plan',
    steps: [
      {
        id: 'logs',
        title: 'Read the build log',
        state: 'done',
      },
      {
        id: 'diff',
        title: 'Compare with the last good deploy',
        state: 'done',
      },
      {
        id: 'sum',
        title: 'Explain what went wrong',
        state: 'running',
      },
    ],
  },
  {
    kind: 'reasoning',
    at: 0,
    text:
      'The deploy reached the health ' +
      'check, so the build itself is ' +
      'fine. The log should say ' +
      'which check failed and in ' +
      'which region.',
  },
  {
    kind: 'tool',
    id: 'logs',
    name: 'read_logs',
    args: '{ "deploy": "d-4819", "lines": 200 }',
    at: 4000,
  },
  {
    kind: 'tool-result',
    id: 'logs',
    output:
      '3 failed checks\nupstream ' +
      'timed out after 3000 ms ' +
      '(ap-south)',
    ms: 640,
  },
  {
    kind: 'tool',
    id: 'diff',
    name: 'compare_deploys',
    args: '{ "from": "d-4801", "to": "d-4819" }',
  },
  {
    kind: 'tool-result',
    id: 'diff',
    output:
      '1 file changed\nsrc/retry.ts: attempts 2 → 5',
    ms: 410,
  },
  { kind: 'text', text: WHY_TEXT },
  ...DEPLOY_SOURCES.map((s): AgentEvent => ({
    kind: 'source',
    ...s,
  })),
  { kind: 'done' },
]
