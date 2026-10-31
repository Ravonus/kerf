import { create } from 'zustand'
import { projects, type Project } from '../../shared/data'

export const useProjects = create<{ rows: Project[]; tick: () => void }>(set => ({
  rows: projects,
  tick: () => set(s => ({ rows: s.rows.map(r => (r.id === 'p0' ? { ...r, budget: r.budget + 1 } : r)) })),
}))
