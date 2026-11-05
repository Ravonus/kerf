export function resolver(testFiles, cases) {
  const resolveCases = (res) => {
    // Static names map 1:1; results nobody claimed belong to the file's dynamic (`.each`) cases.
    const out = new Map()
    for (const f of testFiles) {
      const mine = cases.filter((c) => c.file === f)
      const keys = [...res.tests.keys()].filter((k) => k.startsWith(`${f}::`))
      for (const c of mine.filter((x) => !x.dynamic))
        out.set(
          `${f}::${c.name}`,
          res.loadErrors.has(f)
            ? { status: 'failed', message: res.loadErrors.get(f), load: true }
            : (res.tests.get(`${f}::${c.name}`) ?? { status: 'missing' }),
        )
      if (mine.some((c) => c.dynamic))
        for (const k of keys) if (!out.has(k)) out.set(k, res.tests.get(k))
    }
    return out
  }

  return resolveCases
}
