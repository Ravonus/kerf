export function corpus(count) {
  const vocab = [
    'lantern',
    'compass',
    'harbor',
    'meadow',
    'granite',
    'willow',
    'ember',
    'thicket',
    'quartz',
    'falcon',
    'orchard',
    'tundra',
    'mosaic',
    'cinder',
    'estuary',
    'juniper',
    'kestrel',
    'lichen',
    'marrow',
    'nectar',
    'obsidian',
    'pumice',
    'quiver',
    'russet',
    'sable',
    'tallow',
    'umber',
    'vellum',
    'wicker',
    'yarrow',
  ]
  for (let i = 0; i < 3000; i++) vocab.push(`w${i.toString(36)}`)
  let seed = 42
  const next = (n) => (
    (seed = (seed * 1664525 + 1013904223) >>> 0),
    Math.floor((seed / 2 ** 32) * n)
  )
  // Skewed, as words are: most text is a few words.
  const word = () => vocab[Math.floor(vocab.length * (next(1000) / 1000) ** 3)]
  return Array.from({ length: count }, (_, i) => ({
    id: `doc-${i}`,
    title: `${word()} ${word()} ${word()}`,
    body: Array.from({ length: 80 }, word).join(' '),
  }))
}
