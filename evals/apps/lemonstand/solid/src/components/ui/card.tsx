import { cx } from "./cx";

/*
 * Surfaces.
 * - card: chrome default — white surface, hairline, soft ink shadow, 18px radius.
 * - sunken: recessed panel for secondary content.
 * - sticker: kid register — navy 2px edge + hard offset shadow, rounder. Only near Lemon.
 * - navy: dark coach panel.
 */
const SURFACES = {
  card: "bg-surface ring-1 ring-line shadow-card rounded-card",
  sunken: "bg-sunken ring-1 ring-line rounded-card",
  sticker: "bg-surface ring-2 ring-navy shadow-sticker rounded-panel",
  navy: "bg-navy text-white rounded-panel shadow-navy",
} as const;

export type SurfaceVariant = keyof typeof SURFACES;

export function surfaceStyles(variant: SurfaceVariant = "card", className?: string) {
  return cx(SURFACES[variant], className);
}
