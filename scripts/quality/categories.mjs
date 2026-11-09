// First-match limits for source categories.
const rows = [
  ['util', /(?:^|\/)(?:utils|lib)\//, 150, 40, 3],
  ['hook', /(?:^|\/)(?:use-[^/]+|[^/]+-state)\.ts$/, 200, 60, 3],
  ['component', /(?:^|\/)src\/.*\.tsx$/, 400, 80, 3],
  ['module', /(?:^|\/)src\/.*\.(?:ts|tsx|js|mjs|cjs)$/, 400, 80, 4],
  ['script', /(?:^|\/)(?:scripts|bin)\/|(?:^|\/)[^/]*config\.[^/]+$/, 400, 80, 4],
  ['test', /(?:^|\/)test\/|\.(?:test|e2e)\./, 750, 120, 4],
  ['types', /(?:\.d\.(?:ts|mts)|(?:^|\/)types\.ts)$|(?:^|\/)types\//, 1000, null, null],
  ['table', /(?:^|\/)(?:generated|__generated__)\/|(?:^|\/)tokens?[^/]*\.css$|^crates\/.*\/tests\//, 1000, null, null],
  ['rust', /^crates\/.*\/src\/.*\.rs$/, 400, 80, 5],
]

/** Ordered category patterns and limits. */
export const categories = rows.map(([name, pattern, file, fn, params]) => ({
  name, pattern, file, function: fn, params,
}))

/** Return the first matching category, or undefined for an unclassified path. */
export function classify(path) {
  return categories.find(({ pattern }) => pattern.test(path))
}
