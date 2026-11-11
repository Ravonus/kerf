import type { Browser, LaunchOptions as ChromeLaunch, Page } from 'playwright-core'
import type { ScenePoster } from '@kerf-js/veneer/scenes'

/** Pixels from the top, a section (index or id) at a share of its pass, or pixels past a section's top. */
export type Stop =
  | number
  | { readonly section: number | string; readonly at: number }
  | { readonly section: number | string; readonly px: number }

/** A page's sections in document order, in CSS px from the document's top. */
export interface SectionMap {
  readonly viewportHeight: number
  readonly documentHeight: number
  readonly sections: readonly {
    readonly index: number
    readonly id: string | null
    readonly top: number
    readonly height: number
  }[]
}

/** How Chrome is launched. Default: the installed Chrome, headless, on the GPU. */
export interface LaunchOptions {
  headless?: boolean
  channel?: string
  executablePath?: string
  /** Chrome's TMPDIR: keep it short, the singleton socket path has a length limit. */
  tmp?: string
}

/** What page to open and how the device looks. */
export interface PageOptions {
  url: string
  /** CSS px. Default 1440 × 900. */
  width?: number
  height?: number
  /** Default 1. */
  dpr?: number
  reduced?: boolean
  /** A phone: touch and a phone's user agent. */
  mobile?: boolean
  /** Slow the CPU by this factor. */
  cpu?: number
}

/** `capture`'s options. */
export interface CaptureOptions extends PageOptions, LaunchOptions {
  stops?: readonly Stop[]
  /** Where PNGs go; without it they are only returned. */
  out?: string
  /** The file name's prefix. Default `still`. */
  name?: string
  /** The CSS selector of a section. Default `section`. */
  sections?: string
  /** The clock time every stage freezes at; null leaves the clock running. Default 0. */
  seconds?: number | null
  /** An open browser to reuse; it stays open. */
  browser?: Browser
}

/** One still. */
export interface Still {
  readonly stop: Stop
  /** The scroll offset the page took. */
  readonly y: number
  readonly name: string
  readonly path: string | null
  readonly png: Buffer
  readonly bytes: number
  /** SHA-256 of the PNG: the same stop and seed on the same GPU give the same hash. */
  readonly hash: string
}

/** Sheet placement. */
export interface SheetLayout {
  readonly width: number
  readonly height: number
  readonly cells: readonly { readonly x: number; readonly y: number }[]
}

/** `sheet`'s options. */
export interface SheetOptions {
  /** Columns. Default: the nearest square. */
  cols?: number
  /** Each tile's width in px; its height keeps the first tile's aspect. Default 480 or narrower. */
  width?: number
  gap?: number
  /** A caption under each tile. */
  labels?: readonly string[]
  background?: string
}

/** `frames`' options. */
export interface FrameOptions {
  seconds?: number
  /** CSS px per second; 0 stands still. Default 600. */
  speed?: number
  cpu?: number
  /** Where the run starts, in px. Default 0. */
  from?: number
  /** `scroll` moves the page each frame; `wheel` sends wheel steps, so a smooth scroller runs. */
  driver?: 'scroll' | 'wheel'
}

/** Frame gaps summarised. */
export interface FrameStats {
  readonly count: number
  readonly p5Fps: number
  readonly medianMs: number
  readonly p95Ms: number
  readonly maxMs: number
  readonly over33: number
  readonly over33Share: number
  readonly over50: number
}

/** A baked still: a media record with its encoded size and how long it took. */
export type BakedStill = ScenePoster['desktop'] & { readonly bytes: number; readonly ms?: number }

/** What `bake` wrote into `posters.json`. */
export interface BakeManifest {
  readonly format: 'avif' | 'webp'
  readonly quality: number
  readonly seconds: number
  readonly ms: number
  readonly tiers: Record<string, { width: number; height: number; dpr: number }>
  /** By scene id, then tier. */
  readonly posters: Record<string, Record<string, BakedStill>>
}

/** `bake`'s options. */
export interface BakeOptions extends LaunchOptions {
  url: string
  out: string
  format?: 'avif' | 'webp'
  /** Encoder quality. Default AVIF 50, WebP 75. */
  quality?: number
  /** The clock time each still is drawn at. Default 0. */
  seconds?: number
  /** Sizes by tier name. Default `TIERS`. */
  tiers?: Record<string, { width: number; height: number; dpr: number }>
  browser?: Browser
}

/** The sizes a poster is drawn at by default: desktop 1440 × 900 at 1×, mobile 390 × 844 at 2×. */
export declare const TIERS: Record<
  'desktop' | 'mobile',
  { width: number; height: number; dpr: number }
>

/** Chrome's flags for drawing on the GPU headless on this platform. */
export declare function gpuArgs(platform?: NodeJS.Platform): string[]
/** Launches Chrome headless on the GPU. */
export declare function launch(options?: LaunchOptions & ChromeLaunch): Promise<Browser>
/** Opens a page at a device's size; errors land on `page.problems`. */
export declare function open(
  browser: Browser,
  options: PageOptions,
): Promise<Page & { problems: string[] }>
/** The GPU renderer WebGL reports, or null without WebGL2. */
export declare function gpuOf(page: Page): Promise<string | null>

/** The page's sections. */
export declare function sections(page: Page, selector?: string): Promise<SectionMap>
/** Waits for every stage to draw once, then freezes its clock at `seconds` (null: leave it). */
export declare function stageReady(
  page: Page,
  seconds?: number | null,
  timeout?: number,
): Promise<void>
/** Scrolls to `y` and waits for the page to settle; resolves with the offset taken. */
export declare function scrollAndSettle(page: Page, y: number, timeout?: number): Promise<number>

/** A stop from text: `1200`, `hero@0.5`, `2@0`, `hero+300`. */
export declare function parseStop(text: string | number): Stop
/** A stop's scroll offset on a page. */
export declare function resolveStop(stop: Stop, map: SectionMap): number
/** A stop as a file name part. */
export declare function stopName(stop: Stop): string

/** Stills at scroll stops. */
export declare function capture(options: CaptureOptions): Promise<{
  stills: Still[]
  map: SectionMap
  gpu: string | null
  problems: string[]
  browser: string
}>

/** Frame times while the page scrolls, with the machine's load. */
export declare function frames(
  page: Page,
  options?: FrameOptions,
): Promise<{
  seconds: number
  speed: number
  cpu: number
  driver: 'scroll' | 'wheel'
  scrolled: number
  frames: FrameStats
  longTasks: number
  longTaskMs: number
  load: { before: number; after: number }
  machine: { cpu: string; cores: number; platform: string }
  browser: string | null
  gpu: string | null
}>
/** Summarises frame gaps in ms. */
export declare function frameStats(gaps: readonly number[]): FrameStats

/** Where each tile of a sheet goes. */
export declare function sheetLayout(
  count: number,
  options: { tileWidth: number; tileHeight: number; cols?: number; gap?: number; label?: number },
): SheetLayout
/** Lays tiles on one PNG sheet, drawn in the browser. */
export declare function sheet(
  browser: Browser,
  tiles: readonly Uint8Array[],
  options?: SheetOptions,
): Promise<Buffer>

/** Bakes each `poster="bake"` scene of the stage at `url` into `out`. */
export declare function bake(options: BakeOptions): Promise<BakeManifest>

/** Serves a built folder on 127.0.0.1. */
export declare function serve(
  dir: string,
  port?: number,
): Promise<{ url: string; close(): Promise<void> }>
