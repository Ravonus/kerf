// Lower only explicitly named theme wrappers, preserving every byte of their fallbacks.
export function lowerTheme(css, names) {
  const allowed = new Set(names)
  function lower(start, end) {
    let result = ''
    for (let i = start; i < end;) {
      if (css.startsWith('/*', i)) {
        const close = css.indexOf('*/', i + 2)
        if (close < 0 || close + 2 > end) throw new Error('Unclosed CSS comment')
        result += css.slice(i, close + 2)
        i = close + 2
      } else if (css[i] === '"' || css[i] === "'") {
        const quote = css[i]
        let j = i + 1
        while (j < end && css[j] !== quote) j += css[j] === '\\' ? 2 : 1
        if (j >= end) throw new Error('Unclosed CSS string')
        result += css.slice(i, j + 1)
        i = j + 1
      } else if (css.startsWith('var(', i) && (i === 0 || !/[\w-]/.test(css[i - 1]))) {
        const call = parseCall(i, end)
        if (allowed.has(call.name)) {
          if (call.comma < 0 || !css.slice(call.comma + 1, call.end).trim())
            throw new Error(`Missing fallback for ${call.name}`)
          result += lower(call.comma + 1, call.end)
        } else result += css.slice(i, i + 4) + lower(i + 4, call.end) + ')'
        i = call.end + 1
      } else result += css[i++]
    }
    return result
  }
  function parseCall(start, end) {
    let depth = 1,
      comma = -1,
      quote = '',
      comment = false
    for (let i = start + 4; i < end; i++) {
      if (comment) {
        if (css.startsWith('*/', i)) {
          comment = false
          i++
        }
      } else if (quote) {
        if (css[i] === '\\') i++
        else if (css[i] === quote) quote = ''
      } else if (css.startsWith('/*', i)) {
        comment = true
        i++
      } else if (css[i] === '"' || css[i] === "'") quote = css[i]
      else if (css[i] === '(') depth++
      else if (css[i] === ')') {
        if (--depth === 0)
          return { name: css.slice(start + 4, comma < 0 ? i : comma).trim(), comma, end: i }
      } else if (css[i] === ',' && depth === 1 && comma < 0) comma = i
    }
    throw new Error('Unclosed CSS var()')
  }
  return lower(0, css.length)
}
