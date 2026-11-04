// Tokenize Rust so braces in comments, strings and raw strings do not end a function.
import { fileLimit, lineCount } from './length-metrics.mjs'

export function rustTokens(text) {
  const tokens = []
  let i = 0
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i++
      continue
    }
    if (text.startsWith('//', i)) {
      i = text.indexOf('\n', i)
      if (i < 0) break
      continue
    }
    if (text.startsWith('/*', i)) {
      let depth = 1
      i += 2
      while (i < text.length && depth) {
        if (text.startsWith('/*', i)) {
          depth++
          i += 2
        } else if (text.startsWith('*/', i)) {
          depth--
          i += 2
        } else i++
      }
      continue
    }
    const start = i
    const raw = text.slice(i).match(/^(?:br|rb|r)(#*)"/)
    const char =
      text[i] === "'" &&
      text.slice(i).match(/^'(?:\\(?:u\{[\da-fA-F_]+\}|x[\da-fA-F]{2}|.)|[^'\\\r\n])'/)
    if (raw) {
      const end = text.indexOf(`"${raw[1]}`, i + raw[0].length)
      i = end < 0 ? text.length : end + raw[1].length + 1
    } else if (text[i] === '"' || (/[bc]/.test(text[i]) && text[i + 1] === '"')) {
      if (text[i] !== '"') i++
      i++
      while (i < text.length) {
        if (text[i] === '\\') i += 2
        else if (text[i++] === '"') break
      }
    } else if (char) {
      i += char[0].length
    } else {
      const word = text.slice(i).match(/^(?:r#)?[A-Za-z_][A-Za-z_0-9]*|^\d[\w.]*/)
      i += word ? word[0].length : 1
    }
    tokens.push({ value: text.slice(start, i), start, end: i })
  }
  return tokens
}

const size = (tokens) =>
  tokens.reduce((sum, token) => sum + (token.value === ';' ? 0 : token.value.length), 0)
const lineAt = (text, pos) => text.slice(0, pos).split('\n').length

/** Return file and named function offenders, with spans for matching Clippy diagnostics. */
export function rustFindings(path, text) {
  const tokens = rustTokens(text),
    findings = []
  const count = lineCount(text)
  if (count > fileLimit(path))
    findings.push({
      id: `file:${path}`,
      count,
      tokens: size(tokens),
      kind: 'file',
      start: 1,
      end: lineAt(text, text.length),
    })
  const names = new Map()
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].value !== 'fn' || !/^[A-Za-z_]\w*$/.test(tokens[i + 1]?.value ?? '')) continue
    const name = tokens[i + 1].value
    let parens = 0,
      brackets = 0,
      angles = 0,
      open = -1
    for (let j = i + 2; j < tokens.length; j++) {
      const t = tokens[j].value
      if (t === '(') parens++
      else if (t === ')') parens--
      else if (t === '[') brackets++
      else if (t === ']') brackets--
      else if (t === '<') angles++
      else if (t === '>' && angles) angles--
      if (!parens && !brackets && !angles && (t === '{' || t === ';')) {
        if (t === '{') open = j
        break
      }
    }
    if (open < 0) continue
    let depth = 1,
      close = open + 1
    while (close < tokens.length && depth) {
      if (tokens[close].value === '{') depth++
      else if (tokens[close].value === '}') depth--
      close++
    }
    if (depth) throw new Error(`unclosed Rust function ${path}:${name}`)
    const occurrence = (names.get(name) ?? 0) + 1
    names.set(name, occurrence)
    const start = tokens[i].start,
      end = tokens[close - 1].end
    const lines = lineCount(text.slice(start, end))
    if (lines > 80)
      findings.push({
        id: `function:${path}:${name}${occurrence === 1 ? '' : `#${occurrence}`}`,
        count: lines,
        tokens: size(tokens.slice(i, close)),
        kind: 'function',
        start: lineAt(text, start),
        end: lineAt(text, end),
      })
  }
  return findings
}
