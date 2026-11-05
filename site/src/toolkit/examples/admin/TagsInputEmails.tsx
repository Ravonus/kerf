import { state } from '@weft-js/core'
import { TagsInput } from '@weft-js/warp'

export function TagsInputEmails() {
  const emails = state(['dara@weft.dev', 'kai@weft'])
  return (
    <TagsInput
      label="Email addresses"
      hint="Press Enter or comma after each one."
      value={emails}
      valid={(tag) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tag)}
      error={
        emails.value.some((e) => !e.includes('.')) ? 'kai@weft is not a full address.' : undefined
      }
    />
  )
}
