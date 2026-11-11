import { Prompt } from '@kerf-js/veneer'

export const PromptUploading = () => (
  <Prompt
    value="What does this log say?"
    tools={['attach']}
    files={[
      {
        id: 'log',
        name: 'd-4819-build.log',
        progress: 0.6,
      },
    ]}
  />
)
