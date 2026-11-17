/** Diagnostic entries shared by the Agent manifest and framework reference. */
export const diagnostics = [
  [
    'AGENT001',
    'error',
    'The assistant used by someone signed out',
    "Every agent function is `auth: 'user'`",
  ],
  [
    'AGENT002',
    'error',
    "A conversation or token that isn't the caller's",
    'Only its owner reads or changes it',
  ],
  [
    'AGENT003',
    'error',
    'No bridge can answer here',
    'Start the Rust bridge daemon, set ANTHROPIC_API_KEY, or sign in to the `claude` CLI',
  ],
  ['AGENT004', 'error', 'An empty message', 'Say something first'],
  ['AGENT005', 'error', 'A held call answered twice', 'Each is approved or declined once'],
  [
    'AGENT006',
    'error',
    'A token with nothing its creator may grant',
    'Give it grants you hold yourself',
  ],
  [
    'AGENT007',
    'error',
    'A token used on `/_kerf/fn/` directly',
    'Agents call tools through `/_kerf/x/agent/mcp`',
  ],
  [
    'AGENT008',
    'error',
    "A tool call to a function that didn't opt in",
    "Add `agent: { say: '…' }` to it",
  ],
  [
    'AGENT009',
    'error',
    "A tool call the grant doesn't allow",
    'Grant its permission (`scope.read` / `scope.write`) to the role or token',
  ],
  [
    'AGENT010',
    'error',
    '`memoryAgentStore()` on a production server',
    '`drizzleAgentStore(db, tables)`, or your own `AgentStore`',
  ],
].map(([code, severity, catches, fix]) => ({ code, severity, catches, fix }))
