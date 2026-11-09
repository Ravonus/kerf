import type { Doc } from '../../types.ts'

export const navigation: Doc[] = [
  {
    component: 'Tabs',
    summary: 'Switches between views of the same thing, one at a time.',
    use: {
      when: [
        'Three to seven views of one thing, where people only need one at a time',
        'Filtering one list by a single value, with the pill variant',
      ],
      instead: [
        { name: 'Nav', why: 'each view is its own page with its own URL' },
        { name: 'Segmented', why: 'it is a form value, with no panel under it' },
        { name: 'Accordion', why: 'people may want several sections open' },
      ],
    },
    playground: {
      example: 'TabsPlay',
      code: '<Tabs label="Project"{props} value={tab.value} onChange={v => (tab.value = v)} options={SECTIONS}>\n  {v => <Text>{WORDS[v]}</Text>}\n</Tabs>',
      stage: 'fill',
      knobs: [
        {
          prop: 'variant',
          control: 'segmented',
          options: ['line', 'pill', 'enclosed'],
          initial: 'line',
          default: 'line',
        },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'TabsLine',
            title: 'Line',
            note: 'The default. A bar slides to the selected tab.',
            stage: 'fill',
            height: 170,
          },
          {
            id: 'TabsPill',
            title: 'Pill',
            note: 'Every tab shares one panel, so it suits a filter.',
            stage: 'fill',
            height: 170,
          },
          {
            id: 'TabsEnclosed',
            title: 'Enclosed',
            note: 'The panel gets a box of its own.',
            stage: 'fill',
            height: 190,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'TabsOverflow',
            title: 'More tabs than room',
            note: 'The row scrolls with faded edges and keeps the selected tab in view.',
            stage: 'narrow',
            height: 170,
          },
          {
            id: 'TabsDisabled',
            title: 'A disabled tab',
            note: 'Set `disabled` on the option. Arrow keys skip it.',
            stage: 'fill',
            height: 170,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'TabsProjectPage',
            title: 'A project page',
            note: 'Tabs switch between the sections of one page, with `options` listing the sections and `value` the current one.',
            stage: 'fill',
            height: 300,
          },
          {
            id: 'TabsFilterList',
            title: 'Filtering a list',
            note: 'Use `variant` set to `pill` for a compact set of filters above a list.',
            stage: 'narrow',
            height: 300,
          },
        ],
      },
    ],
    keyboard: [
      ['← →', 'Moves to the next tab and selects it'],
      ['Home End', 'Jumps to the first or last tab'],
      ['Tab', 'Moves into the panel'],
    ],
    a11yNotes: [
      'Only the selected tab is in the tab order, and each tab points at its panel.',
      'In the `pill` variant every tab controls the one shared panel.',
    ],
    propDocs: {
      label: 'The name screen readers give the row of tabs.',
      value: 'The selected tab. You own this value.',
      onChange: 'Called with the tab that was picked.',
      options: 'The tabs: `value`, `label` and optionally `disabled`.',
      children: "A function from a tab's value to its panel.",
    },
    related: ['Nav', 'Segmented', 'Accordion'],
  },
  {
    component: 'Accordion',
    summary: 'A stack of headings that open to show more.',
    use: {
      when: [
        'Long answers where people want only one or two',
        'Optional settings that can stay out of the way',
      ],
      instead: [
        { name: 'Tabs', why: 'the sections are peers and only one is read at a time' },
        { name: 'Drawer', why: 'the extra content is a task of its own' },
      ],
    },
    playground: {
      example: 'AccordionPlay',
      code: "<Accordion{props} defaultOpen={['rollback']} items={QUESTIONS} />",
      stage: 'narrow',
      height: 300,
      knobs: [
        {
          prop: 'variant',
          control: 'segmented',
          options: ['boxed', 'line'],
          initial: 'boxed',
          default: 'boxed',
        },
        { prop: 'multiple', control: 'switch', initial: false, default: false },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'AccordionBoxed',
            title: 'Boxed',
            note: 'The default. Opening one closes the last.',
            stage: 'narrow',
            height: 280,
          },
          {
            id: 'AccordionLine',
            title: 'Line',
            note: 'Hairlines only, for inside a card.',
            stage: 'narrow',
            height: 280,
          },
          {
            id: 'AccordionMultiple',
            title: 'Several open',
            note: '`multiple` leaves the others alone.',
            stage: 'narrow',
            height: 320,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'AccordionDisabled',
            title: 'A disabled item',
            note: 'Set `disabled` on the item, and say why in its title.',
            stage: 'narrow',
            height: 220,
          },
          {
            id: 'AccordionHeardChange',
            title: 'Hearing what is open',
            note: '`onChange` gets the open values each time.',
            stage: 'narrow',
            height: 300,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'AccordionSettings',
            title: 'Project settings',
            note: "An item's `content` can be any JSX.",
            stage: 'narrow',
            height: 320,
          },
        ],
      },
    ],
    keyboard: [
      ['Enter', 'Opens or closes the focused item'],
      ['Space', 'Opens or closes the focused item'],
      ['↑ ↓', 'Moves between headings'],
      ['Home End', 'Jumps to the first or last heading'],
    ],
    a11yNotes: [
      'Each title is a real button inside a heading. Set `level` so the heading fits the page outline.',
    ],
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
      when: [
        'Links to the pages of an app or a section',
        'A table of contents that follows the reader',
      ],
      instead: [
        { name: 'Tabs', why: 'the views swap in place and have no URL' },
        { name: 'Menu', why: 'the links run actions, or there are too many to show' },
      ],
    },
    playground: {
      example: 'NavPlay',
      code: '<Nav label="Project"{props}>\n  <a href="/overview">Overview</a>\n  <a href="/deploys" aria-current="page">Deploys</a>\n  <a href="/logs">Logs</a>\n  <a href="/settings">Settings</a>\n</Nav>',
      knobs: [
        { prop: 'axis', control: 'segmented', options: ['x', 'y'], initial: 'x', default: 'x' },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'NavAcross',
            title: 'A row',
            note: 'Mark the current page with `aria-current`. `Link` from `@weft-js/start` does that for you.',
          },
          {
            id: 'NavDown',
            title: 'A column',
            note: '`axis="y"` puts the bar beside the links.',
            height: 220,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'NavProductHeader',
            title: 'App header',
            note: 'Put `Nav` links beside a title, and set `aria-current` on the link for the current page.',
            stage: 'fill',
          },
          {
            id: 'NavSettings',
            title: 'Settings pages',
            note: 'Use `axis="y"` to stack the links down the side, with `aria-current` marking the current page.',
            stage: 'fill',
            height: 220,
          },
          {
            id: 'NavContents',
            title: 'Table of contents',
            note: '`spy` lights the link whose heading is at the top of the window. Scroll to watch it move.',
            stage: 'fill',
            height: 380,
          },
        ],
      },
    ],
    keyboard: [
      ['Tab', 'Moves between links'],
      ['Enter', 'Follows the link'],
    ],
    a11yNotes: [
      '`label` names the landmark, so a page with two navs can tell them apart.',
      'The links are plain anchors. `aria-current` is what announces the page, as well as moving the bar.',
    ],
    propDocs: {
      label: 'The name of the navigation landmark.',
      axis: '`x` for a row, `y` for a column.',
      spy: 'Follow the headings the links point at, for a table of contents.',
    },
    related: ['Tabs', 'Link', 'Shell'],
  },
]
