import type { Doc } from '../../types.ts'

export const GAP_OPTIONS = ['none', 'hair', 'tight', 'related', 'group', 'section', 'page']

export const flow: Doc[] = [
  {
    component: 'Grid',
    tile: 'GridTile',
    tileStage: 'fill',
    summary:
      'Even columns that fit themselves: as many as suit the room, up to the most you allow.',
    use: {
      when: [
        'Cards, tiles or stats of equal weight',
        'A set of items that should reflow without breakpoints',
      ],
      instead: [
        { name: 'Split', why: 'one side is fixed and the other fluid' },
        { name: 'Row', why: 'the items keep their own widths' },
        { name: 'Table', why: 'the data has columns that mean something' },
      ],
    },
    playground: {
      example: 'GridPlay',
      code: '<Grid{props}>\n  <Box>1</Box>\n  <Box>2</Box>\n  <Box>3</Box>\n</Grid>',
      knobs: [
        {
          prop: 'min',
          control: 'segmented',
          options: ['xs', 'sm', 'md', 'lg'],
          initial: 'sm',
          default: 'md',
        },
        {
          prop: 'cols',
          control: 'segmented',
          options: ['any', 2, 3, 4, 6],
          initial: 'any',
          default: 'any',
        },
        {
          prop: 'gap',
          control: 'select',
          options: GAP_OPTIONS,
          initial: 'group',
          default: 'group',
        },
      ],
      presets: [
        { label: 'Stats', values: { min: 'xs', cols: 4, gap: 'related' } },
        { label: 'Cards', values: { min: 'sm', cols: 'any', gap: 'group' } },
        { label: 'Thumbnails', values: { min: 'xs', cols: 6, gap: 'tight' } },
      ],
      stage: 'fill',
      height: 300,
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'GridMinSizes',
            title: 'Minimum width',
            note: "`min` is the narrowest a column may get. Change the stage's Width and the columns refit.",
            stage: 'fill',
            height: 420,
          },
          {
            id: 'GridCols',
            title: 'Most columns',
            note: '`cols` is a ceiling, so a wide container stops at that many. `min` still wins when the room runs out: `cols={6}` with `min="xs"` needs about 810px, more than this stage has.',
            stage: 'fill',
            height: 420,
          },
          {
            id: 'GridSpan',
            title: 'A full-width child',
            note: 'Put `data-span="full"` on a direct child and it takes the whole row.',
            stage: 'fill',
            height: 240,
          },
          {
            id: 'GridGaps',
            title: 'Gap',
            note: '`gap` comes from the space scale, so it says how related the items are rather than a number of pixels.',
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
            id: 'GridDashboard',
            title: 'A dashboard',
            note: 'Four stats, with a full-width card under them.',
            stage: 'fill',
            height: 300,
          },
          {
            id: 'GridProjectCards',
            title: 'Project cards',
            note: 'Use `min` for the narrowest a card may get and `cols` for the most that sit across.',
            stage: 'fill',
            height: 300,
          },
        ],
      },
    ],
    a11yNotes: [
      'Grid changes how things look, not their order. Reading and tab order follow the source.',
      'Pass `as="ul"` for a real list of items.',
    ],
    propDocs: {
      min: 'The narrowest a column may get: `xs` 8rem, `sm` 11rem, `md` 16rem, `lg` 22rem.',
      cols: 'The most columns it will use, however wide it gets.',
      gap: 'The space between items, from the space scale.',
      as: 'The element: `div` by default, also `ul`, `section` and others.',
    },
    related: ['Split', 'Stack', 'Row', 'Card'],
  },
  {
    component: 'Stack',
    tile: 'StackTile',
    tileStage: 'fill',
    summary: 'Puts things in a column with even space between them.',
    use: {
      when: [
        'Anything that reads top to bottom',
        'Groups of fields, text or rows, where the gap says how related they are',
      ],
      instead: [
        { name: 'Row', why: 'the items sit side by side' },
        { name: 'Grid', why: 'the items should form columns' },
      ],
    },
    playground: {
      example: 'StackPlay',
      code: '<Stack{props}>\n  <Box>First</Box>\n  <Box>Second</Box>\n  <Box>Third</Box>\n</Stack>',
      knobs: [
        {
          prop: 'gap',
          control: 'select',
          options: GAP_OPTIONS,
          initial: 'group',
          default: 'group',
        },
        {
          prop: 'align',
          control: 'select',
          options: ['stretch', 'start', 'center', 'end'],
          initial: 'stretch',
          default: 'stretch',
        },
        { prop: 'divided', control: 'switch', initial: false, default: false },
      ],
      height: 260,
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'StackGaps',
            title: 'Gap',
            note: 'Five steps, from closely tied to clearly separate.',
            stage: 'fill',
            height: 200,
          },
          {
            id: 'StackAlign',
            title: 'Align',
            note: 'Without `align` children stretch to full width. With it they keep their own width.',
            stage: 'fill',
            height: 220,
          },
          {
            id: 'StackDivided',
            title: 'Divided',
            note: '`divided` draws a hairline between children, with the gap on both sides of it.',
            stage: 'narrow',
            height: 220,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'StackNotifications',
            title: 'A settings group',
            note: 'Use `divided` to draw a line between the items in a group, and `gap` to set the space.',
            stage: 'narrow',
            height: 320,
          },
          {
            id: 'StackDeployLog',
            title: 'A list of deploys',
            note: 'Use `divided` to separate each deploy from the next.',
            stage: 'narrow',
            height: 300,
          },
        ],
      },
    ],
    a11yNotes: [
      'Pass `as="ul"` or `as="ol"` when the children are a list, and `as="form"` for a form.',
    ],
    propDocs: {
      gap: 'The space between children, from the space scale.',
      align: 'Where children sit across the column. Leave it out to stretch them.',
      divided: 'Draws a hairline between children.',
      as: 'The element: `div` by default, also `form`, `ul`, `section` and others.',
    },
    related: ['Row', 'Grid', 'Spacer'],
  },
  {
    component: 'Row',
    tile: 'RowTile',
    tileStage: 'fill',
    summary: 'Puts things side by side and wraps them when they run out of room.',
    use: {
      when: ['Buttons, tags and small clusters', 'A header with a title and actions'],
      instead: [
        { name: 'Grid', why: 'the items should line up in columns' },
        { name: 'Split', why: 'one side has a fixed width' },
        { name: 'Stack', why: 'the items read top to bottom' },
      ],
    },
    playground: {
      example: 'RowPlay',
      code: '<Row{props}>\n  <Box>Short</Box>\n  <Box>Tall</Box>\n  <Box>A little wider</Box>\n</Row>',
      knobs: [
        {
          prop: 'justify',
          control: 'select',
          options: ['start', 'center', 'end', 'between'],
          initial: 'start',
          default: 'start',
        },
        {
          prop: 'align',
          control: 'select',
          options: ['center', 'start', 'baseline'],
          initial: 'center',
          default: 'center',
        },
        {
          prop: 'gap',
          control: 'select',
          options: GAP_OPTIONS,
          initial: 'related',
          default: 'related',
        },
        { prop: 'wrap', control: 'switch', initial: true, default: true },
      ],
      stage: 'fill',
      height: 200,
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'RowJustify',
            title: 'Justify',
            note: "Where the items sit along the row. The sunken area shows the row's full width.",
            stage: 'fill',
            height: 340,
          },
          {
            id: 'RowAlign',
            title: 'Align',
            note: 'Items centre by default. `start` tops them, `baseline` lines up text.',
            stage: 'fill',
            height: 180,
          },
          {
            id: 'RowWraps',
            title: 'Wrapping',
            note: 'It wraps by itself. `wrap={false}` keeps it on one line.',
            stage: 'fill',
            height: 160,
          },
          {
            id: 'RowGrow',
            title: 'A child that grows',
            note: '`data-grow` on a child takes the free space.',
            stage: 'fill',
            height: 120,
          },
          {
            id: 'RowReflow',
            title: 'Reflow',
            note: "`reflow` turns it into a stack when its container is narrow. Set the stage's Width to Tablet and Phone to see each step go.",
            stage: 'fill',
            height: 220,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'RowPageHeader',
            title: 'A page header',
            note: 'Title and actions apart, stacked when there is no room for both.',
            stage: 'fill',
            height: 160,
          },
        ],
      },
    ],
    propDocs: {
      justify: 'Where the items sit along the row.',
      align: 'How the items line up across the row. Centred by default.',
      wrap: '`false` keeps it on one line.',
      reflow:
        'Below this step of its container it becomes a stack: `tablet` is 600px, `desktop` 1000px.',
      gap: 'The space between items, from the space scale.',
      as: 'The element: `div` by default, also `header`, `footer`, `nav` and others.',
    },
    related: ['Stack', 'Spacer', 'Split'],
  },
]
