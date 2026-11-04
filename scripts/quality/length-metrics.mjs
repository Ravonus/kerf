// The higher file limit applies to tests and checked-in generated or third-party code.
export const fileLimit = (path) =>
  /(?:^|\/)evals\/results\/|^packages\/core\/node\/(?:css|matrix|vocab)\.mjs$|(?:^|\/)(?:tests?|__tests__|fixtures?|generated|gen|vendor|vendored)(?:\/|$)|(?:[._-](?:test|spec|generated|gen)|(?:^|\/)test[_-][^/]*)\.[cm]?[jt]sx?$|(?:^|\/)test[_-][^/]*\.rs$|_test\.rs$/.test(
    path,
  )
    ? 800
    : 400
export const lineCount = (text) =>
  text ? text.split(/\r?\n/).length - Number(text.endsWith('\n')) : 0
