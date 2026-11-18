/** A private in-process request to initialize the SSR service before the Node listener starts. */
export const BOOT_REQUEST: unique symbol
/** Whether the owned Node listener is draining. */
export function isDraining(): boolean
/** Register a named cleanup step with the owned server, when present. */
export function onShutdown(name: string, stop: () => unknown, phase?: 'drain' | 'cleanup'): void
