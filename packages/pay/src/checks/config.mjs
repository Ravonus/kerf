/** Check config and test files for exposed credentials. */
export function configChecks(ctx, out, secrets, spanOf, isTest, SECRET_OPTION) {
  for (const rel of ctx.files.filter((r) => r.startsWith('weft.config.'))) {
    const text = ctx.read(rel)
    secrets(rel, text, true, out)
    const m = SECRET_OPTION.exec(text)
    if (m)
      out.push({
        code: 'PAY003',
        ...spanOf(rel, m.index, m[0].length),
        why: 'Plugin options are written into `.weft/slots/`, so a key given here sits in a generated file.',
      })
  }

  for (const rel of ctx.files.filter(isTest)) {
    const text = ctx.read(rel)
    for (const m of text.matchAll(/\b(?:sk|rk)_live_\w+/g))
      out.push({
        code: 'PAY031',
        ...spanOf(rel, m.index, m[0].length),
        why: 'A live key in a test: it charges real cards, and it is now in git.',
      })
  }
}
