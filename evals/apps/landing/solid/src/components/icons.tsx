import type { JSX } from "solid-js";

function Icon(props: { class?: string; children: JSX.Element }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class ?? "size-5"}
    >
      {props.children}
    </svg>
  );
}

export const Check = (p: { class?: string }) => <Icon class={p.class}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>;
export const Mic = (p: { class?: string }) => <Icon class={p.class}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Icon>;
export const Layers = (p: { class?: string }) => <Icon class={p.class}><path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5" /></Icon>;
export const Quote = (p: { class?: string }) => <Icon class={p.class}><path d="M21 12a8 8 0 0 1-11.7 7.1L4 20.5l1.4-5.3A8 8 0 1 1 21 12z" /></Icon>;
export const Bell = (p: { class?: string }) => <Icon class={p.class}><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9zM10 20a2.2 2.2 0 0 0 4 0" /></Icon>;
export const Lock = (p: { class?: string }) => <Icon class={p.class}><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></Icon>;
export const Plug = (p: { class?: string }) => <Icon class={p.class}><path d="M9 3v5M15 3v5M6.5 8h11v3a5.5 5.5 0 0 1-11 0zM12 16.5V21" /></Icon>;
export const Chevron = (p: { class?: string }) => <Icon class={p.class}><path d="m6 9 6 6 6-6" /></Icon>;
