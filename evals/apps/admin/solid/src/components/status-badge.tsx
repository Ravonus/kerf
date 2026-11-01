const tones: Record<string, string> = {
  paid: "bg-sunken text-ink",
  pending: "bg-warn/15 text-warn",
  shipped: "bg-accent/15 text-accent-text",
  refunded: "bg-danger/10 text-danger",
};

export const StatusBadge = (props: { status: string }) => (
  <span class={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${tones[props.status] ?? tones.paid}`}>{props.status}</span>
);
