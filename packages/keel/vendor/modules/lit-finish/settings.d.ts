export declare const TONEMAPS: readonly ["agx", "neutral", "aces"];
export type Tonemap = (typeof TONEMAPS)[number];
/** How a lit picture is finished. */
export interface FinishSettings {
    /** Multiplies the light before the tone map. */
    readonly exposure: number;
    readonly tonemap: Tonemap;
    /** Ambient occlusion strength, 0 (off) to 1. */
    readonly ao: number;
    /** How far round a point AO looks for what shades it, metres. */
    readonly aoRadius: number;
    /** Aerial haze: how much air there is per metre (0 none), and where it starts, metres from the eye. */
    readonly hazeDensity: number;
    readonly hazeStart: number;
    /** How bright the air glows toward the sun, 0 to 2. */
    readonly hazeGlow: number;
    /** After the tone map: saturation 0 to 2, contrast 0.5 to 2. */
    readonly saturation: number;
    readonly contrast: number;
    /** Lights lean warm and shadows cool, 0 to 1. */
    readonly warmth: number;
    /** Darkens the corners, 0 to 1. */
    readonly vignette: number;
    /** How much sunlight comes through leaves and blades, 0 to 2 (in their own shadow, none). */
    readonly translucency: number;
    /** Patches of drier and damper colour across every surface, 0 to 1. */
    readonly variation: number;
    /** Takes the saturation out of the stage's own colours before they are lit, 0 to 1 (a pixel palette is loud). */
    readonly mute: number;
    /** Glow round the brightest light, 0 to 1, from light brighter than `bloomThreshold` (after exposure). */
    readonly bloom: number;
    readonly bloomThreshold: number;
    /** Temporal antialiasing: each frame jittered and blended with the last, reprojected; `taaBlend` is the new share. */
    readonly taa: boolean;
    readonly taaBlend: number;
}
export declare const DEFAULT_FINISH_SETTINGS: FinishSettings;
/**
 * Normalizes untrusted settings into a complete finish. Anything missing or malformed falls back to the defaults;
 * anything out of range is held to it.
 *
 * @param input Plain settings object, or undefined.
 */
export declare function finishSettings(input?: unknown): FinishSettings;
export declare const AO_SAMPLES = 16;
/**
 * The AO kernel: points in the unit hemisphere round +z, cosine-weighted on a golden-angle spiral and gathered
 * toward the centre, so near occluders count most. The same every run.
 *
 * @param count How many points.
 * @returns x, y, z for each, flat.
 */
export declare function aoKernel(count?: number): number[];
/**
 * A world direction in the camera's space: the rotation of its view matrix (column-major, as keel/lit keeps it).
 *
 * @param direction World direction (need not be unit length).
 * @param view The camera's matrixWorldInverse elements.
 * @returns The unit direction in view space, or straight ahead for a zero direction.
 */
export declare function directionInView(direction: readonly number[], view: ArrayLike<number>): [number, number, number];
/**
 * A colour as linear RGB: "#rrggbb" (sRGB) or [r, g, b] already linear.
 *
 * @param value The colour.
 * @param fallback Used when the colour is malformed.
 */
export declare function linearColour(value: unknown, fallback: readonly [number, number, number]): [number, number, number];
/**
 * Two column-major 4x4 matrices multiplied, a then b applied last (a * b, as keel/lit's Matrix4.multiplyMatrices).
 *
 * @param a The left matrix.
 * @param b The right matrix.
 */
export declare function multiply4(a: ArrayLike<number>, b: ArrayLike<number>): number[];
/**
 * This frame's subpixel jitter for TAA: Halton (2, 3) over eight frames, in pixels, -0.5 to 0.5.
 *
 * @param frame The frame number.
 */
export declare function jitterAt(frame: number): [number, number];
/**
 * Whole pixels to move a 4x4 dither by this frame, so over sixteen frames every pixel meets every threshold and a
 * dithered fade averages, under TAA, to its real cover.
 *
 * @param frame The frame number.
 */
export declare function ditherShiftAt(frame: number): [number, number];
