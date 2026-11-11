export const hours = (m: number) => `calc(var(--veneer-cal-hour) * ${m / 60})`
/** A week day's least width when the whole week fits its box: its head ("Sat" over "7") and a little time to press. */
export const DAY_FIT = 48
