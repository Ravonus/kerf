import type { DocGroup } from '../../types.ts'

export const analysis: DocGroup['docs'] = [
  {
    component: 'PivotTable',
    summary: 'Sums rows across two dimensions, with shaded cells and totals both ways.',
    use: {
      when: [
        'Comparing a number across two categories',
        'Spotting where the cost or the traffic really sits',
      ],
      instead: [
        { name: 'HeatGrid', why: 'the picture matters more than the values' },
        { name: 'DataGrid', why: 'people need the rows themselves' },
      ],
    },
    playground: {
      example: 'PivotTablePlay',
      code: '<PivotTable caption="Projects by region and status" rows={projects} row={p => p.region} column={p => p.status} measures={measures}{props} />',
      knobs: [
        {
          prop: 'rowHeader',
          control: 'text',
          label: 'Row header',
          initial: 'Region',
          default: '',
        },
      ],
      stage: 'fill',
      height: 400,
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'PivotTableRegions',
            title: 'Several measures',
            note: 'With more than one measure a switch appears. The shading follows it.',
            stage: 'fill',
            height: 400,
          },
          {
            id: 'PivotTableQuarters',
            title: 'One measure',
            note: 'One measure, no switch. `format` draws the values.',
            stage: 'fill',
            height: 340,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'PivotTableTeams',
            title: 'People by team and role',
            note: 'Use `row` and `column` to say what to group by, and `measures` for the figure in each cell.',
            stage: 'fill',
            height: 300,
          },
        ],
      },
    ],
    a11yNotes: [
      'It is a real table with row and column headers, and the shading only repeats what the numbers say.',
      'The scroll area is focusable, so it can be scrolled by keyboard on a phone.',
    ],
    propDocs: {
      row: 'Which row an item counts towards.',
      column: 'Which column an item counts towards.',
      rowHeader: 'The label above the first column.',
      measures: 'What to sum: `id`, `label`, `value`, and an optional `format`.',
    },
    related: ['DataGrid', 'Table', 'HeatGrid'],
  },
  {
    component: 'Kanban',
    summary: 'A board of cards in columns, moved by dragging, by keyboard or from a menu.',
    use: {
      when: ['Work that moves through stages', 'Seeing at a glance where things are stuck'],
      instead: [
        { name: 'Table', why: 'people sort and filter rather than move' },
        { name: 'Checklist', why: 'there is only done and not done' },
      ],
    },
    playground: {
      example: 'KanbanPlay',
      code: '<Kanban label="Release board" columns={columns}{props} />',
      knobs: [
        {
          prop: 'height',
          control: 'segmented',
          options: ['360px', '460px', '560px'],
          initial: '460px',
          default: '560px',
        },
      ],
      stage: 'fill',
      height: 524,
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'KanbanBoard',
            title: 'A board',
            note: 'Drag a card to another column or another place in its own. Or focus it and press Alt with an arrow.',
            stage: 'fill',
            height: 524,
          },
          {
            id: 'KanbanMoves',
            title: 'Saving a move',
            note: '`onMove` gives you the card, the column and the place, to send to your server.',
            stage: 'fill',
            height: 520,
          },
          {
            id: 'KanbanAdd',
            title: 'Adding cards',
            note: '`onAdd` shows Add card. You add it to your state, so the id is yours.',
            stage: 'fill',
            height: 504,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'KanbanLimit',
            title: 'Over its limit',
            note: '`limit` on a column shows the count against it, and warns when it goes over.',
            stage: 'fill',
            height: 424,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'KanbanLong',
            title: '2,000 cards a column',
            note: 'Each column is a window on its cards, so a long one costs what a short one does.',
            stage: 'fill',
            height: 484,
          },
        ],
      },
    ],
    keyboard: [
      ['Alt + arrows', 'Moves the focused card'],
      ['Space', 'Picks up or drops the card'],
      ['← → ↑ ↓', "Moves a card that's picked up"],
      ['Esc', 'Puts a card back'],
    ],
    a11yNotes: [
      'There are three ways to move a card, and only one needs a pointer. The Move button lists every destination.',
      'Every move is announced with where the card landed.',
      'On a touch screen the Move button opens a sheet.',
    ],
    propDocs: {
      onDrift:
        "Called when a card's measured height differs from the estimate, with both heights. For tuning.",
      columns: 'A state, or a list the board follows and `onMove` reports to.',
      onMove: "Called with the card's id, the column and the index.",
      onAdd: 'Shows Add card in each column, and is called with the column and the title.',
      height: "The board's height. Default 560px.",
      label: 'Names the board.',
    },
    related: ['Table', 'Checklist', 'VirtualList'],
  },
]
