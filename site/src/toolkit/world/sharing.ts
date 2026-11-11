import type {
  Version,
  ShareMember,
  ShareContact,
} from '@kerf-js/veneer'
import {
  MARA,
  JUN,
  LENA,
  PRIYA,
  TOMAS,
  SAM,
} from './peers'

export const VERSIONS: Version[] = [
  {
    id: 'v5',
    title: 'Current',
    meta: 'Jun, Lena, you · now',
    current: true,
  },
  {
    id: 'v4',
    title: 'After the d-4819 review',
    meta: 'Jun · 10:02',
    named: true,
  },
  { id: 'v3', title: 'Autosave', meta: 'You · 09:41' },
  {
    id: 'v2',
    title: 'Autosave',
    meta: 'Lena · Yesterday',
  },
  {
    id: 'v1',
    title: 'First draft',
    meta: 'Sam · Mon',
    named: true,
  },
]

export const SHARE_MEMBERS: ShareMember[] = [
  { ...MARA, email: 'mara@kerf.dev', role: 'owner' },
  { ...JUN, email: 'jun@kerf.dev', role: 'editor' },
  { ...LENA, email: 'lena@kerf.dev', role: 'commenter' },
]

export const SHARE_PEOPLE: ShareContact[] = [
  { ...PRIYA, email: 'priya@kerf.dev' },
  { ...TOMAS, email: 'tomas@kerf.dev' },
  { ...SAM, email: 'sam@kerf.dev' },
]
