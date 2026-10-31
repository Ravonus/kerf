// The long list: one screen in every stack, 10,000 rows of wrapped text at unknown heights. Same words, same box.
const WORDS = 'amber basalt cedar dune ember fjord grove heath inlet jade kelp loam marsh nectar opal pine quartz reed sage tundra umber vale willow xenon yarrow zephyr wrote about the long way home before morning and then again'.split(' ')
const mix = (i: number, k: number) => ((i + 1) * 2654435761 + k * 40503) >>> 7
export const feed = Array.from({ length: Number(new URLSearchParams(location.search).get('n') ?? 10000) }, (_, i) => ({
  id: i,
  text: Array.from({ length: 3 + mix(i, 1) % 60 }, (_, k) => WORDS[mix(i, k + 2) % WORDS.length]).join(' '),
}))
