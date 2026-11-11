export interface Row {
  id: number
  label: string
}

const adjectives = [
  'pretty',
  'large',
  'big',
  'small',
  'tall',
  'short',
  'long',
  'handsome',
  'plain',
  'quaint',
  'clean',
  'elegant',
  'easy',
  'angry',
  'crazy',
  'helpful',
  'mushy',
  'odd',
  'unsightly',
  'adorable',
  'important',
  'inexpensive',
  'cheap',
  'expensive',
  'fancy',
]
const colours = [
  'red',
  'yellow',
  'blue',
  'green',
  'pink',
  'brown',
  'purple',
  'brown',
  'white',
  'black',
  'orange',
]
const nouns = [
  'table',
  'chair',
  'house',
  'bbq',
  'desk',
  'car',
  'pony',
  'cookie',
  'sandwich',
  'burger',
  'pizza',
  'mouse',
  'keyboard',
]
let nextId = 1

function pick(words: string[]): string {
  return words[Math.floor(Math.random() * words.length)]!
}

export function makeRows(count: number): Row[] {
  return Array.from({ length: count }, () => ({
    id: nextId++,
    label: `${pick(adjectives)} ${pick(colours)} ${pick(nouns)}`,
  }))
}
