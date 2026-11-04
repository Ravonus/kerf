// The `image: 'auto'` default card (research 20 §4.1): title, description and site name on theme tokens.
export interface DefaultProps {
  title: string
  description: string
  site: { name: string; url: string }
}

export function DefaultCard(props: DefaultProps) {
  return (
    <div style="box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;width:100%;height:100%;padding:72px 80px;background-image:linear-gradient(135deg,#0b0b0f 0%,#1d1b3a 100%);color:#f5f5f7;font-family:Inter">
      <div style="display:flex;flex-direction:column">
        <h1 style="margin:0;font-size:68px;font-weight:700;line-height:1.1;letter-spacing:-1px">
          {props.title}
        </h1>
        <p style="margin:28px 0 0 0;font-size:32px;line-height:1.4;color:#b4b4c4">
          {props.description}
        </p>
      </div>
      <div style="display:flex;align-items:center;font-size:28px;font-weight:700">
        <div style="width:20px;height:20px;border-radius:10px;background-color:#7c6cff;margin-right:16px" />
        <span>{props.site.name}</span>
        <span style="margin-left:auto;font-weight:400;color:#8a8aa0">{props.site.url}</span>
      </div>
    </div>
  )
}
