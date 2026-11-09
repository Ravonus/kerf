import type { Doc } from '../../types.ts'

/** Side navigation and main navigation: two different menus (Warp 02 §5). */
export const menus: Doc[] = [
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
  {
    component: 'SideNavTitle',
    summary:
      "The header's brand word, which gives way to the open SideNav's title on a phone: the logo stays, the word slides.",
    use: {
      when: ['A docs site whose SideNav opens below the header on a phone (`overlay="under"`)'],
      instead: [
        {
          name: 'SideNav',
          why: 'the panel covers the header (`overlay="cover"`) and titles itself',
        },
      ],
    },
    sections: [],
    keyboard: [],
    a11yNotes: ['The title is `aria-hidden`: the panel is already named by its landmark label.'],
    propDocs: {
      title: "The open SideNav's title.",
      children:
        'What the header shows the rest of the time, usually the brand word (keep the logo outside it).',
    },
    related: ['SideNav', 'HamburgerMenu'],
  },
]
