import type { DocGroup } from '../types.ts'

export const moving: DocGroup = {
  file: 'moving',
  title: 'Navigation',
  intro: 'Showing one part of a page at a time, and getting between pages.',
  docs: [
    {
      component: 'Tabs',
      summary: 'Switches between views of the same thing, one at a time.',
      use: {
        when: ['Three to seven views of one thing, where people only need one at a time', 'Filtering one list by a single value, with the pill variant'],
        instead: [{ name: 'Nav', why: 'each view is its own page with its own URL' }, { name: 'Segmented', why: 'it is a form value, with no panel under it' }, { name: 'Accordion', why: 'people may want several sections open' }],
      },
      playground: {
        example: 'TabsPlay',
        code: '<Tabs label="Project"{props} value={tab.value} onChange={v => (tab.value = v)} options={SECTIONS}>\n  {v => <Text>{WORDS[v]}</Text>}\n</Tabs>',
        stage: 'fill',
        knobs: [
          { prop: 'variant', control: 'segmented', options: ['line', 'pill', 'enclosed'], initial: 'line', default: 'line' },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'TabsLine', title: 'Line', note: 'The default. A bar slides to the selected tab.', stage: 'fill', height: 170 },
          { id: 'TabsPill', title: 'Pill', note: 'Every tab shares one panel, so it suits a filter.', stage: 'fill', height: 170 },
          { id: 'TabsEnclosed', title: 'Enclosed', note: 'The panel gets a box of its own.', stage: 'fill', height: 190 },
        ] },
        { kind: 'states', title: 'States', examples: [
          { id: 'TabsOverflow', title: 'More tabs than room', note: 'The row scrolls with faded edges and keeps the selected tab in view.', stage: 'narrow', height: 170 },
          { id: 'TabsDisabled', title: 'A disabled tab', note: 'Set `disabled` on the option. Arrow keys skip it.', stage: 'fill', height: 170 },
        ] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'TabsProjectPage', title: 'A project page', note: 'Tabs switch between the sections of one page, with `options` listing the sections and `value` the current one.', stage: 'fill', height: 300 },
          { id: 'TabsFilterList', title: 'Filtering a list', note: 'Use `variant` set to `pill` for a compact set of filters above a list.', stage: 'narrow', height: 300 },
        ] },
      ],
      keyboard: [['← →', 'Moves to the next tab and selects it'], ['Home End', 'Jumps to the first or last tab'], ['Tab', 'Moves into the panel']],
      a11yNotes: ['Only the selected tab is in the tab order, and each tab points at its panel.', 'In the `pill` variant every tab controls the one shared panel.'],
      propDocs: {
        label: 'The name screen readers give the row of tabs.',
        value: 'The selected tab. You own this value.',
        onChange: 'Called with the tab that was picked.',
        options: 'The tabs: `value`, `label` and optionally `disabled`.',
        children: 'A function from a tab\'s value to its panel.',
      },
      related: ['Nav', 'Segmented', 'Accordion'],
    },
    {
      component: 'Accordion',
      summary: 'A stack of headings that open to show more.',
      use: {
        when: ['Long answers where people want only one or two', 'Optional settings that can stay out of the way'],
        instead: [{ name: 'Tabs', why: 'the sections are peers and only one is read at a time' }, { name: 'Drawer', why: 'the extra content is a task of its own' }],
      },
      playground: {
        example: 'AccordionPlay',
        code: '<Accordion{props} defaultOpen={[\'rollback\']} items={QUESTIONS} />',
        stage: 'narrow',
        height: 300,
        knobs: [
          { prop: 'variant', control: 'segmented', options: ['boxed', 'line'], initial: 'boxed', default: 'boxed' },
          { prop: 'multiple', control: 'switch', initial: false, default: false },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'AccordionBoxed', title: 'Boxed', note: 'The default. Opening one closes the last.', stage: 'narrow', height: 280 },
          { id: 'AccordionLine', title: 'Line', note: 'Hairlines only, for inside a card.', stage: 'narrow', height: 280 },
          { id: 'AccordionMultiple', title: 'Several open', note: '`multiple` leaves the others alone.', stage: 'narrow', height: 320 },
        ] },
        { kind: 'states', title: 'States', examples: [
          { id: 'AccordionDisabled', title: 'A disabled item', note: 'Set `disabled` on the item, and say why in its title.', stage: 'narrow', height: 220 },
          { id: 'AccordionHeardChange', title: 'Hearing what is open', note: '`onChange` gets the open values each time.', stage: 'narrow', height: 300 },
        ] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'AccordionSettings', title: 'Project settings', note: 'An item\'s `content` can be any JSX.', stage: 'narrow', height: 320 }] },
      ],
      keyboard: [['Enter', 'Opens or closes the focused item'], ['Space', 'Opens or closes the focused item'], ['↑ ↓', 'Moves between headings'], ['Home End', 'Jumps to the first or last heading']],
      a11yNotes: ['Each title is a real button inside a heading. Set `level` so the heading fits the page outline.'],
      propDocs: {
        items: 'The entries: `value`, `title`, `content` and optionally `disabled`.',
      },
      related: ['Tabs', 'Card', 'Drawer'],
    },
    {
      component: 'Nav',
      summary: 'A row or column of links with a bar that slides to the current one.',
      tileWidth: 360,
      use: {
        when: ['Links to the pages of an app or a section', 'A table of contents that follows the reader'],
        instead: [{ name: 'Tabs', why: 'the views swap in place and have no URL' }, { name: 'Menu', why: 'the links run actions, or there are too many to show' }],
      },
      playground: {
        example: 'NavPlay',
        code: '<Nav label="Project"{props}>\n  <a href="/overview">Overview</a>\n  <a href="/deploys" aria-current="page">Deploys</a>\n  <a href="/logs">Logs</a>\n  <a href="/settings">Settings</a>\n</Nav>',
        knobs: [{ prop: 'axis', control: 'segmented', options: ['x', 'y'], initial: 'x', default: 'x' }],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'NavAcross', title: 'A row', note: 'Mark the current page with `aria-current`. `Link` from `@weft-js/start` does that for you.' },
          { id: 'NavDown', title: 'A column', note: '`axis="y"` puts the bar beside the links.', height: 220 },
        ] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'NavProductHeader', title: 'App header', note: 'Put `Nav` links beside a title, and set `aria-current` on the link for the current page.', stage: 'fill' },
          { id: 'NavSettings', title: 'Settings pages', note: 'Use `axis="y"` to stack the links down the side, with `aria-current` marking the current page.', stage: 'fill', height: 220 },
          { id: 'NavContents', title: 'Table of contents', note: '`spy` lights the link whose heading is at the top of the window. Scroll to watch it move.', stage: 'fill', height: 380 },
        ] },
      ],
      keyboard: [['Tab', 'Moves between links'], ['Enter', 'Follows the link']],
      a11yNotes: ['`label` names the landmark, so a page with two navs can tell them apart.', 'The links are plain anchors. `aria-current` is what announces the page, as well as moving the bar.'],
      propDocs: {
        label: 'The name of the navigation landmark.',
        axis: '`x` for a row, `y` for a column.',
        spy: 'Follow the headings the links point at, for a table of contents.',
      },
      related: ['Tabs', 'Link', 'Shell'],
    },
    {
      component: 'SideNav',
      summary: 'A docs sidebar: a left panel whose sections fold, with a collapse bar at its edge. Docked on wide screens, laid over the page on phones.',
      tileWidth: 320,
      use: {
        when: ['The pages of a docs site, a guide or a component library', 'A list of pages long enough that a reader needs to see where they are in it'],
        instead: [{ name: 'Nav', why: 'there are a handful of links and no sections' }, { name: 'Shell', why: 'it is an app\'s own navigation, with an account menu' }, { name: 'Accordion', why: 'the sections hold content, not links' }],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'SideNavGuide', title: 'Sections that fold', note: 'The section holding `current` starts open and the others folded. What a reader opens or closes is kept in localStorage under `remember`. The bar at the panel\'s edge folds it to a slim strip and back, and that is kept too. Under 900px only the bar shows, down the left edge, and pressing it brings the panel over the page. Docked, it is `--warp-sidenav-width` wide (240px) and folds to `--warp-sidenav-bar` (28px), so give it an `auto` column; on a phone, start the page that far in.', stage: 'fill', height: 420 },
          { id: 'SideNavFilter', title: 'With a filter', note: '`filter` adds a box that keeps the matching pages and opens every section they are in. Use it for long lists.', stage: 'fill', height: 420 },
        ] },
      ],
      keyboard: [['Tab', 'Moves between section headings, links and the bar; on a phone it stays inside the open panel'], ['Enter or Space', 'Opens or closes a section; on the bar, folds or unfolds the sidebar, or opens or closes the panel on a phone'], ['Escape', 'Closes the panel on a phone']],
      a11yNotes: [
        '`label` names the navigation landmark and titles the panel.',
        'Each section heading is a button with `aria-expanded` and `aria-controls`. A folded section is `hidden`, so its links leave the tab order.',
        'The current page\'s link has `aria-current="page"`.',
        'The bar is a button named by `label`, with `aria-controls` naming the panel and `aria-expanded` saying whether the sidebar is unfolded, or on a phone whether the panel is open.',
        'On a phone the open panel is a modal dialog labelled by its title: focus moves into it, stays inside, and goes back to the bar when it closes.',
      ],
      propDocs: {
        label: 'The name of the navigation landmark, and the panel\'s title on a phone.',
        collapsible: 'The collapse bar at the panel\'s edge. Default true. `false` drops it, and the panel then opens on a phone only from a button whose `aria-controls` names its `id`, with a close button in its head.',
        id: 'The panel\'s id. A button anywhere with `aria-controls` set to it also opens the panel on a phone.',
        lead: 'Links shown above the sections only on a phone, such as a site\'s top links.',
        sections: 'The sections, in order: `title`, `items` (`href` and `label`), and `pinned` to keep one always open with a plain heading.',
        current: 'The current page\'s `href`. Its link is marked, its section opens, and the rail scrolls to it.',
        filter: 'Adds a filter box. A string is its placeholder.',
        remember: 'The localStorage key for a reader\'s folds, and `<key>:collapsed` for whether they folded the sidebar. `false` keeps nothing. Default `warp:sidenav:<label>`.',
      },
      related: ['Nav', 'Shell', 'Drawer'],
    },
    {
      component: 'PaginationBar',
      summary: 'Moves through a long list a page at a time.',
      use: {
        when: ['A list people jump around in, or link to a page of', 'You know the total, or at least whether there is more'],
        instead: [{ name: 'LoadMore', why: 'people read straight down a feed' }, { name: 'VirtualList', why: 'it is one long list that scrolls' }],
      },
      playground: {
        example: 'PaginationBarPlay',
        code: '<PaginationBar label="Projects" page={page}{props} />',
        stage: 'fill',
        knobs: [
          { prop: 'total', control: 'slider', min: 10, max: 5000, step: 10, initial: 1240, default: 0 },
          { prop: 'size', control: 'select', options: [10, 25, 50, 100], initial: 25, default: 25 },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'PaginationBarOffset', title: 'Numbered pages', note: 'The default: rows per page, the range, the pages and Go to.', stage: 'fill', height: 120 },
          { id: 'PaginationBarCursor', title: 'Previous and Next', note: '`mode="cursor"` is for a list with no page count. You move `pageIndex`.', stage: 'fill', height: 120 },
        ] },
        { kind: 'states', title: 'States', examples: [
          { id: 'PaginationBarNarrow', title: 'In a small space', note: 'Under 520px of its own width only the arrows and the current page stay.', stage: 'narrow', height: 120 },
          { id: 'PaginationBarControlled', title: 'Moved from outside', note: 'Pass a `state` as `page` and write to it from anywhere.', stage: 'fill', height: 170 },
        ] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'PaginationBarList', title: 'Paging a list', note: 'Pass `page`, `size`, `sizes` and `total` to move through a long list a few rows at a time.', stage: 'fill', height: 340 }] },
      ],
      keyboard: [['Tab', 'Moves between the page buttons'], ['Enter', 'Goes to that page, or the number typed in Go to']],
      a11yNotes: ['After a press, focus moves to the new current page, so it is never lost when a button goes away.'],
      propDocs: {
        label: 'The name of the navigation landmark.',
        total: 'How many rows there are, in numbered mode.',
        size: 'Rows per page. Pass a `state` so the rows-per-page select can change it.',
        sizes: 'What the rows-per-page select offers.',
        pageIndex: 'Cursor mode: which page this is, from 0.',
        hasMore: 'Cursor mode: enables Next.',
        hasPrev: 'Cursor mode: enables Previous.',
        supply: 'Cursor mode: the total, when you happen to know it.',
        totalFetched: 'Cursor mode: how many rows are showing, when pages differ in size.',
      },
      related: ['LoadMore', 'Table', 'DataGrid'],
    },
    {
      component: 'LoadMore',
      summary: 'Adds the next page to the bottom of a list, by scrolling or with a button.',
      use: {
        when: ['A feed people read from the top down'],
        instead: [{ name: 'PaginationBar', why: 'people need to find their way back to a place' }],
      },
      playground: {
        example: 'LoadMorePlay',
        code: '<LoadMore{props} loading={loading.value} done={done()} onLoad={load} />',
        stage: 'narrow',
        height: 300,
        knobs: [
          { prop: 'auto', control: 'switch', initial: false, default: true },
          { prop: 'message', control: 'text', initial: 'That is every project.', default: '' },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'LoadMoreOnPress', title: 'With a button', note: '`auto={false}` waits for a press. Draw your own loading rows while `loading` is on.', stage: 'narrow', height: 300 },
          { id: 'LoadMoreScrolling', title: 'While scrolling', note: 'Loads as the end comes near. Pass `root` when the list scrolls in its own box.', stage: 'narrow', height: 280 },
        ] },
        { kind: 'states', title: 'States', examples: [
          { id: 'LoadMoreLoading', title: 'Loading', note: 'The button stays, disabled, and the words are announced.' },
          { id: 'LoadMoreDone', title: 'Nothing left', note: '`done` swaps the button for your `message`.' },
        ] },
      ],
      a11yNotes: ['The button is always there, even with `auto`, so nobody depends on scrolling.', 'The message is announced as it changes.'],
      propDocs: {
        onLoad: 'Called when more is wanted, by a press or by reaching the end.',
        loading: 'A page is on its way. Stops further calls.',
        done: 'There is nothing left. Removes the button.',
        message: 'Words beside the button, or in its place once `done`.',
        auto: 'Load when the end scrolls into view.',
        root: 'The box that scrolls, if it isn\'t the window.',
      },
      related: ['PaginationBar', 'VirtualList', 'Feed'],
    },
    {
      component: 'Link',
      summary: 'Text that goes to another page.',
      use: {
        when: ['The press takes people somewhere else'],
        instead: [{ name: 'Button', why: 'the press changes something here' }, { name: 'Nav', why: 'it is one of a set of page links' }],
      },
      playground: {
        example: 'LinkPlay',
        code: '<Link href="/toolkit/button"{props}>{children}</Link>',
        knobs: [
          { prop: 'children', control: 'text', label: 'Label', initial: 'Read the guide', default: '' },
          { prop: 'subtle', control: 'switch', initial: false, default: false },
          { prop: 'external', control: 'switch', initial: false, default: false },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'LinkInText', title: 'In a sentence', note: 'Underlined, so it reads as a link without colour.', stage: 'narrow' },
          { id: 'LinkSubtle', title: 'Subtle', note: '`subtle` takes the colour of the text around it.', stage: 'narrow' },
          { id: 'LinkExternal', title: 'External', note: '`external` opens a new tab, and tells screen readers it will.' },
        ] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'LinkCardAction', title: 'The next step on a card', note: 'A `Link` inside a card points to the next step.', stage: 'narrow', height: 220 },
          { id: 'LinkFooter', title: 'Footer links', note: 'Use `subtle` for quiet links and `external` for ones that leave the site.' },
        ] },
      ],
      keyboard: [['Enter', 'Follows the link']],
      a11yNotes: ['Write link text that makes sense alone: "Read the guide", not "click here".'],
      propDocs: {
        href: 'Where it goes.',
        subtle: 'Takes the surrounding text colour.',
        external: 'Opens in a new tab with `rel="noopener noreferrer"`, and says so to screen readers.',
      },
      related: ['Button', 'Nav'],
    },
  ],
}
