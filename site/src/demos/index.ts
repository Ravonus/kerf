import { examples } from './catalog-examples'
import { learn } from './catalog-learn'

/** `learn`: shown only in Learn (src/components/LearnDemo.tsx), not on the examples page. */
export type Demo = {
  title: string
  look: string
  tryIt: string
  why: string
  page?: string
  learn?: true
}

/** Every live example, with the words that say what it is. The landing, the examples page and the docs read this. */
export const demos: Record<string, Demo> = {
  ...examples,
  ...learn,
}
