// Runtime and tooling diagnostics whose descriptions do not come from a compiler probe.

const start = '@kerf-js/start'
const core = '@kerf-js/core'
const cli = '@kerf-js/cli'
const pageMessage = 'Something went wrong.'
const functionMessage = 'Server function failed.'
const legacy = 'legacy'

/** Public copy and default status for failure capture, generated into Start without operator prose. */
export const primaryFailures = {
  E_REQUEST: { status: 500, message: pageMessage },
  E_ROUTE: { status: 500, message: pageMessage },
  E_CHUNK: { status: 500, message: pageMessage },
  E_STARTUP: { status: 500, message: pageMessage },
  E_PROCESS: { status: 500, message: pageMessage },
  E_SHUTDOWN: { status: 500, message: pageMessage },
  E_FN: { status: 500, message: functionMessage },
  E_LOAD: { status: 500, message: pageMessage },
  E_RENDER: { status: 500, message: pageMessage },
  E_HEAD: { status: 500, message: pageMessage },
  E_STREAM: { status: 500, message: pageMessage },
  E_RT: { status: 500, message: pageMessage },
  Q014: { status: 500, message: functionMessage },
  Q016: { status: 503, message: functionMessage },
}

/** @typedef {import('../catalog.mjs').Entry} Entry */

/** @returns {Entry} */
function runtime(code, owner, surface, phase, catches, fix, options = {}) {
  return {
    code,
    owner,
    surface,
    phase,
    catches,
    fix,
    severity: 'error',
    by: 'runtime',
    introduced: legacy,
    ...options,
  }
}

/** @returns {Entry} */
const startCode = (code, surface, phase, catches, fix, options) =>
  runtime(code, start, surface, phase, catches, fix, options)

/** @returns {Entry} */
const coreCode = (code, phase, catches, fix, options) =>
  runtime(code, core, 'state', phase, catches, fix, options)

/** @returns {Entry} */
const reserved = (code, surface, phase, catches, fix) =>
  startCode(code, surface, phase, catches, fix, { by: 'reserved', introduced: '0.1.1' })

