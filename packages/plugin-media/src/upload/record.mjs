export function createRecord(url) {
  return (hash, rungs, types) =>
    [...new Set(rungs.map((r) => r[1]))].map((format) => ({
      type: types[format],
      srcset: rungs
        .filter((r) => r[1] === format)
        .map(([w]) => `${url(hash, w, format)} ${w || 1}w`)
        .join(', '),
    }))
}
