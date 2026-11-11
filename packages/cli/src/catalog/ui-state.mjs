/** uiState diagnostic entries in catalog order. */
export const uiState = [
  {
    code: 'U001',
    severity: 'error',
    by: 'cli',
    catches:
      'A `share` key built from `Math.random`, `Date.now` or `crypto.randomUUID`: no other tab or client will ever have the same one',
    fix: `Build it from a stable id: \`share: () => \`todo:\${props.id}\`\``,
  },
  {
    code: 'U002',
    severity: 'warning',
    by: 'cli',
    catches:
      'A `share` key taken from the URL or something typed: `realtime({ share })` then authorises a string the user chose',
    fix: 'Build it from data the server knows, and have the rule check it',
  },
  {
    code: 'U003',
    severity: 'warning',
    by: 'cli',
    catches:
      '`interaction({ share })` in an app with no `realtime({ share })`: tabs work, and other clients are refused (R011)',
    fix: 'Add `share: ({ ctx, key }) => …` to `realtime()` in `src/realtime.server.ts`, or leave it if tabs are all you want',
  },
  {
    code: 'U004',
    severity: 'error',
    by: 'cli',
    catches: 'Writing `row.remote`: it is what others are doing, and only the network writes it',
    fix: 'Write `row.hover`, or keep your own `state`',
  },
  {
    code: 'U005',
    severity: 'error',
    by: 'cli',
    catches:
      '`ui` on a veneer component that does not take it: an attribute is written and nothing is drawn',
    fix: 'Use Button, Checkbox, Switch, Radio, Toggle, Chip or Card, or read the row yourself',
  },
]
