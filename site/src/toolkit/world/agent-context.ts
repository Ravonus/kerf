import type {
  PromptSuggestion,
  ContextUse,
} from '@kerf-js/veneer'
import { PEOPLE } from './people'

export const COMMANDS: PromptSuggestion[] = [
  { value: '/logs', description: "Read a deploy's log" },
  {
    value: '/rollback',
    description: 'Go back to an earlier deploy',
  },
  {
    value: '/status',
    description: "Show every project's status",
  },
]

export const MENTIONS: PromptSuggestion[] = PEOPLE.slice(
  0,
  4,
).map((p) => ({
  value: `@${p.id}`,
  description: p.name,
}))

export const CONTEXT: ContextUse = {
  used: 46000,
  limit: 200000,
  parts: [
    { label: 'Logs', tokens: 22000 },
    { label: 'History', tokens: 16000 },
    { label: 'Tools', tokens: 8000 },
  ],
}
