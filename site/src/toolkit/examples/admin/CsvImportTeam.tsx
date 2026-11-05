import { CsvImport } from '@weft-js/warp'
import { IMPORT_SAMPLE, IMPORT_TARGETS } from '../../world'
import { wait } from './shared'

export function CsvImportTeam() {
  const run = async (_: Record<string, string>[], progress: (percent: number) => void) => {
    for (const percent of [20, 45, 70, 100]) {
      await wait(350)
      progress(percent)
    }
  }
  return <CsvImport targets={IMPORT_TARGETS} sample={IMPORT_SAMPLE} onImport={run} />
}
