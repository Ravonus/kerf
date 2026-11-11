/** How a hand-over looks. Colours are display (sRGB) values: the blend works on finished pictures. */
export interface BlendSettings {
    /** The noise texture's seed. */
    readonly seed: number;
    /** The line work's colour, "#rrggbb". */
    readonly lineColour: string;
    /** How strong the line work is, 0 to 1. */
    readonly lines: number;
    /** The luma step that makes a line, 0.01 to 1: lower draws more lines. */
    readonly edge: number;
    /** How soft the reveal's boundary is, as a share of the noise's range, 0 to 0.3. */
    readonly soft: number;
    /** The seam's glow colour, "#rrggbb". */
    readonly seamColour: string;
    /** How bright the seam glows along the boundary, 0 (none) to 4. */
    readonly glow: number;
    /** The seam's width, as a share of the noise's range, 0 to 0.3. */
    readonly seam: number;
    /** How many times the noise repeats down the frame's height, 0.25 to 8. */
    readonly noiseScale: number;
    /** How far the pointer pulls a radial reveal's centre, 0 to 1. */
    readonly pull: number;
    /**
     * The scale the less visible scene is drawn at, 0.25 to 1 (quality's `blendScale`). It takes a scaled finish, or no
     * finish; with only the main finish both scenes are drawn whole.
     */
    readonly scale: number;
}
export declare const DEFAULT_BLEND_SETTINGS: BlendSettings;
/**
 * Settings from anything: each one checked and bounded, a missing or broken one falling back to its default.
 *
 * @param input A partial settings object, or nothing for the defaults.
 */
export declare function blendSettings(input?: unknown): BlendSettings;
/** "#rrggbb" to [r, g, b] in 0..1, unconverted: the blend mixes display values. */
export declare function displayColour(value: string): [number, number, number];
/**
 * The line work each scene carries at `t`. The incoming's lines are full at 0, half at the switch and gone by 0.9;
 * the outgoing's start at the switch and are full at 1.
 *
 * @returns `[incoming, outgoing]`, each 0..1.
 */
export declare function blendLines(t: number): [number, number];
/** How far the incoming's fill has come at `t`, 0..1: it starts at 0.25 and covers everything at 1. */
export declare function blendFill(t: number): number;
/** The less visible scene at `t`, where a lower scale shows least: the incoming ("b") before 0.5, then the outgoing. */
export declare function minorAt(t: number): "a" | "b";
/** The current scene at `t`: the outgoing ("a") before the switch at 0.5, the incoming ("b") from it. */
export declare function currentAt(t: number): "a" | "b";
/** A point in -1..1 each way with y up, as both a centre and a pointer are given. */
export interface Point {
    readonly x: number;
    readonly y: number;
}
/**
 * A radial reveal's centre: the host's point (a projected 3D point, say) pulled toward the pointer by `pull`.
 *
 * @returns The centre in 0..1 texture space, y up.
 */
export declare function radialCentre(centre: Point, pointer: Point | null, pull: number): [number, number];
/** The distance from a centre (0..1 texture space) to the farthest corner, measured in frame heights. */
export declare function farthestCorner(centre: readonly [number, number], aspect: number): number;
