import type { LitLike, RendererLike } from "./lit.js";
import type { PostSettings, PostValues } from "./settings.js";
/** lit-finish's shaders this pass reuses: pass the lit-finish namespace itself. */
export interface FinishShaders {
    /** A separable 9-tap Gaussian: `tBlur` sampled at this target's uv, `uDir` in its pixels, `uBloomSize` its size. */
    readonly BLUR_GLSL: string;
}
export interface SectionPost {
    readonly settings: PostSettings;
    setSettings(input?: unknown): PostSettings;
    /** The canvas's CSS size and pixel ratio (the renderer's). */
    setSize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void;
    /**
     * Draws a frame with the section's overlay onto the renderer's current target.
     *
     * @param draw Draws the frame onto the renderer's current target: `finish.render(...)` or `blend.draw(...)`.
     * @param values This frame's overlay values, from the host's tracks.
     */
    render(draw: () => void, values?: PostValues): void;
    dispose(): void;
}
/**
 * Binds the section pass to a renderer: a paper panel that sweeps in and out with a straight or torn edge and a fibre
 * line, darkening, blur and grain, over a finished frame. Every value is a plain number a host feeds from tracks.
 *
 * @param lit The keel/lit namespace (WebGL2).
 * @param renderer The renderer that owns the canvas.
 * @param shaders lit-finish's namespace, for its blur.
 * @param input Settings, normalized through `postSettings`.
 */
export declare function createSectionPost(lit: LitLike, renderer: RendererLike, shaders: FinishShaders, input?: unknown): SectionPost;
