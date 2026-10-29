// A user card (research 20 §4.1): avatar image, two fonts (Inter and Lora italic), radius, border and shadow.
export interface AvatarProps {
  name: string
  bio: string
  avatar: string
  stats: { label: string; value: string }[]
  site: { name: string }
}

export function AvatarCard(props: AvatarProps) {
  return (
    <div style={{ 'box-sizing': 'border-box', display: 'flex', 'align-items': 'center', width: '100%', height: '100%', padding: '64px', background: 'radial-gradient(circle at 20% 30%, #2a2350 0%, #0b0b0f 70%)', color: 'white', 'font-family': 'Inter' }}>
      <img src={props.avatar} width={240} height={240} style={{ 'border-radius': '120px', border: '6px solid #7c6cff', 'box-shadow': '0 12px 48px rgba(124,108,255,0.45)', 'object-fit': 'cover' }} />
      <div style={{ display: 'flex', 'flex-direction': 'column', 'margin-left': '56px', flex: '1' }}>
        <h1 style={{ margin: '0', 'font-size': '76px', 'font-weight': '700', 'letter-spacing': '-1.5px' }}>{props.name}</h1>
        <p style={{ margin: '12px 0 0 0', 'font-family': 'Lora', 'font-style': 'italic', 'font-size': '34px', color: '#cfcae8' }}>{props.bio}</p>
        <div style={{ display: 'flex', 'margin-top': '40px' }}>
          {props.stats.map(s => (
            <div key={s.label} style={{ display: 'flex', 'flex-direction': 'column', 'margin-right': '48px', padding: '16px 24px', 'border-radius': '16px', 'background-color': 'rgba(255,255,255,0.08)' }}>
              <span style={{ 'font-size': '36px', 'font-weight': '700' }}>{s.value}</span>
              <span style={{ 'font-size': '22px', color: '#9a96b8', 'text-transform': 'uppercase', 'letter-spacing': '2px' }}>{s.label}</span>
            </div>
          ))}
        </div>
        <p style={{ margin: '36px 0 0 0', 'font-size': '26px', opacity: '0.6' }}>{props.site.name}</p>
      </div>
    </div>
  )
}
