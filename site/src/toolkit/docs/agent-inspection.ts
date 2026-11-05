import type { Doc } from '../types.ts'

export const inspectionDocs: Doc[] = [
  {
    component: 'TraceViewer',
    summary: 'Every step of a run on one timeline, with its time, tokens and cost.',
    use: { when: ['Debugging why an answer was slow or expensive'] },
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'TraceViewerRun',
            title: 'One answer',
            note: 'Move through the rows and the line above follows.',
            stage: 'fill',
            height: 300,
          },
        ],
      },
    ],
    keyboard: [
      ['Up and Down', 'Move between rows'],
      ['Right and Left', 'Open, close, and step in and out'],
      ['Enter', 'Opens or closes a row'],
      ['Home and End', 'First and last row'],
    ],
    a11yNotes: ['It is a treegrid with one tab stop.'],
    propDocs: {
      spans: 'The spans, nested through `children`.',
      label: 'The heading and accessible name.',
    },
    related: ['ToolCall', 'AgentPlan'],
  },
  {
    component: 'ArtifactPanel',
    summary: 'Something the assistant made, with its preview, its code and earlier versions.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'ArtifactPanelConfig',
            title: 'A config file',
            note: 'Pick an earlier version, then look at Code.',
            stage: 'fill',
            height: 280,
          },
        ],
      },
    ],
    keyboard: [
      ['Left and Right', 'Move between the tabs'],
      ['Up and Down', 'Move through the versions'],
    ],
    propDocs: {
      title: 'The name.',
      versions: 'Newest first. Each may have its own `code`.',
      version: 'The version on show, if you want to hold it yourself.',
      onVersion: 'A version was picked.',
      code: 'The code when versions have none.',
      onOpen: 'Adds an Open in editor button.',
      children: 'The preview.',
    },
    related: ['Conversation', 'CodeBlock'],
  },
  {
    component: 'SpeechInput',
    summary: 'Dictate a message: pick a microphone, speak, and insert what was heard.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'SpeechInputDictate',
            title: 'Dictating into the prompt',
            note: 'A fake `engine` stands in here, so the page never touches your microphone.',
            stage: 'fill',
            height: 460,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'SpeechInputTranscript',
            title: 'With words waiting',
            note: 'Grey words might still change.',
            stage: 'fill',
            height: 300,
          },
        ],
      },
    ],
    a11yNotes: [
      'Nothing is sent until Insert. A blocked microphone shows how to fix it instead of a dead button.',
    ],
    propDocs: {
      onInsert: "Gets the transcript, usually for the Prompt's `insert()`.",
      mics: 'The microphones on offer.',
      engine: "Replaces the browser's speech recognition.",
      initial: 'The state and words to start from.',
    },
    related: ['Prompt'],
  },
]
