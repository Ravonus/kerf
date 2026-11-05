import { conversationDocs } from './agent-conversation.ts'
import { toolDocs } from './agent-tools.ts'
import { inspectionDocs } from './agent-inspection.ts'
import type { DocGroup } from '../types.ts'

export const agent: DocGroup = {
  file: 'agent',
  title: 'Agent',
  intro: 'Chat, tool calls and citations, for apps with an AI assistant.',
  pack: true,
  docs: [...conversationDocs, ...toolDocs, ...inspectionDocs],
}
