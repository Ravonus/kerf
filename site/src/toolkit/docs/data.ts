import { grids } from './data/grids.ts'
import { lists } from './data/lists.ts'
import { analysis } from './data/analysis.ts'
import type { DocGroup } from '../types.ts'

export const data: DocGroup = {
  file: 'data',
  title: 'Data',
  intro: 'Tables, grids and lists for large amounts of data.',
  docs: [
    {
      component: 'Table',
      summary: 'Rows of data that people can sort, filter, select and page through.',
      use: {
        when: [
          'Records people scan and compare',
          'Lists that need sorting, filtering or bulk actions',
        ],
        instead: [
          { name: 'DataGrid', why: 'people work cell by cell, like a spreadsheet' },
          { name: 'VirtualList', why: 'there are many thousands of rows' },
          { name: 'ScrollGrid', why: 'there are many columns as well as rows' },
        ],
      },
      playground: {
        example: 'TablePlay',
        code: '<Table caption="Projects" rows={projects} columns={columns}{props} />',
        knobs: [
          {
            prop: 'density',
            control: 'segmented',
            options: ['compact', 'cozy', 'comfortable'],
            initial: 'cozy',
            default: 'cozy',
          },
          {
            prop: 'filter',
            control: 'text',
            label: 'Filter label',
            initial: 'Filter projects',
            default: '',
          },
          { prop: 'selection', control: 'switch', initial: false, default: false },
          {
            prop: 'picker',
            control: 'switch',
            label: 'Columns picker',
            initial: true,
            default: true,
          },
          {
            prop: 'phone',
            control: 'segmented',
            options: ['cards', 'columns'],
            initial: 'cards',
            default: 'cards',
          },
        ],
        presets: [
          { label: 'Plain', values: { filter: '', selection: false, picker: false } },
          {
            label: 'Admin list',
            values: {
              filter: 'Filter projects',
              selection: true,
              picker: true,
              density: 'compact',
            },
          },
        ],
        stage: 'fill',
        height: 520,
      },
      sections: [
        {
          kind: 'variants',
          title: 'Variants',
          examples: [
            {
              id: 'TableSortable',
              title: 'Sorting',
              note: 'Press a header. Bind `sort` to a state to start sorted or to read it.',
              stage: 'fill',
              height: 520,
            },
            {
              id: 'TableFilter',
              title: 'Filtering',
              note: '`filter` adds the field and searches every column. Try "eu-west" or "Lena".',
              stage: 'fill',
              height: 500,
            },
            {
              id: 'TableSelect',
              title: 'Selection and bulk actions',
              note: 'Shift-click selects a range. `bulk` fills the bar, and these buttons really pause and delete.',
              stage: 'fill',
              height: 480,
            },
            {
              id: 'TablePaged',
              title: 'Pages',
              note: '`page` slices the rows and adds the footer.',
              stage: 'fill',
              height: 360,
            },
            {
              id: 'TableDetails',
              title: 'Row details',
              note: 'Press a row. `expand` draws what opens.',
              stage: 'fill',
              height: 480,
            },
            {
              id: 'TablePriority',
              title: 'Columns that give way',
              note: "`priority` 2 hides below 760px of table width and 3 below 1000px. Hidden fields move into the row's details.",
              stage: 'fill',
              height: 480,
            },
            {
              id: 'TablePinned',
              title: 'Pinned and resizable columns',
              note: "`pin` keeps a column in place while the rest scroll. Drag a header's edge to resize it.",
              stage: 'fill',
              height: 500,
            },
            {
              id: 'TableSticky',
              title: 'A fixed height',
              note: '`maxHeight` scrolls the rows under a sticky header.',
              stage: 'fill',
              height: 320,
            },
            {
              id: 'TableEdit',
              title: 'Inline editing',
              note: '`edit` turns text into the value, `validate` refuses a bad one, and `onEdit` saves it.',
              stage: 'fill',
              height: 320,
            },
            {
              id: 'TableLive',
              title: 'Live numbers',
              note: 'A `live` cell flashes up or down as its value changes. Only that cell updates.',
              stage: 'fill',
              height: 280,
            },
          ],
        },
        {
          kind: 'states',
          title: 'States',
          examples: [
            {
              id: 'TableLoading',
              title: 'Loading',
              note: 'Comes by itself with a Resource. `status` forces it.',
              stage: 'fill',
              height: 300,
            },
            {
              id: 'TableEmpty',
              title: 'Empty',
              note: 'Use `empty` to say what to show when there are no `rows`.',
              stage: 'fill',
              height: 280,
            },
            {
              id: 'TableError',
              title: 'Error',
              note: 'Retry calls `onRetry`, and here it succeeds.',
              stage: 'fill',
              height: 280,
            },
          ],
        },
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            {
              id: 'TableDeploys',
              title: 'Recent deploys',
              note: 'Use `filter` to add a search box, `density` to set how tight the rows sit, and `actions` for buttons above the table.',
              stage: 'fill',
              height: 400,
            },
            {
              id: 'TableTeam',
              title: 'Team members',
              note: 'Use `selection` to let people tick rows, and `sort` on a column to let them order by it.',
              stage: 'fill',
              height: 480,
            },
          ],
        },
      ],
      keyboard: [
        ['Tab', 'Moves through the headers, checkboxes and row buttons'],
        ['Enter', 'On a header, sorts. On an editable cell, edits'],
        ['Esc', 'Cancels an edit'],
        ['Shift click', 'Selects a range of rows'],
      ],
      a11yNotes: [
        '`caption` is required: it names the table, and `captionHidden` keeps it for screen readers only.',
        'Below 600px of table width rows become cards, unless `phone="columns"`. Roles stay on the elements so it still reads as a table.',
      ],
      propDocs: {
        columns:
          'What each column shows. See `id`, `header`, `sort`, `cell`, `numeric`, `priority`, `edit` in the examples.',
        rows: 'A list, a state, or a Resource. Given a list it sorts, filters and pages by itself.',
        density: 'How tight the rows are.',
        phone: 'Below 600px: `cards`, or `columns` to keep scrolling sideways.',
        selection: '`true`, or a state to hold the picked keys yourself.',
        expand: 'What opens under a row. Default a list of every column.',
        details: '`sheet` opens details in a panel below 1000px.',
        page: 'Rows per page.',
        picker: 'The Columns button. On by default.',
        server:
          'The rows arrive sorted, filtered and paged, so the table only reports what was asked.',
      },
      related: ['DataGrid', 'PaginationBar', 'VirtualList'],
    },
    ...grids,
    ...lists,
    ...analysis,
  ],
}
