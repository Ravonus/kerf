// The local `claude` CLI, for a machine signed in to Claude with no API key. It runs the tools itself, through the
// app's MCP endpoint with a token good for this turn only, so its calls pass the same grants and guard as any other.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { transcript, type Bridge, type BridgeStep, type BridgeTurn } from '../bridge'

/** How the CLI bridge runs `claude`. */
export interface CliOptions {
  /** The executable. Default `claude` on PATH. */
  command?: string
  /** Passed as `--model`. Default: the CLI's own. */
  model?: string
  /** Default 110s. */
  timeout?: number
  id?: string
  label?: string
}

const onPath = (cmd: string) =>
  cmd.includes('/')
    ? existsSync(cmd)
    : (process.env.PATH ?? '').split(delimiter).some((d) => d && existsSync(join(d, cmd)))

type Usage = { model: string; input: number; output: number }
type Event = {
  type?: string
  subtype?: string
  model?: string
  is_error?: boolean
  result?: unknown
  usage?: { input_tokens?: number; cache_read_input_tokens?: number; output_tokens?: number }
  event?: { type?: string; delta?: { type?: string; text?: string } }
}

/** The CLI's flags for one turn: print mode, stream-json, no built-in tools, and the app's MCP server if there is one. */
function argsFor(turn: BridgeTurn, options: CliOptions) {
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--no-session-persistence',
    '--tools',
    '',
    '--system-prompt',
    turn.system,
  ]
  if (options.model) args.push('--model', options.model)
  if (!turn.mcp) return [...args, '--strict-mcp-config']
  const headers = { Authorization: `Bearer ${turn.mcp.token}` }
  const config = { mcpServers: { app: { type: 'http', url: turn.mcp.url, headers } } }
  return [
    ...args,
    '--mcp-config',
    JSON.stringify(config),
    '--strict-mcp-config',
    '--allowedTools',
    'mcp__app',
  ]
}

/** What one stream-json line adds: words, the model, the final usage, or an error. */
function read(
  ev: Event,
  s: { text: string; errors: string; usage: Usage },
  said: (d: string) => void,
) {
  if (
    ev.type === 'stream_event' &&
    ev.event?.type === 'content_block_delta' &&
    ev.event.delta?.type === 'text_delta'
  ) {
    const d = String(ev.event.delta.text ?? '')
    s.text += d
    said(d)
  } else if (ev.type === 'system' && ev.subtype === 'init' && ev.model)
    s.usage.model = String(ev.model)
  else if (ev.type === 'result') {
    if (ev.is_error) s.errors += String(ev.result ?? 'claude reported an error')
    else if (!s.text && typeof ev.result === 'string') s.text = ev.result
    s.usage.input =
      Number(ev.usage?.input_tokens ?? 0) + Number(ev.usage?.cache_read_input_tokens ?? 0)
    s.usage.output = Number(ev.usage?.output_tokens ?? 0)
  }
}

/** Each whole JSON line of `chunk`, after what was left over last time; returns what's left over now. */
function lines(buffered: string, each: (ev: Event) => void) {
  let nl: number
  while ((nl = buffered.indexOf('\n')) >= 0) {
    const line = buffered.slice(0, nl).trim()
    buffered = buffered.slice(nl + 1)
    if (!line.startsWith('{')) continue
    try {
      each(JSON.parse(line) as Event)
    } catch {}
  }
  return buffered
}

/** One turn of the CLI: spawned in an empty directory, so it has nothing of the project to wander into. */
function run(command: string, turn: BridgeTurn, options: CliOptions): Promise<BridgeStep> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argsFor(turn, options), {
      cwd: tmpdir(),
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: turn.signal,
    })
    const timer = setTimeout(() => child.kill('SIGTERM'), options.timeout ?? 110_000)
    const s = {
      text: '',
      errors: '',
      usage: { model: options.model ?? 'claude-cli', input: 0, output: 0 },
    }
    let buffered = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on(
      'data',
      (chunk: string) => (buffered = lines(buffered + chunk, (ev) => read(ev, s, turn.text))),
    )
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (c: string) => (s.errors = (s.errors + c).slice(-600)))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 && s.text.trim()) resolve({ text: s.text, calls: [], usage: s.usage })
      else
        reject(
          new Error(`claude exited with ${code}: ${s.errors.trim().slice(0, 300) || 'no answer'}`),
        )
    })
    child.stdin.end(transcript(turn.messages))
  })
}

/** The local `claude` CLI as a bridge: available when it is on PATH. */
export function claudeCli(options: CliOptions = {}): Bridge {
  const command = options.command ?? 'claude'
  return {
    id: options.id ?? 'cli',
    label: options.label ?? 'Claude (this computer)',
    tools: 'mcp',
    available: () => onPath(command),
    step: (turn: BridgeTurn) => run(command, turn, options),
  }
}
