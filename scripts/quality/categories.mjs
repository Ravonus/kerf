// The order is the roadmap's first-match precedence, including overlaps.
/** Ordered category patterns and limits. */
export const categories = [
  { name: 'util', pattern: /(?:^|\/)(?:utils|lib)\//, file: 150, function: 40, params: 3 },
  {
    name: 'hook',
    pattern: /(?:^|\/)(?:use-[^/]+|[^/]+-state)\.ts$/,
    file: 200,
    function: 60,
    params: 3,
  },
  { name: 'component', pattern: /(?:^|\/)src\/.*\.tsx$/, file: 400, function: 80, params: 3 },
  {
    name: 'module',
    pattern: /(?:^|\/)src\/.*\.(?:ts|tsx|js|jsx|mjs|cjs)$/,
    file: 400,
    function: 80,
    params: 4,
  },
  {
    name: 'script',
    pattern: /(?:^|\/)(?:scripts|bin)\/|(?:^|\/)[^/]*config(?:\.[^/]+)+$/,
    file: 400,
    function: 80,
    params: 4,
  },
  { name: 'test', pattern: /(?:^|\/)test\/|\.(?:test|e2e)\./, file: 750, function: 120, params: 4 },
  {
    name: 'types',
    pattern: /(?:\.d\.(?:ts|mts)|(?:^|\/)types\.ts)$|(?:^|\/)types\//,
    file: 1000,
    function: null,
    params: null,
  },
  {
    name: 'table',
    pattern:
      /(?:^|\/)(?:generated|__generated__)\/|(?:^|\/)tokens?[^/]*\.css$|^crates\/.*\/tests\//,
    file: 1000,
    function: null,
    params: null,
  },
  { name: 'rust', pattern: /^crates\/.*\/src\/.*\.rs$/, file: 400, function: 80, params: 5 },
]

/** Identify generated paths and explicit generated file headers. */
export function isGenerated(path, content = '') {
  return (
    /(?:^|\/)(?:generated|__generated__)\//.test(path) ||
    /(?:^|\/)[^/]+\.(?:gen|generated)\.[^/]+$/.test(path) ||
    /^(?:\s*\/\/|\s*\/\*|\s*#)\s*(?:this file is automatically @generated|@generated|generated (?:by|from)\b)/i.test(
      content,
    )
  )
}

/** Return the first matching category, or undefined for an unclassified path. */
export function classify(path, { content = '' } = {}) {
  return categories.find(
    ({ name, pattern }) => pattern.test(path) || (name === 'table' && isGenerated(path, content)),
  )
}
