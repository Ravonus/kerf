/** Notify Start that Nitro's HTTP server has closed its connections. */
export function serverDrained(): void
/** Stop Start's services and exit after the HTTP server drains on SIGTERM or SIGINT. */
export function onShutdown(stop?: () => unknown): void
