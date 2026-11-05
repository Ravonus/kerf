const ROUNDS = 5
const MAX_LITERALS = 8

const quote = (key) => (/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key))
const unique = (list) => [...new Set(list)]
const union = (list) => {
  const parts = unique(list.filter(Boolean))
  return parts.length
    ? parts.map((t) => (/=>/.test(t) && !/^\(.*\)$/.test(t) ? `(${t})` : t)).join(' | ')
    : null
}
const sameFile = (a, b) => a === b || a.toLowerCase() === b.toLowerCase()
const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1]

module.exports = { ROUNDS, MAX_LITERALS, quote, unique, union, sameFile, overlaps }
