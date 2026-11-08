/// <reference types="@weft-js/core/client" />

// The shared base every warp component loads first: the spec tokens, base and signature layers (warp-core/styles/
// warp.css), an app's seed and field defaults from warp() (weft:tokens/warp, empty without the plugin), and the
// components' plumbing (tone channels, icon strokes, kbd, panels), and the skeleton paint. `links.css` is warp's colour for a bare `<a>`.
import { flow } from '@weft-js/warp-core'
import '@weft-js/warp-core/styles/warp.css'
import 'weft:tokens/warp'
import '@weft-js/warp-core/styles/components/base.css'
import './links.css'
// Every page can show a skeleton: navigation stands a route's generated shape in while it loads, whatever it imports.
import '@weft-js/warp-core/styles/components/skeleton.css'

flow()
