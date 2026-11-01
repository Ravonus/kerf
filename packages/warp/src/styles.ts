// The shared base every warp component loads first: the spec tokens, base and signature layers (ui-core/styles/
// warp.css), an app's seed and field defaults from warp() (weft:tokens/warp, empty without the plugin), and the
// components' plumbing (tone channels, icon strokes, kbd, panels). `links.css` is warp's colour for a bare `<a>`.
import '@weft/ui-core/styles/warp.css'
import 'weft:tokens/warp'
import '@weft/ui-core/styles/components/base.css'
import './links.css'
