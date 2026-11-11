import type { Availability } from '@kerf/veneer'

export const ON_CALL_HOURS: Availability = {
  week: [1, 2, 3, 4, 5, 6, 0].map((day) => ({
    day,
    on: day > 0 && day < 6,
    ranges: day === 5 ? [[540, 840]] : [[540, 1020]],
  })),
  overrides: [
    {
      id: 'o1',
      date: '2026-12-24',
      ranges: null,
      note: 'Christmas Eve',
    },
    {
      id: 'o2',
      date: '2026-11-13',
      ranges: [[540, 780]],
      note: 'Half day',
    },
  ],
}
