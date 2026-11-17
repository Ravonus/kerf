import type { Renderer } from '@takumi-rs/core'
/** Font bytes used by both the native card renderer and its browser preview. */
export interface CardFont {
  name: string
  data: Uint8Array
  weight?: number
  style?: 'normal' | 'italic'
}
/** A card style or image problem reported without hiding the rest of the card. */
export interface CardDiagnostic {
  code: string
  severity: string
  message: string
  element?: string
}
/** Limits and authorization for images loaded by the server-side card renderer. */
export interface CardImages {
  cacheBytes?: number
  timeoutMs?: number
  maxBytes?: number
  allow?: (url: URL) => boolean | Promise<boolean>
}
/** Styles applied identically in the image and the preview. */
export const PREFLIGHT: string
/** Default share-card dimensions. */
export const SIZE: { width: number; height: number }
/** Render the server's HTML to PNG bytes. */
export function renderCard(
  html: string,
  size?: { width?: number; height?: number },
  fonts?: CardFont[],
  options?: {
    strict?: boolean
    onDiagnostic?: (diagnostic: CardDiagnostic) => void
    images?: CardImages
  },
): Promise<Uint8Array<ArrayBuffer>>
/** A reusable native or WASM card renderer. */
export function createCardRenderer(options: {
  backend: { Renderer: typeof Renderer }
  fonts?: CardFont[]
  images?: CardImages
}): Promise<{
  check(html: string): Promise<CardDiagnostic[]>
  render(
    html: string,
    options?: {
      width?: number
      height?: number
      format?: 'png' | 'jpeg' | 'webp' | 'svg'
      quality?: number
      strict?: boolean
    },
  ): Promise<{
    body: Uint8Array<ArrayBuffer> | string
    type: string
    diagnostics: CardDiagnostic[]
  }>
}>
/** Cache a generated, content-addressed share card. */
export function cardResponse(
  card: { body: BodyInit; type: string },
  options?: { dev?: boolean },
): Response
/** Show a card with the same font bytes and dimensions in a browser. */
export function previewHtml(
  html: string,
  options?: { fonts?: CardFont[]; width?: number; height?: number },
): string
