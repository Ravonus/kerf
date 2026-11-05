import type { Doc } from '../types.ts'

export const conversationDocs: Doc[] = [
  {
    component: 'Conversation',
    summary: 'The scrolling chat: turns, an optional title bar, and the prompt pinned below.',
    use: {
      when: [
        'A full chat with an assistant',
        'Anywhere turns keep arriving and the view should follow them',
      ],
    },
    tile: 'ConversationTile',
    tileStage: 'fill',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'ConversationDeployHelp',
            title: 'Deploy help',
            note: 'Send a message or press a chip: the assistant checks the target, then waits for your approval. The run is scripted.',
            stage: 'fill',
            height: 620,
          },
          {
            id: 'ConversationStarters',
            title: 'Empty chat',
            note: 'Starter cards until the first message.',
            stage: 'fill',
            height: 440,
          },
        ],
      },
    ],
    keyboard: [['Tab', 'Moves into the messages, then the prompt']],
    a11yNotes: [
      'The log is `role="log"` with live updates off: each answer announces its own end, never each word.',
      'It follows new messages only while you are near the bottom. Otherwise Jump to latest appears.',
    ],
    propDocs: {
      title: 'Shown in the top bar.',
      bar: 'Actions at the end of the top bar.',
      prompt: 'The composer, pinned below the log.',
      label: 'The accessible name.',
    },
    related: ['Prompt', 'Assistant', 'UserMessage'],
  },
  {
    component: 'Assistant',
    summary: 'One answer from the assistant, drawn from its stream of events.',
    use: {
      when: [
        'Anything the assistant says: text, reasoning, tool calls, questions and sources in one turn',
      ],
    },
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'AssistantAnswer',
            title: 'Finished answer',
            note: 'Open the tool calls and the reasoning. Hover a number to preview its source.',
            stage: 'fill',
            height: 560,
          },
          {
            id: 'AssistantApproval',
            title: 'Waiting for approval',
            note: 'Approve or Deny carries on the run. You can edit the arguments first.',
            stage: 'fill',
            height: 460,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          { id: 'AssistantFailed', title: 'Failed', note: 'Retry runs it again.', stage: 'fill' },
          {
            id: 'AssistantStopped',
            title: 'Stopped',
            note: 'What arrived is kept.',
            stage: 'fill',
          },
          {
            id: 'AssistantWaiting',
            title: 'Waiting for the first word',
            note: 'An assistant `answer` with no content yet shows that a reply is on its way.',
            stage: 'fill',
          },
        ],
      },
    ],
    a11yNotes: [
      'The end of an answer is announced once. Set `quiet` on turns that were already there on load, so they take no focus.',
    ],
    propDocs: {
      answer: 'The answer so far: `foldAnswer(events)`, or the result of folding a stream.',
      n: 'The turn number, used in its accessible name.',
      arrive: 'Plays the entrance, for a turn that just started.',
      quiet: 'The turn was there on load: approvals take no focus and nothing is announced.',
      alwaysAllow: 'The label for the "always allow" box on an approval.',
    },
    related: ['ToolCall', 'Prose', 'Sources', 'MessageActions'],
  },
  {
    component: 'UserMessage',
    summary: "The person's own message, with copy and an optional edit in place.",
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'UserMessageEditable',
            title: 'Editable',
            note: 'Passing `onEdit` adds the pencil. Saving hands you the new text.',
            stage: 'fill',
          },
          {
            id: 'UserMessageLong',
            title: 'A long message',
            note: 'Use `text` to show a message from the person, which wraps over as many lines as it needs.',
            stage: 'fill',
          },
        ],
      },
    ],
    keyboard: [['Escape', 'Cancels an edit']],
    a11yNotes: ['Focus goes to the box when editing starts and back to the pencil when it ends.'],
    propDocs: {
      text: 'The message.',
      arrive: 'A message just sent: it enters with one sweep.',
      onEdit: 'Saving an edit. Usually starts a new branch.',
    },
    related: ['Assistant', 'BranchSwitcher'],
  },
  {
    component: 'BranchSwitcher',
    summary: 'Steps between the versions of an answer. It hides itself when there is only one.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [{ id: 'BranchSwitcherVersions', title: 'Regenerated answers', stage: 'narrow' }],
      },
    ],
    a11yNotes: ['Each change announces "Version 2 of 3".'],
    propDocs: {
      index: 'The version on show, counting from 0.',
      count: 'How many versions there are.',
      onChange: 'Called with the new index.',
    },
    related: ['MessageActions', 'Assistant'],
  },
  {
    component: 'MessageActions',
    summary: 'The row of small actions under an answer: copy, rate, regenerate, branch.',
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'MessageActionsFeedback',
            title: 'Every action',
            note: 'Each button appears only with its handler. The thumbs down asks why.',
            stage: 'narrow',
            height: 240,
          },
          {
            id: 'MessageActionsStopped',
            title: 'After a stop',
            note: '`stopped` says what happened to the answer.',
          },
        ],
      },
    ],
    propDocs: {
      reasons: 'What a thumbs down offers.',
      stopped: 'Shows that the answer was cut short.',
      branch: 'Adds the BranchSwitcher.',
    },
    related: ['BranchSwitcher', 'Assistant'],
  },
  {
    component: 'Prompt',
    summary: 'The box people type to the assistant in, with tools, commands and a model chip.',
    use: {
      when: ['The message box of any assistant'],
      instead: [{ name: 'Textarea', why: 'it is an ordinary form field' }],
    },
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'PromptComposer',
            title: 'Full composer',
            note: 'Try `/`, `@`, attaching a file and the model chip.',
            stage: 'fill',
            height: 240,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'PromptBusy',
            title: 'Busy',
            note: 'Send becomes Stop. What you send meanwhile goes to `onQueue`.',
            stage: 'fill',
          },
          {
            id: 'PromptBlocked',
            title: 'Blocked',
            note: '`blocked` says why Send is off, and the button stays focusable.',
            stage: 'fill',
          },
          {
            id: 'PromptUploading',
            title: 'Uploading a file',
            note: 'A file in `files` with a `progress` between 0 and 1 shows an upload still under way.',
            stage: 'fill',
          },
        ],
      },
    ],
    keyboard: [
      ['Enter', 'Sends'],
      ['Shift+Enter', 'Adds a line'],
      ['Escape', 'Stops a running answer'],
      ['/ or @', 'Opens commands or people'],
      ['Up and Down', 'Move through the open list'],
    ],
    a11yNotes: ['Send and Stop are one button, so focus never drops when a run starts or ends.'],
    propDocs: {
      tools: 'Which tool buttons show: `attach`, `slash`, `mic`, `web`.',
      busy: 'A run is going: Send becomes Stop.',
      blocked: 'Why sending is off.',
      models: 'Adds the model chip.',
      context: 'Adds the context meter.',
      compact: 'For a phone: fewer tools and the short model name.',
      control: 'Hands you `insert()` and `focus()`.',
      children: 'Shown above the box, usually Suggestions.',
    },
    related: ['ModelPicker', 'ContextMeter', 'Suggestions', 'SpeechInput'],
  },
  {
    component: 'ModelPicker',
    summary: 'A chip that opens a list of models, grouped by provider, with their cost and size.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'ModelPickerChoose',
            title: 'Choosing a model',
            note: 'It opens upwards, because it usually sits in the prompt.',
            height: 320,
          },
        ],
      },
    ],
    keyboard: [
      ['Up and Down', 'Move through the models'],
      ['Enter', 'Picks'],
      ['Escape', 'Closes and returns to the chip'],
    ],
    propDocs: {
      models: 'The models on offer.',
      value: "The model's id, or a state to bind.",
      compact: 'Shows the short name.',
    },
    related: ['Prompt', 'Popover'],
  },
  {
    component: 'Suggestions',
    summary: 'Ready-made prompts: cards on an empty chat, chips after a turn.',
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'SuggestionsStarters',
            title: 'Cards',
            note: 'For an empty chat.',
            stage: 'fill',
            height: 240,
          },
          {
            id: 'SuggestionsChips',
            title: 'Chips',
            note: 'For follow-ups, usually inside the Prompt.',
            stage: 'fill',
          },
        ],
      },
    ],
    propDocs: {
      items: 'Each has a `title` and an optional `description`.',
      variant: '`cards` or `chips`.',
      onPick: 'Pressing one. Usually sends it.',
    },
    related: ['Prompt', 'Conversation'],
  },
]
