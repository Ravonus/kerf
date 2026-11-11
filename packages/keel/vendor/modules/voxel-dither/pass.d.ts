import type { DitherSettings, PixelGrid } from "./settings.js";
import type { RaySpec } from "./light.js";
import type { CameraLike, LitLike, NodeLike, RendererLike } from "./lit.js";
import type { SignalPart, SignalSpec } from "./signals.js";
/** A live dithered-voxel look bound to one renderer. */
export interface VoxelDither {
    readonly settings: DitherSettings;
    readonly grid: PixelGrid;
    /** Replaces the look; returns the normalized settings. Call `shade` again if `shading` or `bands` changed. */
    setSettings(input?: unknown): DitherSettings;
    /**
     * Moves the near/mid and mid/far boundaries (view distances) without re-resolving the look; cheap enough per frame.
     */
    setDepthBands(near: number, far: number): void;
    /** Sizes the grid for a frame of this many CSS pixels. The renderer's canvas must already be that size. */
    setSize(cssWidth: number, cssHeight: number, devicePixelRatio: number): PixelGrid;
    /** Swaps every lit mesh material under `root` to the look's shading (cel toon ramps or the scene's own). */
    shade(root: NodeLike): void;
    /** Sets (or clears, with null) the light the god rays stream from; cheap enough per frame. */
    setRays(rays: RaySpec | null): void;
    /** Sets the clock, in seconds, that rolls the scanlines and times glitch bursts; cheap enough per frame. */
    setTime(seconds: number): void;
    /**
     * Tags every opaque mesh material under `root` as one part, so that part can
     * carry its own signal. Call it again after `shade`, which swaps materials.
     */
    tagSignal(root: NodeLike, part: SignalPart): void;
    /** Sets the signal of parts 1 to 3 (null for none), on top of the look's own whole-frame settings. */
    setSignals(parts: readonly (SignalSpec | null | undefined)[]): void;
    /**
     * Draws everything under `root` on the detail grid (see `detail`), over the
     * world by depth. Meshes added under it later are picked up each frame.
     */
    tagDetail(root: NodeLike): void;
    /** Draws `scene` from `camera` through the look into the renderer's current target. */
    render(scene: unknown, camera: CameraLike): void;
    dispose(): void;
}
/**
 * Binds a dithered-voxel look to a renderer.
 *
 * @param lit The keel/lit namespace (WebGL2).
 * @param renderer The WebGLRenderer that owns the canvas.
 * @param input Settings, normalized through `ditherSettings`.
 */
export declare function createVoxelDither(lit: LitLike, renderer: RendererLike, input?: unknown): VoxelDither;
