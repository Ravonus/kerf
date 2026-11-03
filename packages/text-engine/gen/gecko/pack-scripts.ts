// specialize.mjs: the "scripts" pack for gecko.
import { __packs } from './packs.js'
import * as m0 from './line-breaks.scripts.js'
import * as m1 from './measurement.scripts.js'
import * as m2 from './prepare.scripts.js'
import * as full from './generated/engine-break-data.full.js'
import { installEngineData } from './generated/engine-break-data.js'
import { __resetEngineData as r_line_breaks_ts } from './line-breaks.js'
import { __resetEngineData as r_graphemes_ts } from './graphemes.js'
import { __resetEngineData as r_prepare_ts } from './prepare.js'
import { __resetEngineData as r_gecko_line_breaks_ts } from './gecko-line-breaks.js'
installEngineData(full)
r_line_breaks_ts()
r_graphemes_ts()
r_prepare_ts()
r_gecko_line_breaks_ts()
Object.assign(__packs, m0, m1, m2)
