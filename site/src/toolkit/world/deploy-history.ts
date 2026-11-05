export const DEPLOYS_BY_DAY: Record<string, number> =
  Object.fromEntries(
    Array.from({ length: 307 }, (_, i) => {
      const day = new Date(Date.UTC(2026, 0, 1 + i))
      const weekend = day.getUTCDay() % 6 === 0
      return [
        day.toISOString().slice(0, 10),
        weekend
          ? i % 5 === 0
            ? 1
            : 0
          : 1 + ((i * 7) % 9),
      ] as const
    }).filter(([, n]) => n > 0),
  )
