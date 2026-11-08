// Classify the complete bare-anchor shim; reject new declarations until they are reviewed.
export function classifyLinks(source, text) {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
  const match = /^\s*@layer\s+warp\.base\s*\{\s*(:where\(a:any-link\))\s*\{([^{}]*)\}\s*\}\s*$/.exec(clean)
  if (!match) throw new Error(`${source}: unclassified selector or at-rule`)
  const ruleStart = match.index + match[0].indexOf(match[2])
  const expected = {
    color: { path: 'text', domain: 'color', fallback: 'var(--warp-color-accent-text)' },
    'text-decoration-thickness': { path: 'underline.width', domain: 'width', fallback: 'var(--warp-border-hairline)' },
    'text-underline-offset': { path: 'underline.offset', domain: 'position', fallback: '0.22em' },
  }
  const result = []
  const seen = new Set()
  const body = match[2]
  for (const declaration of body.split(';')) {
    if (!declaration.trim()) continue
    const item = /^(\s*)([\w-]+)\s*:\s*(.*?)\s*$/.exec(declaration)
    if (!item || !expected[item[2]] || expected[item[2]].fallback !== item[3] || seen.has(item[2])) {
      throw new Error(`${source}: unclassified declaration ${declaration.trim()}`)
    }
    seen.add(item[2])
    const valueStart = ruleStart + body.indexOf(declaration) + declaration.indexOf(item[3])
    result.push({
      part: 'link', state: 'rest', path: expected[item[2]].path, domain: expected[item[2]].domain,
      selector: match[1], atRules: ['@layer warp.base'], source, property: item[2],
      fallback: item[3], inputs: [...item[3].matchAll(/var\((--warp-[\w-]+)/g)]
        .map((input) => ({ token: input[1], classification: 'system input' })),
      token: `--warp-link-${expected[item[2]].path.replace('.', '-')}`,
      units: item[2] === 'color' ? 'forbidden' : 'px', fallbackSpan: [valueStart, valueStart + item[3].length],
      classification: 'binding',
    })
  }
  for (const property of Object.keys(expected)) {
    if (!seen.has(property)) throw new Error(`${source}: missing binding ${property}`)
  }
  return result
}
