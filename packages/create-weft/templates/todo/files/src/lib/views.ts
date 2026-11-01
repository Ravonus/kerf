export const views = {
  all: { label: 'All', title: 'Everything', href: '/todos' },
  active: { label: 'Active', title: 'Still to do', href: '/todos?filter=active' },
  done: { label: 'Done', title: 'Finished', href: '/todos?filter=done' },
}

export type View = keyof typeof views

export const viewOf = (url: string): View => {
  const filter = new URL(url).searchParams.get('filter')
  return filter === 'active' || filter === 'done' ? filter : 'all'
}
