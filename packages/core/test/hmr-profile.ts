// The HMR gate keeps wall and thread CPU costs so a slow gate can distinguish work from waiting.
import { performance as nodePerformance, PerformanceObserver } from 'node:perf_hooks'
import process from 'node:process'
import { threadId } from 'node:worker_threads'

type Cpu = ReturnType<typeof process.cpuUsage>
type Phase = 'transform' | 'prepare' | 'construct' | 'execute' | 'load' | 'flush' | 'query'
type Cost = [wallMs: number, userUs: number | null, systemUs: number | null]
type Sample = {
  sample: number
  component: number
  started: number
  elapsed: number
  cpu: Cpu | null
  phases: Partial<Record<Phase, Cost>>
}

/** Phase boundaries inside one of the original timed HMR samples. */
export interface HmrSample {
  mark(phase: Phase): void
  finish(elapsed: number): void
}

function measure(data: Sample, readCpu: (() => Cpu) | undefined): HmrSample {
  const initial = readCpu?.() ?? null
  let previousCpu = initial
  let previousWall = data.started
  return {
    mark(phase) {
      const cpu = readCpu?.() ?? null
      const wall = performance.now()
      data.phases[phase] = [
        wall - previousWall,
        cpu && previousCpu ? cpu.user - previousCpu.user : null,
        cpu && previousCpu ? cpu.system - previousCpu.system : null,
      ]
      previousCpu = cpu
      previousWall = wall
    },
    finish(elapsed) {
      data.elapsed = elapsed
      const cpu = readCpu?.()
      if (cpu && initial)
        data.cpu = { user: cpu.user - initial.user, system: cpu.system - initial.system }
    },
  }
}

/** Collects the existing gate's samples without yielding until their timing is complete. */
export function profileHmr() {
  const readCpu =
    typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage.bind(process) : undefined
  const samples: Sample[] = []
  const gc: { started: number; duration: number }[] = []
  let gcDropped = 0
  const collect = (entries: ReturnType<PerformanceObserver['takeRecords']>) => {
    const first = samples[0],
      last = samples.at(-1)
    if (!first || !last) return
    for (const entry of entries) {
      const started = entry.startTime + (nodePerformance.timeOrigin - performance.timeOrigin)
      if (started >= last.started + last.elapsed || started + entry.duration <= first.started)
        continue
      if (gc.length < 120) gc.push({ started, duration: entry.duration })
      else gcDropped++
    }
  }
  const observer = new PerformanceObserver((list) => collect(list.getEntries()))
  observer.observe({ entryTypes: ['gc'] })
  const dispose = () => observer.disconnect()
  return {
    sample(sample: number, component: number, started: number) {
      const data: Sample = { sample, component, started, elapsed: 0, cpu: null, phases: {} }
      samples.push(data)
      return measure(data, readCpu)
    },
    dispose,
    async report() {
      // GC notifications arrive after synchronous work; both turns are outside every sample.
      await new Promise<void>((resolve) => {
        setImmediate(() => setImmediate(resolve))
      })
      collect(observer.takeRecords())
      dispose()
      return {
        version: 1,
        pid: process.pid,
        threadId,
        timeOrigin: performance.timeOrigin,
        threadCpuSupported: !!readCpu,
        phaseUnits: ['wall milliseconds', 'thread user microseconds', 'thread system microseconds'],
        samples,
        gc,
        gcDropped,
      }
    },
  }
}
