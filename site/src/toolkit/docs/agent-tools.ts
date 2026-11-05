import type { Doc } from '../types.ts'

export const toolDocs: Doc[] = [
  {
    component: 'ToolCall',
    summary: 'One action the assistant ran, or wants to run, with its input and result.',
    use: {
      when: ['Showing what the assistant did', 'Asking for approval before something changes'],
    },
    sections: [
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'ToolCallStates',
            title: 'Each state',
            note: 'Each one is a word and an icon as well as a colour. Open a row for its input and output.',
            stage: 'fill',
            height: 260,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'ToolCallApproval',
            title: 'Approval',
            note: 'Nothing runs until you approve. You can edit the arguments first and the diff shows your change.',
            stage: 'fill',
            height: 380,
          },
        ],
      },
    ],
    a11yNotes: [
      'An approval that arrives during a run takes focus and is announced straight away. Pass `quiet` for one that was there on load.',
      'Focus moves to the row after Approve or Deny.',
    ],
    propDocs: {
      call: 'The call: name, arguments, state and output.',
      alwaysAllow: 'Adds a tick box, scoped to this tool and resource.',
      quiet: 'The call was there on load.',
    },
    related: ['Assistant', 'AgentPlan', 'TraceViewer'],
  },
  {
    component: 'AgentPlan',
    summary: 'The steps of a run and how far along it is, with the messages waiting behind it.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'AgentPlanRollback',
            title: 'A rollback in progress',
            note: 'Finish a step or remove a queued message.',
            stage: 'narrow',
            height: 420,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'AgentPlanBlocked',
            title: 'Blocked',
            note: 'A blocked step is waiting for you.',
            stage: 'narrow',
            height: 300,
          },
        ],
      },
    ],
    propDocs: {
      steps: 'Each step is `pending`, `running`, `done` or `blocked`.',
      queue: 'Messages sent during the run.',
      onRemoveQueued: 'Removing a queued message.',
    },
    related: ['ToolCall', 'Prompt'],
  },
  {
    component: 'Reasoning',
    summary: "The assistant's thinking, folded away once it is done.",
    sections: [
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'ReasoningThinking',
            title: 'Thinking',
            note: 'Open while `streaming`.',
            stage: 'fill',
          },
          {
            id: 'ReasoningFinished',
            title: 'Finished',
            note: 'Folded, with how long it took.',
            stage: 'fill',
          },
        ],
      },
    ],
    propDocs: {
      text: 'The thinking.',
      streaming: 'It is still arriving.',
      seconds: 'How long it took.',
    },
    related: ['Assistant', 'Shimmer'],
  },
  {
    component: 'Question',
    summary: 'The run stops and asks you to choose before it carries on.',
    use: {
      when: ['The assistant needs a decision, not just a yes'],
      instead: [{ name: 'ToolCall', why: 'it only needs approval' }],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'QuestionPickScope',
            title: 'One answer',
            note: '`free` adds Something else. Continue reads the choice back.',
            stage: 'narrow',
            height: 280,
          },
          {
            id: 'QuestionManyAnswers',
            title: 'Several answers',
            note: 'A question with `multiple` set lets people pick more than one of its `options`.',
            stage: 'narrow',
            height: 260,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'QuestionClosed',
            title: 'Closed',
            note: 'The run stopped before anyone answered.',
            stage: 'narrow',
            height: 240,
          },
        ],
      },
    ],
    a11yNotes: [
      'It is a real fieldset with the question as its legend.',
      'A new question is announced straight away unless `quiet`.',
    ],
    propDocs: {
      question: 'The prompt, options, and `multiple`, `free`, `answer` and `closed`.',
      onAnswer: 'Continue was pressed.',
      quiet: 'It was there on load.',
    },
    related: ['ToolCall', 'Assistant'],
  },
  {
    component: 'Cite',
    summary: 'A numbered link to a source, with a preview on hover and focus.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'CiteInline',
            title: 'In a sentence',
            note: 'Pressing a number jumps to its source card. In an answer, `[1]` in the text does this for you.',
            stage: 'fill',
            height: 200,
          },
        ],
      },
    ],
    a11yNotes: [
      'Each is a link named "Source 1". The preview comes next in the tab order, so its link can be reached.',
    ],
    propDocs: {
      n: 'The number.',
      source: 'What the preview shows.',
      href: 'The `id` of the source card.',
    },
    related: ['Sources', 'Prose'],
  },
  {
    component: 'Sources',
    summary: 'Numbered cards for what an answer drew on.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [{ id: 'SourcesDeploy', title: 'Sources for an answer', stage: 'fill' }],
      },
    ],
    propDocs: {
      items: 'The sources, in the same order as their numbers.',
      base: "Joins the cards to their Cite links: a card's id is `{base}-s1`.",
    },
    related: ['Cite', 'Assistant'],
  },
  {
    component: 'Prose',
    summary: 'Answer text: paragraphs, lists, code and citations, and never any raw markup.',
    use: {
      when: ['Showing model output safely'],
      instead: [{ name: 'Markdown', why: 'you want full Markdown' }],
    },
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [{ id: 'ProseAnswer', title: 'A short report', stage: 'fill', height: 260 }],
      },
    ],
    a11yNotes: ['A code block can be reached with Tab, so it scrolls from the keyboard.'],
    propDocs: {
      text: 'The text. It can still be arriving: an open code fence draws as code.',
      sources: 'What `[1]` points at.',
      base: 'Joins citations to their Sources.',
    },
    related: ['Assistant', 'Cite', 'Markdown'],
  },
  {
    component: 'Checkpoint',
    summary: 'A line in the chat that marks a safe point to go back to.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'CheckpointRestore',
            title: 'Before an edit',
            note: 'What Restore does is yours to decide.',
            stage: 'narrow',
            height: 220,
          },
        ],
      },
    ],
    propDocs: { label: 'What this point is.', onRestore: 'Adds Restore.' },
    related: ['BranchSwitcher', 'Conversation'],
  },
  {
    component: 'Shimmer',
    summary: 'A light passing over text, to show that something is under way.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [{ id: 'ShimmerLoading', title: 'Work in progress' }],
      },
    ],
    a11yNotes: ['It stays still for people who prefer reduced motion.'],
    related: ['Reasoning', 'Skeleton'],
  },
  {
    component: 'ContextMeter',
    summary: "How much of the model's memory the chat has used.",
    sections: [
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'ContextMeterLevels',
            title: 'Levels',
            note: 'It turns to caution at 80% and critical at 95%. Hover for what fills it.',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'ContextMeterCompact',
            title: 'Freeing up room',
            note: 'Near the limit, `onCompact` offers /compact.',
          },
        ],
      },
    ],
    a11yNotes: ['It is a `meter` that can take focus, so keyboard users get the tooltip too.'],
    propDocs: {
      used: 'Tokens used.',
      limit: 'Tokens available.',
      parts: 'What fills it, for the tooltip.',
      showTokens: 'Adds the count beside the percent.',
      onCompact: 'Offers /compact when it is getting full.',
    },
    related: ['Prompt'],
  },
]
