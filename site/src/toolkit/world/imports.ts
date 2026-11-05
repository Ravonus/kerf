export const IMPORT_TARGETS = [
  { id: 'name', label: 'Full name', aliases: ['name'] },
  {
    id: 'email',
    label: 'Email',
    required: true,
    check: (v: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : 'Not a valid email'),
  },
  { id: 'team', label: 'Team' },
  {
    id: 'role',
    label: 'Role',
    check: (v: string) =>
      /^(admin|member|viewer)$/i.test(v) ? undefined : 'Use admin, member or viewer',
  },
]

export const IMPORT_SAMPLE = {
  name: 'weft-team.csv',
  text: 'Name,Email,Team,Role\nDara Nowak,dara@weft.dev,Web,member\nKai Sorensen,kai@weft,Data,member\nAmir Saleh,amir@weft.dev,Mobile,owner\nRosa Delgado,rosa@weft.dev,Platform,admin\n',
}
