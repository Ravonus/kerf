import type { FinishLike, LitLike, RendererLike } from "./lit.js";
import type { BlendSettings, Point } from "./settings.js";
/** A scene to draw: a stage and its camera (through the finish when there is one), or a function that draws it. */
export type Shot = {
    readonly scene: unknown;
    readonly camera: unknown;
} | (() => void);
/** How one frame of a hand-over looks. Every value is a plain number or point a host can feed from tracks. */
export interface DrawOptions {
    /** "noise" (default): a seeded noise threshold. "radial": out from `centre`. "fade": a plain dissolve. */
    readonly mode?: "noise" | "radial" | "fade";
    /** A radial reveal's centre, -1..1 each way with y up (a projected 3D point, say). The frame's centre by default. */
    readonly centre?: Point;
    /** The pointer, -1..1 each way with y up, or null when it is away. Pulls a radial centre toward it. */
    readonly pointer?: Point | null;
    /** Darkens the blended picture, 0..1. */
    readonly darken?: number;
    /** Overrides the line work from `blendLines(t)`: the incoming's and the outgoing's, each 0..1. */
    readonly lines?: {
        readonly in?: number;
        readonly out?: number;
    };
}
/**
 * The finishes a blend draws through: the main one, shared with the page, and optionally a second the blend sizes
 * itself at `scale`, for the less visible scene. A scaled finish may be set lighter (no bloom, say).
 */
export interface Finishes {
    readonly main: FinishLike;
    readonly scaled?: FinishLike;
}
export interface SceneBlend {
    readonly settings: BlendSettings;
    setSettings(input?: unknown): BlendSettings;
    /** The canvas's CSS size and pixel ratio (the renderer's, and the main finish's). Sizes the scaled finish too. */
    setSize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void;
    /**
     * Draws the hand-over from `a` (outgoing) to `b` (incoming) at `t` onto the renderer's current target.
     *
     * @returns The current scene: "a" before the switch at 0.5, "b" from it. Moving the active section is the host's.
     */
    draw(a: Shot, b: Shot, t: number, options?: DrawOptions): "a" | "b";
    dispose(): void;
}
/**
 * Binds a scene hand-over to a renderer: two scenes, each finished into its own half-float target, blended by a
 * seeded noise threshold or a radial reveal, the incoming arriving as line work and the outgoing leaving as it.
 *
 * @param lit The keel/lit namespace (WebGL2).
 * @param renderer The renderer that owns the canvas.
 * @param finish The finish each scene is drawn through (lit-finish's), a main and a scaled one, or null to draw plain.
 * @param input Settings, normalized through `blendSettings`.
 */
export declare function createSceneBlend(lit: LitLike, renderer: RendererLike, finish?: FinishLike | Finishes | null, input?: unknown): SceneBlend;
