import type { CameraLike, LitLike, RendererLike } from "./lit.js";
import type { FinishSettings } from "./settings.js";
/** The air a finish draws in: its colour ("#rrggbb" or linear RGB), how much per metre and where it starts. */
export interface Haze {
    readonly colour?: unknown;
    readonly density?: number;
    readonly start?: number;
}
export interface LitFinish {
    readonly settings: FinishSettings;
    setSettings(input?: unknown): FinishSettings;
    /** The canvas's CSS size and pixel ratio (the renderer's). */
    setSize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void;
    /** The sun's direction toward it, in world space, and its colour (linear; only its hue counts). */
    setSun(direction: readonly number[], colour?: unknown): void;
    /** The air's colour, and optionally its density and start, which override the settings'. */
    setHaze(haze: Haze): void;
    /** Dresses a stage's materials now (render does it every 30 frames for the scene it draws). */
    dress(root: unknown): void;
    /** Whole pixels a dithered fade should move by this frame, so TAA resolves it (0, 0 without TAA). */
    ditherOffset(): [number, number];
    render(scene: unknown, camera: CameraLike): void;
    /** What the canvas shows: the finished picture (default), or the AO alone, for tuning. */
    setView(view: "final" | "ao"): void;
    dispose(): void;
}
/**
 * Binds a lit finish to a renderer: AO, aerial haze, light through leaves, colour variation, TAA, bloom, a tone map
 * and a grade over a keel/lit stage. The renderer's own tone mapping should be "none"; the finish does its own.
 *
 * @param lit The keel/lit namespace (WebGL2).
 * @param renderer The renderer that owns the canvas.
 * @param input Settings, normalized through `finishSettings`.
 */
export declare function createLitFinish(lit: LitLike, renderer: RendererLike, input?: unknown): LitFinish;
