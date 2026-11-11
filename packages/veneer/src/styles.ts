/// <reference types="@kerf-js/core/client" />

// The shared base every veneer component loads first: the spec tokens, base and signature layers (veneer-core/styles/
// veneer.css), an app's seed and field defaults from veneer() (kerf:tokens/veneer, empty without the plugin), and the
// components' plumbing (tone channels, icon strokes, kbd, panels), and the skeleton paint. `links.css` is veneer's colour for a bare `<a>`.
// CSS alone: code here would run as every component's module loads, and keep each island holding one from waiting
// (hydration.json H010). veneer.flow is the page's, so the app's client entry arms it (`flow()` from @kerf-js/veneer-core).
import '@kerf-js/veneer-core/styles/veneer.css'
import 'kerf:tokens/veneer'
import '@kerf-js/veneer-core/styles/components/base.css'
import './links.css'
// Every page can show a skeleton: navigation stands a route's generated shape in while it loads, whatever it imports.
import '@kerf-js/veneer-core/styles/components/skeleton.css'
