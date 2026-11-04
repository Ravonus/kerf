// An inverted index with tf-idf ranking, in TypeScript. crates/search does the same over the same corpus, so the two
// answers can be compared byte for byte.
import corpus from './corpus.json'

export interface Doc {
  id: string
  title: string
  body: string
}

const docs: Doc[] = []
const postings = new Map<string, [doc: number, count: number][]>()
const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

export function index(doc: Doc) {
  const at = docs.push(doc) - 1
  const counts = new Map<string, number>()
  for (const w of words(`${doc.title} ${doc.body}`)) counts.set(w, (counts.get(w) ?? 0) + 1)
  for (const [w, n] of counts) {
    const list = postings.get(w)
    if (list) list.push([at, n])
    else postings.set(w, [[at, n]])
  }
  return { id: doc.id }
}

for (const d of corpus as Doc[]) index(d)

export const all = () => docs

export function rank(q: string, limit: number) {
  const scores = new Map<number, number>()
  for (const w of new Set(words(q))) {
    const list = postings.get(w)
    if (!list) continue
    const idf = Math.log(1 + docs.length / list.length)
    for (const [d, n] of list) scores.set(d, (scores.get(d) ?? 0) + n * idf)
  }
  return [...scores]
    .sort((a, b) => b[1] - a[1] || (docs[a[0]].id < docs[b[0]].id ? -1 : 1))
    .slice(0, limit)
    .map(([d, s]) => ({ id: docs[d].id, title: docs[d].title, score: Math.round(s * 1e6) / 1e6 }))
}
