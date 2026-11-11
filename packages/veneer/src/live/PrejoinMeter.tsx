const BARS = Array.from({ length: 16 }, (_, i) => i)

export function PrejoinMeter({
  bind,
  level,
}: {
  bind: (n: HTMLDivElement) => void
  level: number | undefined
}) {
  return (
    <div
      ref={bind}
      data-part="meter"
      role="meter"
      aria-label="Microphone level"
      aria-valuemin="0"
      aria-valuemax="16"
      aria-valuenow="0"
      style={level === undefined ? undefined : `--level:${level}`}
    >
      {BARS.map((i) => (
        <i key={i}></i>
      ))}
    </div>
  )
}
