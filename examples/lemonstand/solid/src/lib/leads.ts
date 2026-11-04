/**
 * Labels the forms and the mail share with the validation in `~/server/lead-input`. No zod here:
 * this file reaches the browser, and the schemas don't need to.
 */
export const ROLES = [
  { value: 'parent', label: 'Parent or guardian' },
  { value: 'student', label: 'Young entrepreneur (13+)' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'librarian', label: 'Librarian' },
  { value: 'school_admin', label: 'School leader' },
  { value: 'district', label: 'District staff' },
  { value: 'nonprofit', label: 'Nonprofit or youth program' },
  { value: 'funder', label: 'Funder or sponsor' },
  { value: 'other', label: 'Something else' },
] as const

export const INTERESTS = [
  { value: 'library_class', label: 'A class at my library' },
  { value: 'after_school', label: 'After-school or summer camp' },
  { value: 'classroom', label: 'In-school curriculum' },
  { value: 'district', label: 'District-wide rollout' },
  { value: 'nonprofit', label: 'Nonprofit partnership' },
  { value: 'sponsor', label: 'Sponsoring seats' },
  { value: 'homeschool', label: 'Homeschool group' },
  { value: 'other', label: 'Something else' },
] as const

export const LEARNER_COUNTS = [
  { value: '1-25', label: 'Up to 25' },
  { value: '26-100', label: '26 to 100' },
  { value: '101-500', label: '101 to 500' },
  { value: '501-5000', label: '501 to 5,000' },
  { value: '5000+', label: 'More than 5,000' },
  { value: 'unsure', label: 'Not sure yet' },
] as const

export type Role = (typeof ROLES)[number]['value']
export type Interest = (typeof INTERESTS)[number]['value']
export type LearnerCount = (typeof LEARNER_COUNTS)[number]['value']
