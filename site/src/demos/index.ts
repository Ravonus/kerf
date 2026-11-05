import { examples } from './catalog-examples'
import { learn } from './catalog-learn'

/** `learn`: shown only in LearnDemo.tsx, not on the
 * examples page. */
export type Demo = {
  title: string
  look: string
  tryIt: string
  why: string
  page?: string
  learn?: true
}

/** Every live example and its description. The landing,
 * examples page and docs read this. */
export const demos: Record<string, Demo> = {
  ...examples,
  ...learn,
}
