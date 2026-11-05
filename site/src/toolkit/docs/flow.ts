import type { DocGroup } from '../types.ts'
import { flowAuth } from './flow/auth.ts'
import { flowAccess } from './flow/access.ts'
import { flowGuidance } from './flow/guidance.ts'

export const flow: DocGroup = {
  file: 'flow',
  title: 'Sign-in and onboarding',
  intro: 'Sign-in, onboarding and other step-by-step journeys.',
  pack: true,
  docs: [...flowAuth, ...flowAccess, ...flowGuidance],
}
