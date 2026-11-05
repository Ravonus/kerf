import type { GridColumn, GridTree, GridView } from '@weft-js/warp'

import { PROJECTS } from '../../world'

import { type Project, money, badge } from './shared-project'

/* -- DataGrid -- */

export const STATUSES = ['Live', 'Building', 'Failed', 'Paused']

export const REGION_NAMES = ['eu-west', 'eu-north', 'us-east', 'us-west', 'ap-south', 'global']

export const GRID: GridColumn<Project>[] = [
  { id: 'name', header: 'Project', rowHeader: true, pin: true, sort: true, filter: 'text' },
  { id: 'status', header: 'Status', sort: true, filter: 'select', options: STATUSES, cell: badge },
  { id: 'region', header: 'Region', sort: true, filter: 'select', options: REGION_NAMES },
  { id: 'owner', header: 'Owner', sort: true, filter: 'text' },
  { id: 'deploys', header: 'Deploys', numeric: true, sort: true, filter: 'min', aggregate: 'sum' },
  {
    id: 'cost',
    header: 'Cost',
    numeric: true,
    sort: true,
    filter: 'min',
    aggregate: 'sum',
    format: (v) => money(Number(v)),
  },
]

export const spend = (rows: Project[]) => `Total ${money(rows.reduce((n, p) => n + p.cost, 0))}`

export const GROUPED_GRID: GridColumn<Project>[] = [
  { id: 'name', header: 'Project', rowHeader: true, pin: true, sort: true, aggregate: spend },
  { id: 'status', header: 'Status', sort: true, filter: 'select', options: STATUSES, cell: badge },
  { id: 'region', header: 'Region', sort: true, filter: 'select', options: REGION_NAMES },
  { id: 'owner', header: 'Owner', sort: true },
  { id: 'cost', header: 'Cost', numeric: true, sort: true, format: (v) => money(Number(v)) },
]

export const NUMBERS: GridColumn<Project>[] = [
  {
    id: 'name',
    header: 'Project',
    rowHeader: true,
    sort: true,
    edit: true,
    validate: (v) => String(v).trim() !== '' || 'A project needs a name',
  },
  { id: 'owner', header: 'Owner', sort: true, edit: true },
  { id: 'deploys', header: 'Deploys', numeric: true, sort: true, aggregate: 'sum' },
  {
    id: 'cost',
    header: 'Budget',
    numeric: true,
    sort: true,
    aggregate: 'sum',
    format: (v) => money(Number(v)),
    edit: (text) => Number(text.replace(/[$,]/g, '')),
    validate: (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0) || 'Enter an amount',
  },
]

export const ORDER = ['name', 'status', 'region', 'owner', 'deploys', 'cost']

export const VIEWS: Record<string, GridView> = {
  'All projects': { order: ORDER, hidden: [], filters: {} },
  'Needs attention': { order: ORDER, hidden: ['deploys'], filters: { status: 'Failed' } },
  Costly: {
    order: ['name', 'cost', 'owner', 'region'],
    hidden: ['status', 'deploys'],
    filters: { cost: '1000' },
    sort: { id: 'cost', dir: 'descending' },
  },
}

export const GROUPED: Record<string, GridView> = {
  'By region': {
    order: ['name', 'status', 'region', 'owner', 'cost'],
    hidden: [],
    filters: {},
    group: true,
  },
}

export type Spend = {
  id: string
  name: string
  deploys: number
  cost: number
  kids?: Spend[] | undefined
  hasChildren?: boolean
}

export const leaf = (p: Project): Spend => ({
  id: p.id,
  name: p.name,
  deploys: p.deploys,
  cost: p.cost,
})

export const team = (name: string, ...ids: string[]): Spend => ({
  id: name,
  name,
  deploys: 0,
  cost: 0,
  kids: PROJECTS.filter((p) => ids.includes(p.id)).map(leaf),
})

export const SPEND: Spend[] = [
  team('Platform', 'billing', 'notifier', 'edge-cache', 'auth'),
  team('Web', 'storefront', 'checkout'),
  team('Data', 'search-api', 'reports', 'ingest'),
  team('Mobile', 'mobile-bff'),
]

export const SPEND_COLUMNS: GridColumn<Spend>[] = [
  { id: 'name', header: 'Team and project', sort: true },
  { id: 'deploys', header: 'Deploys', numeric: true, sort: true, aggregate: 'sum' },
  {
    id: 'cost',
    header: 'Cost',
    numeric: true,
    sort: true,
    aggregate: 'sum',
    format: (v) => money(Number(v)),
  },
]

export const OWN_KIDS: GridTree<Spend> = {}
