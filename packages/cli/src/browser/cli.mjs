// `weft browser <command>`: JSON on stdout with --json, a readable form on stderr otherwise.

import { browser, browserUsage, cliParams } from './commands.mjs'

export { browserUsage }

export async function browserCommand(args, { print, say, io }) {
  const [cmd, ...words] = args.positional
  if (!cmd || cmd === 'help') {
    say(browserUsage)
    return cmd ? 0 : 2
  }
  try {
    const result = await browser(args.root, cmd, cliParams(cmd, words, args.flags), {
      url: args.flags.url,
      tab: args.flags.tab,
    })
    if (args.json) print(result)
    else io.stdout.write(`${human(cmd, result)}\n`)
    return result?.ok === false ? 1 : 0
  } catch (error) {
    if (error.code === 'E_USAGE') throw error
    if (args.json)
      print({
        ok: false,
        error: { code: error.code ?? 'E_INTERNAL', message: error.message, tabs: error.tabs },
      })
    say(`weft browser ${cmd}: ${error.message}`)
    return 1
  }
}

function human(cmd, r) {
  const text = (v) =>
    typeof v === 'string' ? v : v?.path ? `(${v.chars} chars in ${v.path})\n${v.head}` : ''
  if (cmd === 'snapshot')
    return [
      `${r.title} ${r.url}`,
      r.delta ?? text(r.tree),
      r.graph ? `\n# graph\n${text(r.graph)}` : '',
      r.errors?.length
        ? `\n# errors\n${r.errors.map((e) => `${e.message}${e.at ? ` (at ${e.at})` : ''}`).join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n')
  if (cmd === 'act') return `${r.target}: ${r.changes}`
  if (cmd === 'assert')
    return `${r.ok ? 'ok' : 'FAIL'} ${r.target} ${JSON.stringify(r.expected)}${r.ok ? '' : `, got ${JSON.stringify(r.actual)}`}`
  if (cmd === 'graph') return text(r.graph)
  if (cmd === 'record' && r.code) return r.code
  return JSON.stringify(r, null, 2)
}
