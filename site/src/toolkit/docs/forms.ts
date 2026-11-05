import type { DocGroup } from '../types.ts'
import { formsInput } from './forms/input.ts'
import { formsSelection } from './forms/selection.ts'
import { formsChoices } from './forms/choices.ts'
import { formsFields } from './forms/fields.ts'

export const forms: DocGroup = {
  file: 'forms',
  title: 'Forms',
  intro: 'Ways to ask people for something. Give each one a name and it posts with a plain form.',
  docs: [...formsInput, ...formsSelection, ...formsChoices, ...formsFields],
}
