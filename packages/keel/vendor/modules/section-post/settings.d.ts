/** How the overlay looks when a frame does not say. Colours are display (sRGB) values: the pass follows the finish. */
export interface PostSettings {
    /** The noise texture's seed. */
    readonly seed: number;
    /** The paper's colour, "#rrggbb". */
    readonly colour: string;
    /** How torn the panel's edges are, 0 (straight) to 1. */
    readonly tear: number;
    /** The fibre line along a torn or straight edge: a lighter band of paper fibres, 0 to 1. */
    readonly fibre: number;
    /** The paper's own mottle, 0 to 1. */
    readonly paper: number;
    /** A soft shadow the panel casts past its edges onto the frame, 0 to 1. */
    readonly shadow: number;
    /** One-pixel grain over the whole frame, as a share of full luminance, 0 to 0.2. */
    readonly grain: number;
    /** How many times the noise repeats down the frame's height, 0.25 to 8. */
    readonly noiseScale: number;
    /** Give the frame's own target a depth buffer: needed when the frame drawn into it is a plain scene, not a finish. */
    readonly depth: boolean;
}
export declare const DEFAULT_POST_SETTINGS: PostSettings;
/** What a host feeds each frame, from its tracks. Every field is optional; the settings fill the rest. */
export interface PostValues {
    /**
     * The panel's sweep: 0 none; 0 → 1 its top edge rises from the frame's bottom to its top; 1 it covers the frame;
     * 1 → 2 its bottom edge rises after it, so it leaves through the top; 2 gone.
     */
    readonly progress?: number;
    /** Moves the panel's edges up (positive) or down, in frame heights, -1..1: a second track, a mobile one, say. */
    readonly position?: number;
    /** The paper's colour, [r, g, b] each 0..1 (display values). */
    readonly colour?: readonly [number, number, number];
    readonly tear?: number;
    readonly fibre?: number;
    readonly shadow?: number;
    readonly grain?: number;
    /** Darkens the frame under the panel, 0..1. */
    readonly darken?: number;
    /** Blurs the frame under the panel, 0..1: the outer taps reach `blur` × 16 % of the frame's height. */
    readonly blur?: number;
}
/** A frame's values, every one present and bounded. */
export interface Frame {
    readonly progress: number;
    readonly position: number;
    readonly colour: readonly [number, number, number];
    readonly tear: number;
    readonly fibre: number;
    readonly shadow: number;
    readonly grain: number;
    readonly darken: number;
    readonly blur: number;
}
/**
 * Settings from anything: each one checked and bounded, a missing or broken one falling back to its default.
 *
 * @param input A partial settings object, or nothing for the defaults.
 */
export declare function postSettings(input?: unknown): PostSettings;
/** "#rrggbb" to [r, g, b] in 0..1, unconverted: the pass works on display values. */
export declare function displayColour(value: string): [number, number, number];
/**
 * A frame's values, bounded, with the settings standing in for any left out.
 *
 * @param values What the host's tracks give this frame.
 * @param settings The overlay's settings.
 */
export declare function frameOf(values: PostValues, settings: PostSettings): Frame;
/** How far a torn edge can stray from its line, in frame heights, at `tear` 1. */
export declare const TEAR_REACH = 0.016;
/**
 * Where the panel's edges are this frame, in frame heights from the bottom (y up). Before progress 1 the panel is open
 * below and its top edge is the sweep; after it the panel is open above and its bottom edge is the sweep.
 *
 * @returns `[bottom, top]`.
 */
export declare function panelEdges(frame: Frame): [number, number];
/** Whether the panel, its shadow or its fibres show any of themselves in the frame. */
export declare function panelShows(frame: Frame): boolean;
/** Whether a frame needs the pass at all: no panel, no darkening, no blur and no grain draw straight to the host. */
export declare function idle(frame: Frame): boolean;
/** The blur's tap step in pixels of the half-size target, for a frame `height` pixels tall (half of it is blurred). */
export declare function blurStep(blur: number, height: number): number;
