// Record reviewed Button paint sites and the shared tone inputs they read.
import { consumers } from './theme-schema-consumers.mjs'
import { componentsPath } from './theme-schema-components.mjs'

export function classifyButton(text) {
  const result = []
  const selector = ':where([data-scope="button"])'
  const start = text.indexOf(`${selector} {`)
  if (start < 0) throw new Error('button: missing host rule')
  const end = text.indexOf('}', start)
  const rule = text.slice(start, end + 1)
  const parsed = consumers(componentsPath, rule)
  const fields = {
    border: ['border', 'border', 'px width only'],
    background: ['bg', 'color', 'forbidden'],
    color: ['text', 'color', 'forbidden'],
  }
  for (const [property, [path, domain, units]] of Object.entries(fields)) {
    const match = new RegExp(`(?:^|[;{])\\s*${property}\\s*:\\s*([^;]+);`).exec(rule)
    const declaration = parsed.find((row) => row.property === property)
    if (!match || !declaration) throw new Error(`button: missing ${property} consumer`)
    const fallback = match[1].trim()
    const valueStart = start + match.index + match[0].indexOf(fallback)
    result.push({
      part: 'button',
      state: 'rest',
      path,
      token: `--warp-button-${path}`,
      selector,
      atRules: ['@layer warp.components'],
      source: componentsPath,
      property,
      fallback,
      fallbackSpan: [valueStart, valueStart + fallback.length],
      domain,
      units,
      inputs: declaration.reads.map((token) => ({
        token,
        classification: token.startsWith('--_') ? 'local channel' : 'system or legacy tone input',
      })),
      classification: 'partial binding',
      reason: 'Other Button paint sites and local-channel assignments remain unresolved.',
    })
  }
  const localDefaults = {
    '--_fill': 'var(--_solid)',
    '--_ink': 'var(--_ink-on)',
    '--_edge': 'transparent',
    '--_layer': 'var(--_solid-hover)',
    '--_layer-a': '1',
  }
  for (const [property, fallback] of Object.entries(localDefaults)) {
    const match = new RegExp(`${property}:\\s*([^;]+);`).exec(rule)
    if (!match || match[1].trim() !== fallback) throw new Error(`button: changed ${property}`)
    const valueStart = start + match.index + match[0].indexOf(fallback)
    const read = parsed.find((row) => row.property === property)
    result.push({
      part: 'button',
      state: 'rest',
      selector,
      atRules: ['@layer warp.components'],
      source: componentsPath,
      property,
      fallback,
      fallbackSpan: [valueStart, valueStart + fallback.length],
      inputs: (read?.reads ?? []).map((token) => ({ token, classification: 'local channel' })),
      classification: 'partial channel dependency',
      reason: 'The default channel assignment is replaced by Button variant selectors.',
    })
  }
  result.push(...sharedToneChannels(text))
  return result
}

function sharedToneChannels(text) {
  const result = []
  const channels = ['solid', 'solid-hover', 'ink-on', 'soft', 'text', 'border']
  for (const tone of ['accent', 'neutral', 'positive', 'caution', 'critical', 'info']) {
    const toneSelector =
      tone === 'accent' ? ':where([data-scope])' : `:where([data-tone="${tone}"])`
    const pos = text.indexOf(`${toneSelector} {`)
    if (pos < 0) throw new Error(`button: missing ${tone} channel`)
    const block = text.slice(pos, text.indexOf('}', pos) + 1)
    const channelReads = consumers(componentsPath, block)
    for (const channel of channels) {
      const name = `--_${channel}`
      const declaration = channelReads.find((row) => row.property === name)
      const match = new RegExp(`${name}:\\s*(var\\(--warp-[\\w-]+\\))`).exec(block)
      if (
        !match ||
        !declaration ||
        declaration.reads.length !== 1 ||
        match[1] !== `var(${declaration.reads[0]})`
      )
        throw new Error(`button: missing ${tone} ${name}`)
      const valueStart = pos + match.index + match[0].indexOf(match[1])
      result.push({
        part: 'button',
        selector: toneSelector,
        atRules: ['@layer warp.components'],
        source: componentsPath,
        property: name,
        fallback: match[1],
        fallbackSpan: [valueStart, valueStart + match[1].length],
        inputs: [{ token: declaration.reads[0], classification: 'system input' }],
        classification: 'shared channel dependency',
        reason: 'Shared tone input; Button can replace it in its own selectors.',
      })
    }
  }
  return result
}
