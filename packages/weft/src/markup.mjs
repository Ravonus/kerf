// What HTML holds, in the words `pieces` (node/purge.mjs) indexes CSS by. It runs on every request: no CSS, one regex pass.

/** What an HTML string holds, for `paints`: tags, classes, ids, attribute names and `name=value` pairs. */
export function markup(html) {
  const has = new Set(['html', 'head', 'body'])
  const noted = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, (m) => m.slice(0, m.indexOf('>') + 1))
    .replace(/<!--[\s\S]*?-->/g, '')
  for (const [, tag, attrs] of noted.matchAll(/<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
    has.add(tag.toLowerCase())
    for (const [, name, a, b, c] of attrs.matchAll(
      /\s([^\s=/>]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
    )) {
      const value = a ?? b ?? c ?? ''
      has.add(`[${name}]`)
      has.add(`[${name}=${value}]`)
      if (name === 'class') for (const w of value.split(/\s+/)) has.add(`.${w}`)
      if (name === 'id') has.add(`#${value}`)
      for (const v of value.match(/--[\w-]+/g) ?? []) has.add(v)
    }
  }
  return has
}
