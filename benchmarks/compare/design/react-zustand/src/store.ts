import { create } from 'zustand'

export type Status = 'Active' | 'Trial' | 'Past due'
export type Customer = {
  id: number
  name: string
  email: string
  plan: 'Starter' | 'Team' | 'Enterprise'
  status: Status
}

const seed: Customer[] = [
  { id: 1, name: 'Ada Whitfield', email: 'ada@whitfield.co', plan: 'Team', status: 'Active' },
  {
    id: 2,
    name: 'Marcus Okafor',
    email: 'marcus@okafor-labs.com',
    plan: 'Enterprise',
    status: 'Active',
  },
  { id: 3, name: 'Priya Raman', email: 'priya@lumenworks.io', plan: 'Starter', status: 'Trial' },
  { id: 4, name: 'Tomás Herrera', email: 'tomas@herrera.dev', plan: 'Team', status: 'Past due' },
  { id: 5, name: 'Linnea Berg', email: 'linnea@fjordgoods.se', plan: 'Starter', status: 'Active' },
  {
    id: 6,
    name: 'Hiro Tanaka',
    email: 'hiro@tanaka-studio.jp',
    plan: 'Enterprise',
    status: 'Active',
  },
  { id: 7, name: 'Chloe Dubois', email: 'chloe@maisondubois.fr', plan: 'Team', status: 'Trial' },
  { id: 8, name: 'Samuel Adeyemi', email: 'sam@adeyemi.ng', plan: 'Starter', status: 'Past due' },
  { id: 9, name: 'Nora Lindqvist', email: 'nora@northfield.no', plan: 'Team', status: 'Active' },
  {
    id: 10,
    name: 'Declan Murphy',
    email: 'declan@murphyfreight.ie',
    plan: 'Enterprise',
    status: 'Past due',
  },
  {
    id: 11,
    name: 'Imani Brooks',
    email: 'imani@brooksandco.com',
    plan: 'Starter',
    status: 'Trial',
  },
  { id: 12, name: 'Felix Wagner', email: 'felix@wagner-tech.de', plan: 'Team', status: 'Active' },
]

type CustomerState = { customers: Customer[]; remove: (id: number) => void }

export const useCustomers = create<CustomerState>((set) => ({
  customers: seed,
  remove: (id) => set((s) => ({ customers: s.customers.filter((c) => c.id !== id) })),
}))