/** @type {Entry[]} */
export const runtimeDiagnostics = [
  reserved(
    'E_REQUEST',
    'request',
    'dispatch',
    'A Kerf-owned request hook, endpoint or dispatch failed before a response',
    'Check the failing handler or dependency using the occurrence reference',
  ),
  startCode(
    'E_ROUTE',
    'page',
    'load or resolve',
    'A route load or error-route resolution failed',
    'Check the matched loader, layout or error route using the occurrence reference',
  ),
  reserved(
    'E_CHUNK',
    'browser',
    'import',
    'A foreground route or island chunk could not be loaded',
    'Check that the deployed assets and the document refer to the same build',
  ),
  reserved(
    'E_STARTUP',
    'process',
    'bootstrap',
    'A required initializer failed or hit its startup deadline',
    'Check the named initialization stage and required dependencies',
  ),
  reserved(
    'E_PROCESS',
    'process',
    'unowned failure',
    'An unowned exception or rejection reached the process boundary',
    'Identify and fix the failing callback or put the work under an explicit owner',
  ),
  reserved(
    'E_SHUTDOWN',
    'process',
    'drain',
    'A shutdown hook failed or work did not drain within the deadline',
    'Check the named cleanup stage for outstanding work',
  ),
  startCode(
    'E_FN',
    'function, form or page',
    'execute or read',
    'A server function, form submission or render-time query read failed',
    'Use the occurrence reference where available and inspect the failing function',
  ),
  startCode(
    'E_LOAD',
    'navigation',
    'deferred read',
    'A route navigation failed while reading its deferred data',
    'Check the rejected loader or deferred field',
  ),
  startCode(
    'E_RENDER',
    'page',
    'render',
    'A route outlet or server-rendered Boundary failed',
    'Check the failing view or resource using the occurrence reference',
  ),
  startCode(
    'E_HEAD',
    'page',
    'warm head',
    'Warning: response header count changed after the warm head. Error: warm rendering threw',
    'Set response headers before the head commits and inspect the producer if warm rendering threw',
  ),
  startCode(
    'E_STREAM',
    'page',
    'stream',
    'Warning: rendering stalled between passes. Error: the stream chunk loop failed',
    'Check pending resources for a stall and the live producer or writer for a chunk failure',
  ),
  startCode(
    'E_AFTER',
    'background',
    'after response',
    'An after-response callback failed',
    'Check the callback and handle failures of the work it starts',
  ),
  startCode(
    'E_RT',
    'realtime',
    'subscribe, upgrade or send',
    'A realtime operation failed while setting up or handling a connection or message',
    'Inspect the subscription, connection context, message handler or live dependency',
  ),
  startCode(
    'E_WARM',
    'function',
    'warm',
    'A background query warm failed',
    'Inspect the warmed query and its dependencies',
  ),
  startCode(
    'A006',
    'function or realtime',
    'authorize',
    'The signed-in user did not satisfy a role or permission rule',
    'Use an account the rule allows or correct the rule',
    { status: 403 },
  ),
  startCode(
    'A007',
    'auth',
    'setup',
    'Better Auth has no configured URL for the deployed app',
    'Configure the deployed site URL or the Better Auth URL',
  ),
  startCode(
    'Q018',
    'function or form',
    'read body',
    'The request body exceeded its limit',
    'Send a smaller body or configure the route body limit',
    { status: 413 },
  ),
  startCode(
    'Q019',
    'function',
    'limit or resolve',
    'A function exceeded its rate limit (429), or a function ID could not be resolved by the executor (404)',
    'Honor Retry-After for rate limits. For a missing function, check the ID and deploy and reload the caller',
    { status: 429 },
  ),
  startCode(
    'Q020',
    'function',
    'server call',
    'A serverCall ran outside a request',
    'Call it from a query, mutation, loader or extension route',
  ),
  startCode(
    'J001',
    'cron',
    'run',
    'A scheduled cron callback failed',
    'Inspect the named callback and its dependencies',
  ),
  startCode(
    'J002',
    'cron',
    'configure',
    'A cron schedule or its configuration is invalid',
    'Correct the schedule or its ownership configuration',
  ),
  startCode(
    'J003',
    'job',
    'retry',
    'A job attempt failed and is scheduled to run again',
    'Inspect the cause and ensure external side effects are idempotent',
    { severity: 'warning' },
  ),
  startCode(
    'J004',
    'job',
    'dead or queue',
    'A job exhausted its attempts, or a queue operation failed',
    'Inspect the dead job or restore the queue, according to the reported operation',
  ),
  reserved(
    'J005',
    'job',
    'queue infrastructure',
    'A job queue infrastructure operation failed',
    'Restore queue connectivity and check lease ownership before redriving work',
  ),
  startCode(
    'J006',
    'job',
    'enqueue',
    'A job input failed validation before enqueue',
    'Supply input that matches the job schema',
  ),
  coreCode(
    'S003',
    'load persistence',
    'Persisted state was unreadable or migrations were configured without a version',
    'Set the current version and provide migrations for stored values',
    { severity: 'warning' },
  ),
  coreCode(
    'S004',
    'define',
    'A scope contains too many writable boxes or actions',
    'Split the scope by feature',
    { severity: 'warning' },
  ),
  coreCode(
    'S008',
    'persist or synchronize',
    'Persistence or tab sync setup is invalid, a synchronized value failed validation, or a cookie exceeded its budget',
    'Check the storage and schema settings and trim cookie state',
  ),
  coreCode(
    'S009',
    'define or initialize',
    'A scope has a duplicate or reserved name, a setup cycle, or unavailable history',
    'Check scope names, setup dependencies and history configuration',
  ),
  coreCode(
    'S010',
    'serialize or persist',
    'A state value cannot be serialized as plain data',
    'Keep plain JSON values in state shared with the page or persisted',
  ),
  ...[
    [
      'E_ADD',
      'An add-on setup operation failed',
      'Review the add-on prerequisites and the reported setup step',
    ],
    [
      'E_AUDIT',
      'The audit could not obtain a browser result',
      'Check the audit target and the browser run',
    ],
    [
      'E_CDP',
      'The Chrome DevTools Protocol connection or command failed',
      'Check the browser process and its debugging endpoint',
    ],
    [
      'E_CHROME',
      'The Chrome process failed',
      'Check its launch configuration and local browser diagnostics',
    ],
    [
      'E_INTERNAL',
      'A command failed without a more specific diagnostic',
      'Inspect the failing command and its diagnostic output',
    ],
    [
      'E_NO_BRIDGE',
      'The dev server did not expose the Kerf browser bridge',
      'Use the Kerf Vite plugin in a running development app',
    ],
    [
      'E_NO_CHROME',
      'An available Chrome process could not be found or started',
      'Point the command at an available Chrome installation',
    ],
    [
      'E_NO_DEV',
      'The configured development server could not be reached',
      'Start the server or pass its URL',
    ],
    [
      'E_NO_KERF',
      'Kerf core could not be resolved for the project',
      'Run the command from the project with Kerf installed',
    ],
    [
      'E_NO_STYLE',
      'The style registry could not be found',
      'Run the app with the Kerf Vite plugin to generate the registry',
    ],
    [
      'E_NO_TAB',
      'No browser tab connected before the deadline',
      'Open the app in a tab and wait for the dev bridge',
    ],
    [
      'E_NO_VENEER',
      'The project does not have the required Veneer tooling',
      'Use the command in a project with Veneer installed',
    ],
    [
      'E_NO_VITEST',
      'The project has no Vitest installation',
      'Run the command in the project that owns the tests',
    ],
    [
      'E_PAGE',
      'A browser operation failed in the page',
      'Inspect the browser operation and its target',
    ],
    [
      'E_REFUSED',
      'A command declined an operation because a prerequisite was unmet',
      'Review the refusal and correct the reported prerequisite',
    ],
    [
      'E_TIMEOUT',
      'The browser bridge did not answer before its deadline',
      'Check the app tab and development connection',
    ],
    [
      'E_TRUST',
      'A plugin trust or permission operation was refused',
      'Review the plugin approval and the reported permission',
    ],
    [
      'E_UNKNOWN_GROUP',
      'A requested style group could not be found',
      'Look up the available names with kerf style find',
    ],
    [
      'E_UNKNOWN_NAME',
      'A requested style name is unknown',
      'Use the group and names from the style registry',
    ],
    [
      'E_UNKNOWN_TOPIC',
      'A requested docs topic or diagnostic could not be found',
      'Use kerf docs to list topics or check the code spelling',
    ],
    [
      'E_USAGE',
      'A command, flag or argument was invalid',
      'Check the command help and supply supported arguments',
    ],
  ].map(([code, catches, fix]) => runtime(code, cli, 'tooling', 'command', catches, fix)),
]

/** Additive runtime metadata for entries that already have editorial copy in the catalog. */
export const runtimeMetadata = {
  Q009: {
    surface: 'function',
    phase: 'resolve or method',
    status: 404,
    notes:
      'The existing HTTP missing-function response uses Q009. The executor also has a historical Q019 missing-function path.',
  },
}
