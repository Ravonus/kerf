import type { ScreenId } from "./settings.js";
/** A screen's threshold at an art pixel, 0 to just under 1. The shader computes the same maps. */
export declare function thresholdAt(screen: ScreenId, x: number, y: number): number;
/** A screen's step for one channel: `levels` steps, and the threshold deciding where a tone between two lands. */
export interface ToneStep {
    readonly levels: number;
    readonly threshold: number;
}
/** One channel through a screen (see `ToneStep`); `amount` scales the threshold's pull and `snap` the band it holds. */
export declare function quantizeTone(value: number, step: ToneStep, amount?: number, snap?: number): number;
/** The stepped light a cel ramp of `bands` steps returns, darkest first (0..255). */
export declare function celRamp(bands: number): Uint8Array;
export declare function hexChannels(hex: string): readonly [number, number, number];
/** An sRGB colour (0..1) in OKLab: lightness, then green-red and blue-yellow. */
export declare function okLab(rgb: readonly [number, number, number]): [number, number, number];
/** A palette as the shader's flat vec3[32] (sRGB 0..1) and the same entries in OKLab, plus its length. */
export declare function paletteUniform(palette: readonly string[]): {
    readonly data: Float32Array;
    readonly lab: Float32Array;
    readonly size: number;
};
