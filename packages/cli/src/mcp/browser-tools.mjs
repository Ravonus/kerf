import { expectations, actions as browserActions } from '../browser/commands.mjs'

const target = {
  description:
    'What the user sees: { role, name } (name exact), { label }, { text }, or a ref from the latest snapshot ("@e12")',
  anyOf: [
    { type: 'string', pattern: '^@?e\\d+$' },
    {
      type: 'object',
      properties: {
        role: { type: 'string' },
        name: { type: 'string' },
        exact: { type: 'boolean' },
      },
      required: ['role'],
    },
    { type: 'object', properties: { label: { type: 'string' } }, required: ['label'] },
    { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  ],
}

/** The `kerf browser` commands as tools. The page is the app open in any browser; the dev server relays to it. */
export function browserTools() {
  const tab = {
    url: {
      type: 'string',
      description: 'Dev server URL (default: .kerf/dev.json, then environments.dev.url)',
    },
    tab: {
      type: 'string',
      description: 'Tab id from browser_tabs (default: the focused or latest tab)',
    },
  }
  const t = (name, description, properties = {}, required) => ({
    name,
    description,
    inputSchema: {
      type: 'object',
      properties: { ...properties, ...tab },
      ...(required ? { required } : {}),
    },
  })
  return [
    t(
      'browser_tabs',
      "Tabs of the app connected to the dev server. Any browser works (yours, the person's); with none, call browser_launch. If your own browser can run JS, `await __kerf__.agent.run(command, args)` in the page does the same as these tools.",
    ),
    t(
      'browser_launch',
      'Start a headless Chrome on the app (only when you have no browser of your own)',
      { route: { type: 'string' }, headed: { type: 'boolean' } },
    ),
    t('browser_open', 'Navigate the tab to a route', { route: { type: 'string' } }, ['route']),
    t(
      'browser_snapshot',
      'The page as roles, names and refs (`- button "Add Banana" [ref=e15]`), plus kerf\'s live reactive graph with real names (`Cart.total = 42.5 ← Cart.subtotal → 1 binding in <Cart>`), and errors since the last call. Big payloads come back as a file path.',
      {
        interactive: { type: 'boolean', description: 'Only interactive elements' },
        delta: { type: 'boolean', description: 'Only what changed since the last snapshot' },
        scope: target,
        graph: {
          description: "false: no graph; 'only': only the graph; a string filters it by name",
          anyOf: [{ type: 'boolean' }, { type: 'string' }],
        },
      },
    ),
    t(
      'browser_act',
      `Act like a user (user-event, as in @kerf/core/test) and get back what changed on the page. Actions: ${browserActions.join(', ')}`,
      {
        target,
        action: { type: 'string', enum: browserActions },
        value: {
          type: 'string',
          description: 'fill/type text, press key (`{Enter}`), select option',
        },
      },
      ['target', 'action'],
    ),
    t(
      'browser_assert',
      `Check what the user sees (retries up to timeout ms). Expectations: ${expectations.join(', ')}. Recorded for browser_record.`,
      {
        target,
        expect: {
          type: 'object',
          description:
            '{ text: "Total $4" } | { value: "SAVE10" } | { disabled: true } | { count: 3 } | { absent: true } | …',
        },
        timeout: { type: 'number' },
      },
      ['target', 'expect'],
    ),
    ...browserStateTools(t),
  ]
}

function browserStateTools(t) {
  return [
    t(
      'browser_state',
      'Read the named reactive graph, or write a box by its graph name to reach a state fast (dev only)',
      {
        filter: { type: 'string', description: 'Name prefix (`Cart`, `cart.`)' },
        set: { type: 'string', description: 'Graph name to write, e.g. Cart.coupon' },
        value: { description: 'JSON value to write' },
      },
    ),
    t(
      'browser_time',
      "The page's clock: pause (reload: from page load, so startup timers are faked too), advance ms (runs due timers in order), resume, status",
      {
        op: { type: 'string', enum: ['pause', 'advance', 'resume', 'status'] },
        ms: { type: 'number' },
        reload: { type: 'boolean' },
      },
      ['op'],
    ),
    t(
      'browser_net',
      'The network as the app sees it: offline (navigator.onLine false, offline event, fetch fails, sockets dropped), online, latency ms (fetch), drop (close open WebSockets/EventSources: a server restart), reset, status',
      {
        op: { type: 'string', enum: ['offline', 'online', 'latency', 'drop', 'reset', 'status'] },
        ms: { type: 'number' },
      },
      ['op'],
    ),
    t(
      'browser_record',
      'Record what happens in the tab (your acts and asserts, and clicks/typing from any browser tool) and turn it into a @kerf/core/test test, which then has to pass the gate',
      {
        op: { type: 'string', enum: ['start', 'stop', 'steps', 'note', 'code'] },
        text: { type: 'string' },
        component: { type: 'string' },
        from: { type: 'string' },
        props: { type: 'string' },
        name: { type: 'string' },
        out: {
          type: 'string',
          description: 'Write the test to this file (relative to the project)',
        },
      },
      ['op'],
    ),
    t(
      'browser_logs',
      'Console errors and warnings, and uncaught errors with the kerf binding they came from, since the last call',
    ),
    t(
      'browser_screenshot',
      'PNG of the launched Chrome (browser_launch); in your own browser, use its screenshot tool',
      { out: { type: 'string' } },
    ),
  ]
}
