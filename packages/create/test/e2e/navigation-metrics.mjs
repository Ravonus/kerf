// Install before input so shifts caused by the navigation are not excluded.
export function observeNavigation() {
  const shifts = []
  let pointerdown
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      shifts.push({ time: entry.startTime, value: entry.value, hadRecentInput: entry.hadRecentInput })
    }
  })
  observer.observe({ type: 'layout-shift', buffered: true })
  const onPointerDown = (event) => {
    if (event.isTrusted && pointerdown === undefined) pointerdown = performance.now()
  }
  addEventListener('pointerdown', onPointerDown, true)
  return {
    get pointerdown() { return pointerdown },
    shiftsSince(time) {
      return shifts.filter((shift) => shift.time >= time)
    },
    close() {
      observer.disconnect()
      removeEventListener('pointerdown', onPointerDown, true)
    },
  }
}

// Recent-input shifts count: navigation is precisely where they matter.
export function totalShift(shifts) {
  return shifts.reduce((sum, shift) => sum + shift.value, 0)
}
