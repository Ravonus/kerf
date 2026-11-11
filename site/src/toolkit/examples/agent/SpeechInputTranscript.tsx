import { SpeechInput } from '@kerf-js/veneer'
import { MICS, fakeEngine } from './shared'

export const SpeechInputTranscript = () => (
  <SpeechInput
    mics={MICS}
    engine={fakeEngine}
    initial={{
      final: 'Show me the failing',
      interim: 'check',
    }}
  />
)
