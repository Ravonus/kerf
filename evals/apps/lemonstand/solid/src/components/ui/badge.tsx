import type { JSX } from "solid-js";

import { cx } from "./cx";

const DOT = {
  amber: "bg-primary",
  leaf: "bg-leaf",
  lemon: "bg-lemon ring-1 ring-navy",
  onNavy: "bg-lemon",
} as const;

/** Small uppercase label above headings. Amber dot in chrome, leaf dot in kid contexts. */
export function Eyebrow(props: { children?: JSX.Element; tone?: keyof typeof DOT; class?: string }) {
  const tone = () => props.tone ?? "amber";
  return (
    <p
      class={cx(
        "inline-flex items-center gap-2 text-eyebrow font-semibold uppercase",
        tone() === "onNavy" ? "text-white/80" : "text-muted",
        props.class,
      )}
    >
      <span aria-hidden="true" class={cx("size-1.5 rounded-full", DOT[tone()])} />
      {props.children}
    </p>
  );
}

const BADGE = {
  neutral: "bg-sunken text-ink ring-1 ring-line",
  amber: "bg-gold-soft text-primary-ink ring-1 ring-primary/20",
  leaf: "bg-leaf-soft text-leaf-ink ring-1 ring-leaf/25",
  navy: "bg-navy text-white",
  lemon: "bg-lemon text-navy ring-1 ring-navy/80",
} as const;

/** Pill for statuses, formats and short facts. */
export function Badge(props: { children?: JSX.Element; tone?: keyof typeof BADGE; class?: string }) {
  return (
    <span
      class={cx(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[0.8rem] leading-none font-semibold",
        BADGE[props.tone ?? "neutral"],
        props.class,
      )}
    >
      {props.children}
    </span>
  );
}
