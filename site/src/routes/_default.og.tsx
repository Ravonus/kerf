import type { OgProps } from '@weft/start'
import art from '../generated/card-art.json'

/** Every page's share card: the hero's dither and the woven mark, with the page's own title and sentence. */
export default function Card(props: OgProps) {
  return (
    <div style="display:flex;position:relative;width:100%;height:100%;background-color:#0b120d;color:#f2f0e8;font-family:Inter">
      <img src={art.src} alt="" width="1200" height="630" style="position:absolute;left:0;top:0;width:1200px;height:630px" />
      <div style="display:flex;flex-direction:column;justify-content:space-between;position:relative;width:620px;height:100%;padding:56px 0 56px 64px">
        <div style="display:flex;flex-direction:column">
          <h1 style="margin:0;font-size:56px;line-height:1.05;font-weight:700;font-family:Space Grotesk">{props.title.replace(/ · weft$/, '')}</h1>
          <p style="margin:24px 0 0 0;font-size:26px;line-height:1.4;color:#b9bfb4">{props.description}</p>
        </div>
        <p style="margin:0;font-size:30px;font-weight:700;color:#6ee7a0;font-family:Space Grotesk">{props.site.name}</p>
      </div>
    </div>
  )
}
