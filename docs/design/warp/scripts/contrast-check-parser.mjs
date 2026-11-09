// Parse the colour expressions understood by the contrast checker.
import { splitTop, toLab, fromLab, fromSrgb } from './contrast-check-colors.mjs'

const num = (expr) => {
  const e = expr
    .replace(/calc\(/g, '(')
    .replace(/\b(min|max)\(/g, 'Math.$1(')
    .trim()
  if (!/^(?:[\d.\s+\-*/(),e%]|Math\.min|Math\.max)+$/.test(e))
    throw new Error('not numeric: ' + expr)
  if (e.endsWith('%')) return Number(e.slice(0, -1)) / 100
  // oxlint-disable-next-line no-new-func, typescript/no-implied-eval -- the existing checker evaluates a restricted numeric grammar.
  return Function(`"use strict";return (${e});`)()
}

function splitColorArgs(value, separator) {
  const result = []
  let depth = 0,
    start = 0
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++
    else if (value[i] === ')' && --depth < 0) throw new Error('unbalanced colour: ' + value)
    else if (value[i] === separator && depth === 0) {
      result.push(value.slice(start, i).trim())
      start = i + 1
    }
  }
  if (depth !== 0) throw new Error('unbalanced colour: ' + value)
  result.push(value.slice(start).trim())
  if (result.some((part) => !part)) throw new Error('empty colour component: ' + value)
  return result
}

export function parseColor(str) {
  const s = str.trim()
  let m
  if ((m = s.match(/^color-mix\(\s*in\s+oklab\s*,([\s\S]*)\)$/))) {
    const parts = splitColorArgs(m[1], ',')
    if (parts.length !== 2) throw new Error('color-mix needs two colours: ' + s)
    const [a, b] = parts
    const pct = (x) => {
      const k = x.match(/\s([\d.]+)%$/)
      return k ? [x.slice(0, k.index).trim(), Number(k[1]) / 100] : [x, null]
    }
    const [ca, firstWeight] = pct(a),
      [cb, secondWeight] = pct(b)
    let pa = firstWeight,
      pb = secondWeight
    if (pa === null && pb === null) pa = pb = 0.5
    else if (pa === null) pa = 1 - pb
    else if (pb === null) pb = 1 - pa
    const A = parseColor(ca),
      B = parseColor(cb)
    if (A.lin || B.lin) throw new Error('color-mix needs oklch operands: ' + s)
    if (A.alpha !== 1 || B.alpha !== 1 || pa < 0 || pb < 0 || pa > 1 || pb > 1 || pa + pb < 1)
      throw new Error('unsupported transparent color-mix: ' + s)
    const la = toLab(A),
      lb = toLab(B),
      t = pa + pb
    const mixed = fromLab(la.map((v, i) => (v * pa + lb[i] * pb) / t))
    return { ...mixed, alpha: 1 }
  }
  if ((m = s.match(/^oklch\(([\s\S]*)\)$/))) {
    const segments = splitColorArgs(m[1], '/')
    if (segments.length > 2) throw new Error('invalid oklch alpha: ' + s)
    const [main, alpha] = segments
    const components = splitTop(main.trim().replace(/\s+/g, ' '), ' ').filter(Boolean)
    if (components.length !== 3) throw new Error('oklch needs three components: ' + s)
    const [L, C, H] = components.map(num)
    return { L, C, H, alpha: alpha === undefined ? 1 : num(alpha) }
  }
  if ((m = s.match(/^#([0-9a-f]{6})$/i))) {
    const n = parseInt(m[1], 16)
    return fromSrgb([(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255])
  }
  throw new Error('unsupported colour: ' + s)
}
