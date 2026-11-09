// Build and verify the engine's joint class tables.
export function createClasses({ U, maps, perMap, inA, alphabet, ruleTables, varints }) {
  // gecko/char shares chromium/char; apple/line etc. have their own maps
  // --- class maps: out-of-alphabet code points copy the previous in-alphabet class (merges runs)
  if (alphabet)
    for (const m of maps) {
      if (ruleTables[m]) {
        // already remapped; fill gaps
        const a = perMap[m]
        let prev = 0
        for (let c = 0; c < 0x110000; c++) {
          if (inA(c)) prev = a[c]
          else a[c] = prev
        }
      } else {
        const a = perMap[m]
        let prev = 0
        for (let c = 0; c < 0x110000; c++) {
          if (inA(c)) prev = a[c]
          else a[c] = prev
        }
      }
    }
  const { classRunsV, remapBytes, jointCount, runList } = jointClasses(maps, perMap, varints)
  const classMaps = {}
  for (const [mi, m] of maps.entries()) {
    const t = U.unpackClassRuns(
      U.unpackVarints(classRunsV),
      remapBytes.subarray(mi * jointCount),
      0x1100,
    )
    let max = 0
    for (const v of t.index) if (v > max) max = v
    classMaps[m] = [mi, max + 1]
    // verify
    for (let c = 0; c < 0x110000; c++)
      if (t.values[(t.index[c >> 8] << 8) | (c & 0xff)] !== perMap[m][c])
        throw new Error('class verify failed ' + m)
  }
  return { classMaps, classRunsV, remapBytes, jointCount, runList }
}

function jointClasses(maps, perMap, varints) {
  // joint classes
  const tuple = new Map(),
    joint = new Int32Array(0x110000)
  const tuples = []
  for (let c = 0; c < 0x110000; c++) {
    const key = maps.map((m) => perMap[m][c]).join(',')
    let j = tuple.get(key)
    if (j === undefined) {
      j = tuples.length
      tuple.set(key, j)
      tuples.push(key.split(',').map(Number))
    }
    joint[c] = j
  }
  const runList = []
  for (let c = 0; c < 0x110000;) {
    let e = c
    while (e + 1 < 0x110000 && joint[e + 1] === joint[c]) e++
    runList.push(e - c, joint[c])
    c = e + 1
  }
  const jointCount = tuples.length
  const remapBytes = new Uint8Array(maps.length * jointCount)
  maps.forEach((m, mi) =>
    tuples.forEach((t, j) => {
      remapBytes[mi * jointCount + j] = t[mi]
    }),
  )
  const classRunsV = varints(runList)
  return { classRunsV, remapBytes, jointCount, runList }
}
