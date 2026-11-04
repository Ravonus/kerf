// Not timed: CSS outside the flex subset (research 20 §4.1), to see what each renderer gets wrong. The left column is
// plain block layout (no display:flex), which Satori requires on every element with more than one child.
export interface StressProps {
  title: string
  user: string
  count: number
}

export function StressCard(props: StressProps) {
  return (
    <div style="display:flex;width:100%;height:100%;background:#fafaf7;color:#111;font-family:Inter;font-size:24px">
      <div style="width:50%;padding:32px">
        <h2 style="font-size:36px;margin:0 0 12px 0">Block layout</h2>
        <p style="margin:0">
          Hello, {props.user}! You have {props.count} new <b>bold</b> and{' '}
          <i style="font-family:Lora">italic</i> items.
        </p>
        <p style="margin:16px 0 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:420px">
          {props.title}
        </p>
        <p style="margin:16px 0 0 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;width:420px">
          {props.title} {props.title}
        </p>
        <ul style="margin:16px 0 0 0">
          <li>first item</li>
          <li>second item</li>
        </ul>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;width:50%;padding:32px">
        <div style="background:#7c6cff;color:white;padding:16px;transform:rotate(-4deg)">
          grid + rotate
        </div>
        <div style="background:#ff6c8a;color:white;padding:16px;filter:blur(2px)">filter: blur</div>
        <div style="padding:16px;text-shadow:0 2px 6px rgba(0,0,0,0.5);font-weight:700">
          text-shadow
        </div>
        <div style="padding:16px;border:4px dashed #333;border-radius:12px">dashed border</div>
        <div style="padding:16px;background:conic-gradient(#7c6cff,#ff6c8a,#7c6cff);color:white">
          conic gradient
        </div>
        <div style="padding:16px;opacity:0.5;background:#333;color:white;-webkit-text-stroke:1px #ff6c8a">
          opacity + text-stroke
        </div>
      </div>
    </div>
  )
}
