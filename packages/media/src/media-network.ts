/** Browser connection hints; absent hints retain ordinary quality. */
export interface MediaConnection {
  saveData?: boolean
  effectiveType?: string
  downlink?: number
  rtt?: number
}

/** Read only the browser's public network-quality hints. */
export function mediaConnection(): MediaConnection {
  return (navigator as Navigator & { connection?: MediaConnection }).connection ?? {}
}

/** Reserve the smallest rendition for genuinely slow connections. */
export function slowMediaConnection(connection: MediaConnection): boolean {
  return (
    connection.saveData === true ||
    /^(slow-2g|2g)$/.test(connection.effectiveType ?? '') ||
    (connection.downlink !== undefined && connection.downlink > 0 && connection.downlink < 0.75)
  )
}

/** The initial bandwidth estimate avoids forcing every normal connection through a blurry rung. */
export function mediaBandwidth(connection: MediaConnection): number {
  if (slowMediaConnection(connection)) return 200_000
  return connection.downlink && connection.downlink > 0 ? connection.downlink * 700_000 : 5_000_000
}

/** Choose a rendition that fits the displayed artwork and the available connection. */
export function initialMediaLevel(
  levels: readonly { width?: number; height?: number; bitrate?: number }[],
  width: number,
  height: number,
  connection: MediaConnection = {},
  pixelRatio = 1,
): number {
  if (slowMediaConnection(connection) || !levels.length) return 0
  const scale = Math.min(1.75, Math.max(1, pixelRatio))
  const affordable = levels
    .map((level, index) => ({ level, index }))
    .filter(({ level }) => !level.bitrate || level.bitrate <= mediaBandwidth(connection))
  const choices = affordable.length ? affordable : [{ level: levels[0]!, index: 0 }]
  return (choices.find(
    ({ level }) => (level.width ?? 0) >= width * scale && (level.height ?? 0) >= height * scale,
  ) ?? choices.at(-1))!.index
}
