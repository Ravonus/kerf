import type { DocGroup } from '../types.ts'

const GAP_OPTIONS = ['none', 'hair', 'tight', 'related', 'group', 'section', 'page']

export const layout: DocGroup = {
  file: 'layout',
  title: 'Layout',
  intro: 'Stacks, grids and the shell around your pages. They answer to their container, not the screen.',
  docs: [
    {
      component: 'Grid',
      summary: 'Even columns that fit themselves: as many as suit the room, up to the most you allow.',
      use: {
        when: ['Cards, tiles or stats of equal weight', 'A set of items that should reflow without breakpoints'],
        instead: [{ name: 'Split', why: 'one side is fixed and the other fluid' }, { name: 'Row', why: 'the items keep their own widths' }, { name: 'Table', why: 'the data has columns that mean something' }],
      },
      playground: {
        example: 'GridPlay',
        code: '<Grid{props}>\n  <Box>1</Box>\n  <Box>2</Box>\n  <Box>3</Box>\n</Grid>',
        knobs: [
          { prop: 'min', control: 'segmented', options: ['xs', 'sm', 'md', 'lg'], initial: 'sm', default: 'md' },
          { prop: 'cols', control: 'segmented', options: ['any', 2, 3, 4, 6], initial: 'any', default: 'any' },
          { prop: 'gap', control: 'select', options: GAP_OPTIONS, initial: 'group', default: 'group' },
        ],
        presets: [
          { label: 'Stats', values: { min: 'xs', cols: '4', gap: 'related' } },
          { label: 'Cards', values: { min: 'sm', cols: 'any', gap: 'group' } },
          { label: 'Thumbnails', values: { min: 'xs', cols: '6', gap: 'tight' } },
        ],
        stage: 'fill',
        height: 300,
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'GridMinSizes', title: 'Minimum width', note: '`min` is the narrowest a column may get. Change the stage\'s Width and the columns refit.', stage: 'fill', height: 420 },
          { id: 'GridCols', title: 'Most columns', note: '`cols` is a ceiling, so a wide container stops at that many. `min` still wins when the room runs out.', stage: 'fill', height: 420 },
          { id: 'GridSpan', title: 'A full-width child', note: 'Put `data-span="full"` on a direct child and it takes the whole row.', stage: 'fill', height: 240 },
          { id: 'GridGaps', title: 'Gap', note: '`gap` comes from the space scale, so it says how related the items are rather than a number of pixels.', stage: 'fill', height: 260 },
        ] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'GridDashboard', title: 'A dashboard', note: 'Four stats, with a full-width card under them.', stage: 'fill', height: 300 },
          { id: 'GridProjectCards', title: 'Project cards', stage: 'fill', height: 300 },
        ] },
      ],
      a11yNotes: ['Grid changes how things look, not their order. Reading and tab order follow the source.', 'Pass `as="ul"` for a real list of items.'],
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
      summary: 'Puts things in a column with even space between them.',
      use: {
        when: ['Anything that reads top to bottom', 'Groups of fields, text or rows, where the gap says how related they are'],
        instead: [{ name: 'Row', why: 'the items sit side by side' }, { name: 'Grid', why: 'the items should form columns' }],
      },
      playground: {
        example: 'StackPlay',
        code: '<Stack{props}>\n  <Box>First</Box>\n  <Box>Second</Box>\n  <Box>Third</Box>\n</Stack>',
        knobs: [
          { prop: 'gap', control: 'select', options: GAP_OPTIONS, initial: 'group', default: 'group' },
          { prop: 'align', control: 'select', options: ['stretch', 'start', 'center', 'end'], initial: 'stretch', default: 'stretch' },
          { prop: 'divided', control: 'switch', initial: false, default: false },
        ],
        height: 260,
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'StackGaps', title: 'Gap', note: 'Five steps, from closely tied to clearly separate.', stage: 'fill', height: 200 },
          { id: 'StackAlign', title: 'Align', note: 'Without `align` children stretch to full width. With it they keep their own width.', stage: 'fill', height: 220 },
          { id: 'StackDivided', title: 'Divided', note: '`divided` draws a hairline between children, with the gap on both sides of it.', stage: 'narrow', height: 220 },
        ] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'StackNotifications', title: 'A settings group', stage: 'narrow', height: 320 },
          { id: 'StackDeployLog', title: 'A list of deploys', stage: 'narrow', height: 300 },
        ] },
      ],
      a11yNotes: ['Pass `as="ul"` or `as="ol"` when the children are a list, and `as="form"` for a form.'],
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
      summary: 'Puts things side by side and wraps them when they run out of room.',
      use: {
        when: ['Buttons, tags and small clusters', 'A header with a title and actions'],
        instead: [{ name: 'Grid', why: 'the items should line up in columns' }, { name: 'Split', why: 'one side has a fixed width' }, { name: 'Stack', why: 'the items read top to bottom' }],
      },
      playground: {
        example: 'RowPlay',
        code: '<Row{props}>\n  <Box>Short</Box>\n  <Box>Tall</Box>\n  <Box>A little wider</Box>\n</Row>',
        knobs: [
          { prop: 'justify', control: 'select', options: ['start', 'center', 'end', 'between'], initial: 'start', default: 'start' },
          { prop: 'align', control: 'select', options: ['center', 'start', 'baseline'], initial: 'center', default: 'center' },
          { prop: 'gap', control: 'select', options: GAP_OPTIONS, initial: 'related', default: 'related' },
          { prop: 'wrap', control: 'switch', initial: true, default: true },
        ],
        stage: 'fill',
        height: 200,
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'RowJustify', title: 'Justify', note: 'Where the items sit along the row. The sunken area shows the row\'s full width.', stage: 'fill', height: 340 },
          { id: 'RowAlign', title: 'Align', note: 'Items centre by default. `start` tops them, `baseline` lines up text.', stage: 'fill', height: 180 },
          { id: 'RowWraps', title: 'Wrapping', note: 'It wraps by itself. `wrap={false}` keeps it on one line.', stage: 'fill', height: 160 },
          { id: 'RowGrow', title: 'A child that grows', note: '`data-grow` on a child takes the free space.', stage: 'fill', height: 120 },
          { id: 'RowReflow', title: 'Reflow', note: '`reflow` turns it into a stack when its container is narrow. Set the stage\'s Width to Tablet and Phone to see each step go.', stage: 'fill', height: 220 },
        ] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'RowPageHeader', title: 'A page header', note: 'Title and actions apart, stacked when there is no room for both.', stage: 'fill', height: 160 },
        ] },
      ],
      propDocs: {
        justify: 'Where the items sit along the row.',
        align: 'How the items line up across the row. Centred by default.',
        wrap: '`false` keeps it on one line.',
        reflow: 'Below this step of its container it becomes a stack: `tablet` is 600px, `desktop` 1000px.',
        gap: 'The space between items, from the space scale.',
        as: 'The element: `div` by default, also `header`, `footer`, `nav` and others.',
      },
      related: ['Stack', 'Spacer', 'Split'],
    },
    {
      component: 'Split',
      summary: 'A fixed side next to a fluid main area, stacked when the container is narrow.',
      use: {
        when: ['Settings with a list of sections', 'A list next to its detail', 'A page with a sidebar inside the content'],
        instead: [{ name: 'Grid', why: 'the columns are equal' }, { name: 'Shell', why: 'this is the whole app frame' }],
      },
      playground: {
        example: 'SplitPlay',
        code: '<Split{props}>\n  <Box>Side</Box>\n  <Box>Main</Box>\n</Split>',
        knobs: [
          { prop: 'width', control: 'select', options: ['aside', 'rail', 'nav', 'list', 'half'], initial: 'aside', default: 'aside' },
          { prop: 'side', control: 'segmented', options: ['start', 'end'], initial: 'start', default: 'start' },
          { prop: 'at', control: 'segmented', options: ['tablet', 'desktop'], initial: 'tablet', default: 'tablet' },
          { prop: 'gap', control: 'select', options: GAP_OPTIONS, initial: 'section', default: 'section' },
        ],
        presets: [
          { label: 'Settings', values: { width: 'nav', side: 'start', gap: 'section' } },
          { label: 'Inspector', values: { width: 'aside', side: 'end', gap: 'group' } },
          { label: 'Even', values: { width: 'half', gap: 'group' } },
        ],
        stage: 'fill',
        height: 220,
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'SplitWidths', title: 'Side width', note: 'Named widths: `rail` 80px, `nav` 220px, `aside` 300px (the default), `list` 340px, and `half` for two equal sides.', stage: 'fill', height: 240 },
          { id: 'SplitSides', title: 'Which side', note: '`side="end"` fixes the second child, so the first one is the fluid one.', stage: 'fill', height: 200 },
          { id: 'SplitSteps', title: 'When it stacks', note: 'It answers to its container, not the screen. Set the stage\'s Width to Tablet: the `desktop` one stacks first.', stage: 'fill', height: 220 },
        ] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'SplitSettings', title: 'A settings page', note: 'Pick a section. Each side is a container, so what\'s inside reflows by its own width.', stage: 'fill', height: 360 },
          { id: 'SplitMasterDetail', title: 'List and detail', stage: 'fill', height: 320 },
        ] },
      ],
      a11yNotes: ['Stacked, the children keep source order, so put what people need first first. `side` changes which one is fixed, not the order.'],
      propDocs: {
        width: 'The fixed side: `rail`, `nav`, `list` or `half`. Default 300px.',
        side: 'Which child is fixed. `start` is the first, `end` the last.',
        at: 'When it becomes two columns: `tablet` at 600px of container, `desktop` at 1000px.',
        gap: 'The space between the sides, from the space scale.',
      },
      related: ['Grid', 'Shell', 'Stack'],
    },
    {
      component: 'Center',
      summary: 'A column of readable width, centred in whatever holds it.',
      use: {
        when: ['Articles and other long text', 'Sign-in and other single forms', 'Keeping a page\'s content from getting too wide'],
        instead: [{ name: 'Cover', why: 'it should centre vertically too' }],
      },
      playground: {
        example: 'CenterPlay',
        code: '<Center{props}>\n  <Box>A measured column</Box>\n</Center>',
        knobs: [
          { prop: 'max', control: 'select', options: ['narrow', 'measure', 'content', 'wide'], initial: 'narrow', default: 'content' },
          { prop: 'gutter', control: 'switch', initial: false, default: false },
          { prop: 'intrinsic', control: 'switch', initial: false, default: false },
        ],
        stage: 'fill',
        height: 200,
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'CenterWidths', title: 'Widths', note: '`narrow` 440px for forms, `measure` about 70 characters for reading, `content` 1160px for pages. `wide` is 1440px.', stage: 'fill', height: 200 },
          { id: 'CenterGutter', title: 'Gutter', note: '`gutter` adds the page\'s side margin and clears a phone\'s notch.', stage: 'fill', height: 180 },
          { id: 'CenterIntrinsic', title: 'Centre the content too', note: '`intrinsic` also centres each child at its own width.', stage: 'fill', height: 220 },
        ] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'CenterArticle', title: 'An article', stage: 'fill', height: 280 }] },
      ],
      propDocs: {
        max: 'How wide it may get: `narrow`, `measure`, `content` or `wide`.',
        gutter: 'Adds the page\'s side margin, and the safe areas on a phone.',
        intrinsic: 'Centres each child at its own width, and centres text.',
      },
      related: ['Cover', 'Stack', 'Split'],
    },
    {
      component: 'Cover',
      summary: 'Fills the screen and centres one thing, with a header and footer at the edges.',
      use: {
        when: ['Sign-in and sign-up pages', 'Error and empty pages', 'A landing hero'],
        instead: [{ name: 'Center', why: 'it only needs to centre across, not down' }, { name: 'Shell', why: 'the page has navigation' }],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'CoverParts', title: 'The parts', note: 'The child with `data-part="center"` takes the free space. Whatever comes before and after hugs the edges.', stage: 'fill', height: 420 },
          { id: 'CoverFill', title: 'Inside a box', note: '`min="fill"` fills its parent instead of the screen.', stage: 'fill', height: 340 },
        ] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'CoverSignIn', title: 'A sign-in page', note: 'Previews pin the screen\'s height with `--warp-viewport-block`. In an app, leave that out.', stage: 'fill', height: 580 },
          { id: 'CoverNotFound', title: 'A not found page', stage: 'fill', height: 420 },
        ] },
      ],
      a11yNotes: ['It sets no landmark. Pass `as="main"` when it is the page.'],
      propDocs: {
        min: '`screen` fills the viewport, `fill` fills its parent.',
        gap: 'The least space kept between the parts, from the space scale.',
      },
      related: ['Center', 'Shell', 'SignIn'],
    },
    {
      component: 'Frame',
      summary: 'A box that holds its shape, for images, video and previews.',
      use: { when: ['Images and video that must not shift the page as they load', 'Thumbnails of mixed sizes that should line up'], instead: [{ name: 'Card', why: 'it needs a surface and padding' }] },
      playground: {
        example: 'FramePlay',
        code: '<Frame{props}>\n  <img src="/preview.png" alt="" />\n</Frame>',
        knobs: [{ prop: 'ratio', control: 'select', options: ['21:9', '16:9', '3:2', '4:3', 'square', '3:4', '9:16'], initial: '16:9', default: '16:9' }],
        height: 280,
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'FrameRatios', title: 'Ratios', note: 'The sunken colour shows until the media arrives, so the page never jumps.', stage: 'fill', height: 200 },
          { id: 'FrameMedia', title: 'Media crops to fit', note: 'An image, video, canvas or SVG directly inside fills the frame and crops.', stage: 'fill', height: 300 },
        ] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'FramePreviews', title: 'Deploy previews', stage: 'fill', height: 300 }] },
      ],
      a11yNotes: ['Frame draws nothing itself, so give an image its `alt` as usual.'],
      propDocs: { ratio: 'Width to height. `16:9` by default.' },
      related: ['Card', 'Grid'],
    },
    {
      component: 'Inset',
      summary: 'A sunken, padded area that sets something apart inside a page or card.',
      use: { when: ['Logs, code and read-only values', 'A summary inside a form or a card'], instead: [{ name: 'Card', why: 'it should rise above the page' }, { name: 'Alert', why: 'it needs attention' }] },
      playground: {
        example: 'InsetPlay',
        code: '<Inset{props}>\n  <Box>The sunken area is the Inset</Box>\n</Inset>',
        knobs: [{ prop: 'pad', control: 'segmented', options: ['group', 'section'], initial: 'group', default: 'group' }],
        height: 200,
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [{ id: 'InsetPads', title: 'Padding', note: 'Two sizes from the space scale.', stage: 'fill', height: 160 }] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'InsetBuildLog', title: 'Build output', stage: 'narrow', height: 260 },
          { id: 'InsetInvoiceTotal', title: 'An invoice summary', stage: 'narrow', height: 300 },
        ] },
      ],
      propDocs: { pad: 'The padding: `group`, or `section` for more.' },
      related: ['Card', 'Stack'],
    },
    {
      component: 'Spacer',
      summary: 'Takes up the free space in a Row or Stack, so what follows sits at the far end.',
      use: { when: ['A toolbar with items at both ends', 'A card whose button sits at the bottom'], instead: [{ name: 'Row', why: 'two groups apart is all you need: use `justify="between"`' }] },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'SpacerInRow', title: 'In a Row', note: 'Everything after it goes to the far end. The sunken area shows the row\'s width.', stage: 'fill', height: 130 },
          { id: 'SpacerInStack', title: 'In a Stack', note: 'A Stack needs a height for there to be free space.', stage: 'fill', height: 300 },
          { id: 'SpacerTwo', title: 'Two spacers', note: 'They share the free space evenly, which centres what\'s between them.', stage: 'fill', height: 130 },
        ] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'SpacerToolbar', title: 'A toolbar', stage: 'fill', height: 120 },
          { id: 'SpacerCardFooter', title: 'Buttons along the bottom', note: 'Two cards of different lengths still line up their buttons.', stage: 'fill', height: 260 },
        ] },
      ],
      a11yNotes: ['It is an empty box with no role, so screen readers skip it.'],
      related: ['Row', 'Stack'],
    },
    {
      component: 'Shell',
      summary: 'The frame of an app: header, navigation and main area, reshaping itself from phone to desktop.',
      use: {
        when: ['The outermost layout of a signed-in app', 'A wizard or checkout: `variant="focus"` drops the navigation'],
        instead: [{ name: 'Split', why: 'it is a sidebar inside a page' }, { name: 'Cover', why: 'the page has no navigation at all' }],
      },
      tile: 'ShellRail',
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'ShellApp', title: 'The app', note: 'Press the nav items and the account button. It answers to its own width: at 1000px and up it draws the full sidebar, below that a rail, and below 600px bottom tabs.', stage: 'fill', height: 664 },
          { id: 'ShellRail', title: 'Collapsed to a rail', note: 'Bind `collapsed` to a state to keep it. Press `[`, or the toggle at the foot of the rail.', stage: 'fill', height: 484 },
          { id: 'ShellFocus', title: 'Focus', note: '`variant="focus"` has no navigation: Close, a title and the step, with `dock` for the main action.', stage: 'fill', height: 484 },
        ] },
        { kind: 'states', title: 'Phone', examples: [
          { id: 'ShellPhone', title: 'Bottom tabs', note: 'The first four items become tabs. The rest move into More, or mark your own with `tab`.', stage: 'fill', height: 624 },
          { id: 'ShellChildPage', title: 'A child page', note: '`depth="child"` with `back` swaps the brand for a back button.', stage: 'fill', height: 484 },
        ] },
        { kind: 'prose', title: 'Showing a shell inside a page', md: 'A shell fills the screen by default, which is what you want in an app: put it at the top of your layout and nothing else is needed.\n\nTo preview one inside a page, as here, pass `island` so the page keeps its one `<main>`, set `--warp-viewport-block` to the height you want, and give the box around it `contain: layout` so the shell\'s overlays stay inside. The `AppWindow` helper in these examples does exactly that.' },
      ],
      keyboard: [['[', 'Collapses or expands the sidebar'], ['⌘ K', 'Runs `command`, when it is set'], ['Esc', 'Closes the open navigation'], ['Tab', 'The first stop is Skip to content']],
      a11yNotes: ['Parts are props rather than children, so the focus order is always skip link, brand, header, navigation, main, dock.', 'A change to `current` announces the new page\'s `h1`, so give every page one.', 'With `island`, main becomes a named region, since a document has one `<main>`.'],
      propDocs: {
        brand: 'The product\'s name and mark. Shown in the header, and as the home link.',
        nav: 'Groups of items. The first is the main list; the rest are extras such as saved views, in the sidebar only.',
        foot: 'Items pinned to the bottom of the navigation.',
        current: 'The `id` of the current item. A change plays the route line and announces the page.',
        crumbs: 'The path in the header from tablet up. The last is the current page.',
        title: 'The phone header\'s title.',
        actions: 'Your own buttons in the header.',
        account: 'The account button and its menu.',
        switcher: 'A workspace switcher above the navigation.',
        command: 'A search field in the header. It takes over ⌘K.',
        collapsed: 'A state: `false`, `true` for the rail, or `hidden` for an edge tab.',
        dock: 'A sticky bar under the content, for the page\'s main action.',
        overlays: 'Dialogs, toasts and palettes, kept outside main.',
        island: 'For a shell inside a page: main becomes a named region.',
      },
      related: ['Split', 'Cover', 'Nav', 'Menu'],
    },
  ],
}
