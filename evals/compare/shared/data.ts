// One data set for every stack, so nothing but the stack differs.
export type Project = { id: string; name: string; status: 'Live' | 'Paused' | 'Draft'; owner: string; region: string; budget: number; used: number }
const names = ['Apollo', 'Borealis', 'Cirrus', 'Delta', 'Ember', 'Fathom', 'Gale', 'Halo', 'Ion', 'Juno']
const owners = ['Ana Ruiz', 'Jo Park', 'Sam Lee', 'Noor Ali']
const regions = ['eu-west', 'us-east', 'ap-south', 'us-west']
const statuses = ['Live', 'Paused', 'Draft'] as const
export const projects: Project[] = Array.from({ length: 200 }, (_, i) => ({
  id: `p${i}`, name: `${names[i % 10]} ${i}`, status: statuses[i % 3], owner: owners[i % 4], region: regions[i % 4],
  budget: 1000 + ((i * 7919) % 90000), used: (i * 37) % 100,
}))
/** Rows on a page; the scale test sets ?size=. */
export const pageSize = Number(new URLSearchParams(location.search).get('size')) || 20
export const money = (n: number) => `$${n.toLocaleString('en-US')}`
export const NAV = [{ id: 'projects', label: 'Projects' }, { id: 'people', label: 'People' }, { id: 'reports', label: 'Reports' }]
