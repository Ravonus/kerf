// specialize.mjs: the "rare" pack for gecko.
import { __packs } from './packs.js'
import * as m0 from './analysis.rare.js'
import * as m1 from './gecko-line-breaks.rare.js'
import * as m2 from './han-kerning.rare.js'
import * as m3 from './line-breaks.rare.js'
import * as m4 from './measurement.rare.js'
import * as m5 from './prepare.rare.js'
Object.assign(__packs, m0, m1, m2, m3, m4, m5)
