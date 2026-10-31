// The other cursors, drawn over the page: `aria-hidden`, gliding 120 ms, and instant under reduced motion (warp 07 §6.3).
import { hue, type Cursors as Tracker } from './index'

const CSS = `[data-scope=cursors]{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:2147483000}
[data-scope=cursors] [data-part=cursor]{position:absolute;left:0;top:0;transition:transform 120ms linear,opacity 300ms}
[data-scope=cursors] [data-part=name]{margin-left:10px;padding:1px 6px;border-radius:6px;font:12px/1.4 system-ui;color:#fff}
@media (prefers-reduced-motion:reduce){[data-scope=cursors] [data-part=cursor]{transition:none}}`

export function Cursors<S>(props: { of: Tracker<S> }) {
  return (
    <div aria-hidden="true" data-scope="cursors">
      <style>{CSS}</style>
      {props.of.list.value.map(c => {
        const color = `hsl(${hue(c.peer?.user.id ?? c.id)} 80% 45%)`
        return (
          <div key={c.id} data-part="cursor" data-peer={c.id} style={`transform:translate(${c.left}px,${c.top}px);opacity:${c.idle ? 0.25 : 1};color:${color}`}>
            <svg width="16" height="18" viewBox="0 0 16 18"><path fill="currentColor" stroke="#fff" d="M1 1l5 15 2.5-6L15 8z" /></svg>
            {c.peer?.user.name && <span data-part="name" style={`background:${color}`}>{c.peer.user.name}</span>}
          </div>
        )
      })}
    </div>
  )
}
