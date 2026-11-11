import { Prompt, SpeechInput, Stack } from '@kerf/veneer'
import type { PromptControl } from '@kerf/veneer'
import { MICS, fakeEngine } from './shared'

export function SpeechInputDictate() {
  let prompt: PromptControl | undefined
  return (
    <Stack gap="group">
      <SpeechInput
        mics={MICS}
        engine={fakeEngine}
        onInsert={(text) => prompt?.insert(text)}
      />
      <Prompt
        tools={[]}
        control={(c) => (prompt = c)}
        placeholder="Your dictation lands here"
      />
    </Stack>
  )
}
