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
  {
    component: 'SideNav',
    summary:
      'A docs sidebar of folding sections, with a collapse bar: docked on wide screens, opened over the page on phones.',
    tileWidth: 320,
    use: {
      when: [
        'The pages of a docs site, a guide or a component library',
        'A list of pages long enough that a reader needs to see where they are in it',
        'On a phone too: it stays as a bar down the left edge, beside the HamburgerMenu that holds the top links',
      ],
      instead: [
        { name: 'Nav', why: 'there are a handful of links and no sections' },
        { name: 'HamburgerMenu', why: "the links are the site's top links on a phone" },
        { name: 'Shell', why: "it is an app's own navigation, with an account menu" },
        { name: 'Accordion', why: 'the sections hold content, not links' },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'SideNavGuide',
            title: 'Sections that fold',
            note: "The section holding `current` starts open and the others folded. What a reader opens or closes is kept in localStorage under `remember`. The bar at the panel's edge folds it to a slim strip and back, and that is kept too. Under 900px only the bar shows, down the left edge, and pressing it brings the panel over the page. Docked, it is `--warp-sidenav-width` wide (240px) and folds to `--warp-sidenav-bar` (28px), so give it an `auto` column; on a phone, start the page that far in.",
            stage: 'fill',
            height: 420,
          },
          {
            id: 'SideNavFilter',
            title: 'With a filter',
            note: '`filter` adds a box that keeps the matching pages and opens every section they are in. Use it for long lists.',
            stage: 'fill',
            height: 420,
          },
        ],
      },
    ],
    keyboard: [
      [
        'Tab',
        'Moves between section headings, links and the bar; on a phone it stays inside the open panel',
      ],
      [
        'Enter or Space',
        'Opens or closes a section; on the bar, folds or unfolds the sidebar, or opens or closes the panel on a phone',
      ],
      ['Escape', 'Closes the panel on a phone'],
    ],
    a11yNotes: [
      '`label` names the navigation landmark and titles the panel.',
      'Each section heading is a button with `aria-expanded` and `aria-controls`. A folded section is `hidden`, so its links leave the tab order.',
      'The current page\'s link has `aria-current="page"`.',
      'The bar is a button named by `label`, with `aria-controls` naming the panel and `aria-expanded` saying whether the sidebar is unfolded, or on a phone whether the panel is open.',
      'On a phone the open panel is a modal dialog labelled by its title: focus moves into it, stays inside, and goes back to the bar when it closes.',
    ],
    propDocs: {
      label: "The name of the navigation landmark, and the panel's title on a phone.",
      collapsible:
        "The collapse bar at the panel's edge. Default true. `false` drops it, and the panel then opens on a phone only from a button whose `aria-controls` names its `id`, with a close button in its head.",
      id: "The panel's id. A button anywhere with `aria-controls` set to it also opens the panel on a phone.",
      sections:
        'The sections, in order: `title`, `items` (`href` and `label`), and `pinned` to keep one always open with a plain heading.',
      current:
        "The current page's `href`. Its link is marked, its section opens, and the rail scrolls to it.",
      filter: 'Adds a filter box. A string is its placeholder.',
      overlay:
        "On a phone, where the open panel sits. `cover` (default) lays it over everything, header included. `under` opens it below the header (`--warp-sidenav-top`) with no title of its own: put a `SideNavTitle` around the brand's word in the header, and that word gives way to the panel's title while it is open.",
      remember:
        "The localStorage key for a reader's folds, and `<key>:collapsed` for whether they folded the sidebar. `false` keeps nothing. Default `warp:sidenav:<label>`.",
    },
    related: ['Nav', 'Shell', 'Drawer', 'HamburgerMenu'],
  },
  {
    component: 'HamburgerMenu',
    summary:
      "A site's main links on a small screen: a button whose bars turn into an X and open a full-screen menu over the page.",
    tileWidth: 320,
    use: {
      when: [
        "A site's top links on a phone, where they no longer fit in the header",
        'Every page of the site, docs pages included: the top links live here on a phone',
      ],
      instead: [
        {
          name: 'SideNav',
          why: "the links are one section's pages, like a component list. On a docs page use both: HamburgerMenu for the site, SideNav for the section",
        },
        { name: 'Drawer', why: 'the panel holds extra content or tools, not links' },
        { name: 'Menu', why: 'the items run actions rather than go to pages' },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'HamburgerSite',
            title: 'Top links',
            note: 'The menu grows from the button as a circle and fills the screen, and the page behind stops scrolling. Pressing a link closes it while the next page loads underneath. Hide the button on wide screens and show the links in the header instead.',
            stage: 'fill',
            height: 120,
          },
        ],
      },
    ],
    keyboard: [
      ['Enter or Space', 'Opens the menu from the button'],
      ['Tab', 'Moves between links; focus stays inside the open menu'],
      ['Escape', 'Closes the menu'],
    ],
    a11yNotes: [
      'The button has `aria-expanded` and `aria-controls`, and `label` names it.',
      'The open menu is a modal dialog: focus moves into it, stays inside, and goes back to the button when it closes.',
      'The current page\'s link has `aria-current="page"`.',
      'With reduced motion the menu fades instead of growing.',
    ],
    propDocs: {
      label: 'Names the button and the menu. Default `Menu`.',
      open: 'A `state(boolean)` to open or close the menu from outside.',
      links: 'The main links, shown large: `href` and `label`.',
      current: "The current page's `href`. Its link is marked.",
      brand: "Shown at the top left of the open menu, usually the site's logo.",
      children: 'Anything under the links, such as a footer. A link here closes the menu too.',
    },
    related: ['SideNav', 'Nav', 'Drawer'],
  },
]
