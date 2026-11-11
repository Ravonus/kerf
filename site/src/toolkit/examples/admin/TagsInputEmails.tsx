import { state } from '@kerf/core'
import { TagsInput } from '@kerf/veneer'

export function TagsInputEmails() {
  const emails = state(['dara@kerf.dev', 'kai@kerf'])
  return (
    <TagsInput
      label="Email addresses"
      hint="Press Enter or comma after each one."
      value={emails}
      valid={(tag) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tag)
      }
      error={
        emails.value.some((e) => !e.includes('.'))
          ? 'kai@kerf is not a full address.'
          : undefined
      }
    />
  )
}
