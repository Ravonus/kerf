import { SideNav } from '../../src/SideNav'

export const SECTIONS = [
  { title: 'Start', pinned: true, items: [{ href: '/docs', label: 'Overview' }] },
  {
    title: 'Basics',
    items: [
      { href: '/docs/state', label: 'State' },
      { href: '/docs/props', label: 'Props' },
    ],
  },
  {
    title: 'Advanced',
    items: [
      { href: '/docs/effects', label: 'Effects' },
      { href: '/docs/refs', label: 'Refs' },
    ],
  },
]

export const Case = () => (
  <SideNav label="Docs" current="/docs/props" sections={SECTIONS} filter remember="test:sidenav" />
)
