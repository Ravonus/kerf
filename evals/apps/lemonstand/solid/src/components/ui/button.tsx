import type { JSX } from "solid-js";

import { cx } from "./cx";

/*
 * Buttons. Every size is ≥ 44px tall. Variants:
 * - primary: amber fill (chrome register) — the default call to action.
 * - ink: warm near-black, for quieter primary moments and dark-on-light balance.
 * - lemon: kid register. Lemon fill, navy text, sticker edge. Use near Lemon / on navy.
 * - secondary: outlined surface.
 * - ghost: text-only with hover wash (nav, tertiary).
 * - inverse: for navy/ink bands (white outline).
 */
const VARIANTS = {
  primary: "bg-primary text-primary-fg shadow-xs hover:bg-primary-hover",
  ink: "bg-contrast text-contrast-fg shadow-xs hover:bg-contrast/90",
  lemon:
    "bg-lemon text-navy ring-2 ring-navy shadow-sticker hover:-translate-y-0.5 hover:shadow-[0_5px_0_0_var(--color-navy)] active:translate-y-0.5 active:shadow-none",
  secondary: "bg-surface text-ink ring-1 ring-line-strong hover:ring-ink/40 hover:bg-sunken",
  ghost: "text-ink hover:bg-ink/5",
  inverse: "text-white ring-1 ring-white/35 hover:bg-white/10 hover:ring-white/60",
} as const;

const SIZES = {
  md: "min-h-11 px-4.5 text-[0.95rem] gap-2",
  lg: "min-h-13 px-6 text-base gap-2.5",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

export function buttonStyles({
  variant = "primary",
  size = "md",
  full,
  class: className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  class?: string;
} = {}) {
  return cx(
    "inline-flex items-center justify-center rounded-control font-semibold whitespace-nowrap select-none",
    "transition-[background-color,box-shadow,transform,color] duration-[130ms] ease-out",
    "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring",
    "disabled:pointer-events-none disabled:opacity-60",
    VARIANTS[variant],
    SIZES[size],
    full && "w-full",
    className,
  );
}

type Common = { variant?: ButtonVariant; size?: ButtonSize; full?: boolean; class?: string };

export function ButtonLink(props: Common & { href: string; children?: JSX.Element }) {
  return (
    <a
      href={props.href}
      class={buttonStyles({ variant: props.variant, size: props.size, full: props.full, class: props.class })}
    >
      {props.children}
    </a>
  );
}
